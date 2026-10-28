package com.guild.app.party;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.PartyMap;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.dto.*;
import com.guild.app.party.repository.PartyMemberRepository;
import com.guild.app.party.service.PartyService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PartyAfkIntegrationTest {
    @Autowired PartyService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired MemberRepository members;
    @Autowired PartyMemberRepository roster;
    @Autowired EntityManager entities;
    @Autowired MockMvc mvc;
    long admin,leader,player,outsider,party;
    long member(String role) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete,points) VALUES(?,?,'APROVADO',true,120) RETURNING id",
            Long.class,"AFK "+UUID.randomUUID(),role);
    }
    MemberPrincipal principal(long id) { return new MemberPrincipal(members.findById(id).orElseThrow()); }
    UsernamePasswordAuthenticationToken auth(long id) {
        var p=principal(id);return new UsernamePasswordAuthenticationToken(p,null,p.getAuthorities());
    }
    @BeforeEach void setup() {
        admin=member("ADMINISTRADOR");leader=member("MEMBRO");player=member("MEMBRO");outsider=member("MEMBRO");
        party=service.createParty(new CreatePartyRequest(PartyMap.ELAN,"AFK test"),principal(leader)).my().partyId();
        service.addMemberDirect(party,new AddPartyMemberRequest(player),principal(admin));
        service.upsertLfg(new UpsertLfgRequest(null),principal(outsider));
    }
    Instant start(long id) {
        service.setAfk(id,new PartyAfkRequest(true),principal(id));
        return roster.findByMemberId(id).orElseThrow().getAfkUntil();
    }
    PartyLfgEntry waiting(long id) { return service.getBoard(principal(id)).my().lfg(); }
    @Test void startsFor15MinutesWithoutExtendingOnRepeatedRequestsAndAllowsEarlyReturn() {
        Instant before=Instant.now();
        Instant until=start(player);
        assertFalse(until.isBefore(before.plusSeconds(900)));
        assertFalse(until.isAfter(Instant.now().plusSeconds(900)));
        service.setAfk(player,new PartyAfkRequest(true),principal(player));
        assertEquals(until,roster.findByMemberId(player).orElseThrow().getAfkUntil());
        service.setAfk(player,new PartyAfkRequest(false),principal(player));
        assertNull(roster.findByMemberId(player).orElseThrow().getAfkUntil());
        service.expireAfk(until.plusSeconds(1));
        assertTrue(roster.findByMemberId(player).isPresent());assertNull(waiting(player));
    }
    @Test void expirationUsesPersistedDeadlineAtTheBoundaryAndMovesToTheEndExactlyOnce() {
        Instant until=start(player);
        entities.flush();entities.clear();
        until=roster.findByMemberId(player).orElseThrow().getAfkUntil();
        service.expireAfk(until.minusMillis(1));
        assertTrue(roster.findByMemberId(player).isPresent());
        service.expireAfk(until);
        assertTrue(roster.findByMemberId(player).isEmpty());
        var entry=waiting(player);
        assertEquals(until,entry.afkSince());assertEquals(0,entry.priorityPoints());
        var queue=service.getPublicSnapshot().lfg();
        assertEquals(player,queue.getLast().memberId());
        service.expireAfk(until.plusSeconds(60));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE target_id=? AND payload->>'action'='AFK_EXPIRED'",Integer.class,player));
        assertEquals(120,jdbc.queryForObject("SELECT points FROM member WHERE id=?",Integer.class,player));
        service.setAfk(player,new PartyAfkRequest(false),principal(player));
        assertNull(waiting(player).afkSince());assertEquals(entry.queueOrder(),waiting(player).queueOrder());
        assertTrue(roster.findByMemberId(player).isEmpty());
    }
    @Test void leaderExpirationTransfersLeadershipAndLastMemberExpirationRemovesEmptyParty() {
        service.expireAfk(start(leader).plusMillis(1));
        assertEquals(player,service.getBoard(principal(player)).parties().stream().filter(p->p.id()==party).findFirst().orElseThrow().leaderId());
        service.expireAfk(start(player).plusMillis(1));
        assertTrue(service.getPublicSnapshot().parties().stream().noneMatch(p->p.id()==party));
        assertNotNull(waiting(leader).afkSince());assertNotNull(waiting(player).afkSince());
    }
    @Test void onlySelfPartyLeaderAndAdminsCanChangeAfkAndLateCancellationCannotEvadeExpiry() throws Exception {
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(outsider)))
            .contentType("application/json").content("{\"active\":true}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(leader)))
            .contentType("application/json").content("{\"active\":true}")).andExpect(status().isOk());
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(admin)))
            .contentType("application/json").content("{\"active\":false}")).andExpect(status().isOk());
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(anonymous())
            .contentType("application/json").content("{\"active\":true}")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(player)))
            .contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        var row=roster.findByMemberId(player).orElseThrow();
        row.setAfkUntil(Instant.now().minusSeconds(1));roster.saveAndFlush(row);
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(player)))
            .contentType("application/json").content("{\"active\":false}")).andExpect(status().isConflict());
        service.expireAfk(Instant.now());assertNotNull(waiting(player).afkSince());
        mvc.perform(put("/api/parties/members/"+player+"/afk").with(authentication(auth(outsider)))
            .contentType("application/json").content("{\"active\":false}")).andExpect(status().isForbidden());
    }
    @Test void movingBetweenPartiesPreservesTheDeadline() {
        Instant until=start(player);
        long destination=service.createParty(new CreatePartyRequest(PartyMap.ELAN,"Other"),principal(outsider)).my().partyId();
        service.moveMember(destination,new MovePartyMemberRequest(player,party),principal(admin));
        assertEquals(until,roster.findByMemberId(player).orElseThrow().getAfkUntil());
        service.expireAfk(until.plusMillis(1));
        assertTrue(roster.findByMemberId(player).isEmpty());assertNotNull(waiting(player).afkSince());
        assertEquals(party,roster.findByMemberId(leader).orElseThrow().getPartyId());
    }
}
