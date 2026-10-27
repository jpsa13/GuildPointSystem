package com.guild.app.party;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.exception.AppException;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.service.PartyGameInviteService;
import com.guild.app.websocket.WebSocketPublisher;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.lang.reflect.Field;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PartyGameInviteTest {
    @Autowired PartyGameInviteService service;
    @Autowired MemberRepository members;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean WebSocketPublisher ws;
    long leaderId, memberA, memberB, pendingId, outsiderId, adminId, partyId;
    String leaderNick, nickA, nickB;
    Instant now = Instant.parse("2026-10-27T13:00:00Z");

    long member(String nick, String role, String status) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,?,?,true) RETURNING id",
            Long.class, nick, role, status);
    }
    static String nick(String prefix) { return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 8); }
    MemberPrincipal as(long id) { return new MemberPrincipal(members.findById(id).orElseThrow()); }
    void at(Instant instant) throws Exception {
        Field f = PartyGameInviteService.class.getDeclaredField("clock"); f.setAccessible(true);
        f.set(org.springframework.test.util.AopTestUtils.getTargetObject(service), Clock.fixed(instant, ZoneOffset.UTC));
    }

    @BeforeEach void setup() throws Exception {
        leaderNick = nick("Lead"); nickA = nick("Mia"); nickB = nick("Tofu");
        leaderId = member(leaderNick, "MEMBRO", "APROVADO");
        memberA = member(nickA, "MEMBRO", "APROVADO");
        memberB = member(nickB, "MEMBRO", "APROVADO");
        pendingId = member(nick("Pend"), "MEMBRO", "PENDENTE");
        outsiderId = member(nick("Out"), "MEMBRO", "APROVADO");
        adminId = member(nick("Adm"), "ADMINISTRADOR", "APROVADO");
        partyId = jdbc.queryForObject("INSERT INTO party(map,leader_id) VALUES('CAULDRON',?) RETURNING id", Long.class, leaderId);
        for (long id : new long[]{leaderId, memberA, memberB, pendingId})
            jdbc.update("INSERT INTO party_member(party_id,member_id) VALUES(?,?)", partyId, id);
        at(now);
    }
    @AfterEach void resetClock() throws Exception { at(Instant.now()); }

    @Test void leaderCreatesInviteForEligibleMembersOnly() {
        var view = service.start(partyId, as(leaderId));
        assertEquals("WAITING", view.state());
        assertEquals(leaderNick, view.leader());
        assertEquals(Set.of(nickA, nickB), new HashSet<>(view.nicks()));
        assertEquals(1, view.skipped().size());
        assertEquals(now.plusSeconds(120), view.expiresAt());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='PARTY_GAME_INVITE' AND target_id=?", Integer.class, leaderId));
    }
    @Test void onlyLeaderOrAdministratorCanCall() {
        assertThrows(AppException.class, () -> service.start(partyId, as(memberA)));
        assertThrows(AppException.class, () -> service.start(partyId, as(outsiderId)));
        assertEquals(leaderNick, service.start(partyId, as(adminId)).leader());
    }
    @Test void pendingIsDeliveredOnceToTheLeaderCharacterAndThenCompleted() {
        var created = service.start(partyId, as(leaderId));
        assertTrue(service.pending(nickA).isEmpty());
        var delivered = service.pending(leaderNick.toLowerCase()).orElseThrow();
        assertEquals(created.id(), delivered.id());
        assertEquals(Set.of(nickA, nickB), new HashSet<>(delivered.nicks()));
        assertTrue(service.pending(leaderNick).isEmpty());
        assertEquals("DELIVERED", service.current(partyId, as(memberA)).state());
        assertFalse(service.done(created.id(), nickA));
        assertTrue(service.done(created.id(), leaderNick));
        assertFalse(service.done(created.id(), leaderNick));
        assertEquals("COMPLETE", service.current(partyId, as(leaderId)).state());
    }
    @Test void completedInviteNotifiesEachInvitedMemberOnce() {
        var created = service.start(partyId, as(leaderId));
        service.pending(leaderNick);
        verify(ws, never()).publishPartyMemberNotice(anyLong(), any());
        service.done(created.id(), leaderNick);
        service.done(created.id(), leaderNick);
        for (long id : new long[]{memberA, memberB})
            verify(ws).publishPartyMemberNotice(eq(id), argThat(n -> n instanceof PartyGameInviteService.InviteNotice m
                && m.type().equals("PARTY_GAME_INVITE") && m.partyId().equals(partyId) && m.inviteId().equals(created.id())));
        verify(ws, never()).publishPartyMemberNotice(eq(leaderId), any());
        verify(ws, never()).publishPartyMemberNotice(eq(pendingId), any());
    }
    @Test void expiredInvitesAreNeverDelivered() throws Exception {
        service.start(partyId, as(leaderId));
        at(now.plusSeconds(121));
        assertTrue(service.pending(leaderNick).isEmpty());
        assertEquals("EXPIRED", service.current(partyId, as(leaderId)).state());
    }
    @Test void waitingInviteAndCooldownBlockRepeatedCalls() throws Exception {
        service.start(partyId, as(leaderId));
        assertThrows(AppException.class, () -> service.start(partyId, as(leaderId)));
        service.pending(leaderNick);
        at(now.plusSeconds(10));
        assertThrows(AppException.class, () -> service.start(partyId, as(leaderId)));
        at(now.plusSeconds(31));
        var again = service.start(partyId, as(leaderId));
        assertEquals("WAITING", again.state());
        assertEquals(again.id(), service.pending(leaderNick).orElseThrow().id());
    }
    @Test void partyWithoutOtherEligibleMembersIsRejected() {
        jdbc.update("DELETE FROM party_member WHERE member_id IN (?,?)", memberA, memberB);
        assertThrows(AppException.class, () -> service.start(partyId, as(leaderId)));
    }
    @Test void dllEndpointsArePublicAndDeliverOnce() throws Exception {
        var created = service.start(partyId, as(leaderId));
        mvc.perform(get("/api/party-invites/pending").param("character", leaderNick))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(created.id().toString()))
            .andExpect(jsonPath("$.nicks.length()").value(2));
        mvc.perform(get("/api/party-invites/pending").param("character", leaderNick)).andExpect(status().isNoContent());
        mvc.perform(post("/api/party-invites/" + created.id() + "/done").param("character", nickA)).andExpect(status().isNotFound());
        mvc.perform(post("/api/party-invites/" + created.id() + "/done").param("character", leaderNick)).andExpect(status().isNoContent());
        mvc.perform(post("/api/parties/" + partyId + "/game-invite")).andExpect(status().isUnauthorized());
    }
}
