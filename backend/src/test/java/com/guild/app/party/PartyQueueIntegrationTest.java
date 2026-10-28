package com.guild.app.party;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.PartyMap;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.dto.*;
import com.guild.app.party.service.PartyService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
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
class PartyQueueIntegrationTest {
    @Autowired PartyService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired MemberRepository members;
    @Autowired MockMvc mvc;
    long admin,a,b,c;
    Instant since=Instant.parse("2026-10-28T10:00:00Z");
    long member(String role) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete,points) VALUES(?,?,'APROVADO',true,123) RETURNING id",
            Long.class,"Queue "+UUID.randomUUID(),role);
    }
    MemberPrincipal principal(long id) { return new MemberPrincipal(members.findById(id).orElseThrow()); }
    UsernamePasswordAuthenticationToken auth(long id) {
        var p=principal(id); return new UsernamePasswordAuthenticationToken(p,null,p.getAuthorities());
    }
    @BeforeEach void setup() {
        admin=member("ADMINISTRADOR");a=member("MEMBRO");b=member("MEMBRO");c=member("MEMBRO");
        SecurityContextHolder.getContext().setAuthentication(auth(admin));
        for(long id:List.of(a,b,c)) jdbc.update("INSERT INTO party_lfg(member_id,created_at) VALUES(?,?)",id,java.sql.Timestamp.from(since));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void change(long id,int delta) { service.adjustQueuePriority(id,new AdjustPartyPriorityRequest(delta),principal(admin)); }
    int points(long id) { return jdbc.queryForObject("SELECT party_priority_points FROM member WHERE id=?",Integer.class,id); }
    List<Long> order() {
        return service.getPublicSnapshot().lfg().stream().map(PartyLfgEntry::memberId).filter(id->List.of(a,b,c).contains(id)).toList();
    }
    @Test void migrationPreservesExistingWaitsAndTheirOrder() throws Exception {
        jdbc.execute("CREATE SCHEMA queue_migration_test");
        jdbc.execute("SET LOCAL search_path TO queue_migration_test");
        try {
            jdbc.execute("CREATE TABLE member(id BIGINT PRIMARY KEY)");
            jdbc.execute("CREATE TABLE party_lfg(member_id BIGINT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL)");
            jdbc.execute("INSERT INTO party_lfg VALUES(1,'2026-10-28T12:00Z'),(2,'2026-10-28T10:00Z'),(3,'2026-10-28T10:00Z')");
            var migration=new org.springframework.core.io.ClassPathResource("db/migration/V77__party_queue_priority.sql");
            jdbc.execute(migration.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertEquals(List.of(2L,3L,1L),jdbc.queryForList("SELECT member_id FROM party_lfg ORDER BY queue_order",Long.class));
            assertEquals(Instant.parse("2026-10-28T10:00:00Z"),jdbc.queryForObject("SELECT created_at FROM party_lfg WHERE member_id=2",java.sql.Timestamp.class).toInstant());
            jdbc.execute("INSERT INTO party_lfg(member_id,created_at) VALUES(4,now())");
            assertEquals(4L,jdbc.queryForObject("SELECT queue_order FROM party_lfg WHERE member_id=4",Long.class));
        } finally { jdbc.execute("SET LOCAL search_path TO public"); }
    }
    @Test void unansweredMovesToEndOfEqualPointsWithoutResettingTimeOrPoints() {
        change(a,1);change(b,1);
        assertEquals(List.of(a,b,c),order());
        var result=service.markQueueUnanswered(a,principal(admin));
        assertEquals(List.of(b,a,c),order());
        var moved=result.lfg().stream().filter(e->e.memberId()==a).findFirst().orElseThrow();
        assertEquals(since,moved.createdAt());assertNotNull(moved.lastUnansweredAt());assertEquals(1,moved.priorityPoints());
        service.markQueueUnanswered(b,principal(admin));
        assertEquals(List.of(a,b,c),order());
        assertEquals(123,jdbc.queryForObject("SELECT points FROM member WHERE id=?",Integer.class,a));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE actor_id=? AND type='PARTY_QUEUE_UPDATED' AND payload->>'action'='UNANSWERED'",Integer.class,admin));
    }
    @Test void pointsChangePriorityAndCannotBecomeNegativeOrAcceptOtherDeltas() throws Exception {
        mvc.perform(post("/api/parties/lfg/"+c+"/priority").with(authentication(auth(admin))).contentType("application/json").content("{\"delta\":1}"))
            .andExpect(status().isOk());
        assertEquals(List.of(c,a,b),order());
        change(c,-1);assertEquals(List.of(a,b,c),order());
        for(int delta:List.of(-1,0,2))
            mvc.perform(post("/api/parties/lfg/"+c+"/priority").with(authentication(auth(admin))).contentType("application/json").content("{\"delta\":"+delta+"}"))
                .andExpect(status().isBadRequest());
        assertEquals(0,points(c));
    }
    @Test void onlyAdminsCanOperateAndMissingQueueMembersAreRejected() throws Exception {
        long moderator=member("MODERADOR");
        for(long actor:List.of(a,moderator)) {
            mvc.perform(post("/api/parties/lfg/"+a+"/priority").with(authentication(auth(actor))).contentType("application/json").content("{\"delta\":1}"))
                .andExpect(status().isForbidden());
            mvc.perform(post("/api/parties/lfg/"+a+"/unanswered").with(authentication(auth(actor))))
                .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/parties/lfg/"+a+"/unanswered").with(anonymous())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/parties/lfg/"+admin+"/unanswered").with(authentication(auth(admin)))).andExpect(status().isBadRequest());
        assertEquals(List.of(a,b,c),order());assertEquals(0,points(a));
    }
    @Test void leavingQueuePreservesPointsButJoiningAnyPartyResetsThem() {
        change(a,1);change(b,1);change(c,1);
        service.leaveLfg(principal(a));
        assertEquals(1,points(a));
        service.upsertLfg(new UpsertLfgRequest(null),principal(a));
        assertEquals(List.of(b,c,a),order());assertEquals(1,points(a));
        var board=service.createParty(new CreatePartyRequest(PartyMap.ELAN,"Queue test"),principal(a));
        long party=board.my().partyId();assertEquals(0,points(a));
        service.addMemberDirect(party,new AddPartyMemberRequest(b),principal(admin));assertEquals(0,points(b));
        service.leave(party,principal(b));
        var returned=service.getBoard(principal(b)).my().lfg();
        assertEquals(0,returned.priorityPoints());assertNull(returned.lastUnansweredAt());
        service.createPartyForMember(new CreatePartyForMemberRequest(PartyMap.ELAN,c),principal(admin));
        assertEquals(0,points(c));
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='PARTY_QUEUE_UPDATED' AND payload->>'action'='RESET' AND target_id IN (?,?,?)",Integer.class,a,b,c));
    }
    @Test void acceptingAJoinRequestAndAssemblingPartyResetPriority() {
        var board=service.createParty(new CreatePartyRequest(PartyMap.ELAN,"Queue test"),principal(a));
        long party=board.my().partyId();change(b,1);
        service.requestJoin(party,principal(b));
        long pending=jdbc.queryForObject("SELECT id FROM party_pending WHERE party_id=? AND initiator_id=? AND status='PENDING'",Long.class,party,b);
        service.acceptPending(pending,principal(a));assertEquals(0,points(b));
        change(c,1);
        service.assembleParty(new AssemblePartyRequest(PartyMap.ELAN,c,List.of(c)),principal(admin));
        assertEquals(0,points(c));
    }
}
