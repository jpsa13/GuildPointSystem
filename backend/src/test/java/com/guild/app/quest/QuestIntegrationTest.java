package com.guild.app.quest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.quest.dto.QuestDtos.*;
import com.guild.app.quest.service.QuestService;
import com.guild.app.websocket.WebSocketAuthInterceptor;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

@SpringBootTest(properties={"guild.quests.simulation-enabled=true","guild.quests.live-enabled=true"})
@AutoConfigureMockMvc
@ActiveProfiles({"test","quests-local"})
@Transactional
class QuestIntegrationTest {
    @Autowired QuestService service;
    @Autowired MemberRepository members;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired MockMvc mvc;
    @Autowired WebSocketAuthInterceptor sockets;
    @Autowired com.guild.app.quest.service.QuestCatalog catalog;
    long memberId, otherId;
    Pairing pairing;
    @BeforeEach void setup() {
        memberId=createMember(); otherId=createMember(); authenticate(memberId);
        pairing=service.pair(new PairRequest("replay-0.1"));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    long createMember() {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,'MEMBRO','APROVADO',true) RETURNING id",
            Long.class,"Quest test "+UUID.randomUUID());
    }
    UsernamePasswordAuthenticationToken auth(long id) {
        var p=new MemberPrincipal(members.findById(id).orElseThrow());
        return new UsernamePasswordAuthenticationToken(p,null,p.getAuthorities());
    }
    void authenticate(long id) { SecurityContextHolder.getContext().setAuthentication(auth(id)); }
    Event event(UUID run, int seq, State state, int slot) {
        return new Event(UUID.randomUUID(),run,seq,Instant.parse("2026-10-23T23:00:00Z").plusSeconds(seq),"Q071356","[3h] Ore",
            "8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379",
            "fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98",
            "0d1df9a6f52f3984cd6248b833da423856268627ec112413404753e5f4aa4831",1,1,slot,state);
    }
    @Test void duplicateRetryAndLegitimateRepeat() {
        var run=UUID.randomUUID();
        var batch=new Batch(List.of(event(run,0,State.PRESENT,8),event(run,1,State.COMPLETION_SIGNAL,111),event(run,2,State.REMOVED_UNKNOWN,111)));
        assertEquals(3,service.ingest(pairing.token(),batch).get("accepted"));
        assertEquals(3,service.ingest(pairing.token(),batch).get("duplicates"));
        var second=UUID.randomUUID();
        service.ingest(pairing.token(),new Batch(List.of(event(second,0,State.PRESENT,8),event(second,1,State.COMPLETION_SIGNAL,111))));
        var history=service.history(LocalDate.of(2026,10,23),true,0);
        assertEquals(2,history.events().stream().filter(e->e.event().state()==State.COMPLETION_SIGNAL).count());
        assertFalse(history.hasMore());
        assertEquals("SIMULATION",history.events().getFirst().source());
    }
    @Test void removedDoesNotBecomeCompletion() {
        var run=UUID.randomUUID(); service.ingest(pairing.token(),new Batch(List.of(event(run,0,State.PRESENT,8),event(run,1,State.REMOVED_UNKNOWN,8))));
        assertEquals(0,service.history(LocalDate.of(2026,10,23),true,0).events().stream().filter(e->e.event().state()==State.COMPLETION_SIGNAL).count());
    }
    @Test void privateHistoryAndRevocationOwnership() {
        service.ingest(pairing.token(),new Batch(List.of(event(UUID.randomUUID(),0,State.PRESENT,8))));
        authenticate(otherId);
        assertTrue(service.history(LocalDate.of(2026,10,23),true,0).events().isEmpty());
        assertTrue(service.history(LocalDate.of(2026,10,23),true,0).sessions().isEmpty());
        service.revoke(pairing.sessionId());
        assertNull(jdbc.queryForObject("SELECT revoked_at FROM quest_monitor_session WHERE id=?",java.sql.Timestamp.class,pairing.sessionId()));
        authenticate(memberId); service.revoke(pairing.sessionId());
        assertThrows(RuntimeException.class,()->service.ingest(pairing.token(),new Batch(List.of(event(UUID.randomUUID(),0,State.PRESENT,8)))));
    }
    @Test void invalidSequenceAndIdsCannotChangeContent() {
        var run=UUID.randomUUID(); var first=event(run,0,State.PRESENT,8);
        assertThrows(RuntimeException.class,()->service.ingest(pairing.token(),new Batch(List.of(first,event(run,2,State.COMPLETION_SIGNAL,111)))));
        var changed=new Event(first.eventId(),first.runId(),first.sequence(),first.occurredAt(),first.code(),"changed",first.clientHash(),first.edfHash(),first.definitionHash(),1,1,8,State.PRESENT);
        assertThrows(RuntimeException.class,()->service.ingest(pairing.token(),new Batch(List.of(changed))));
    }
    @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void failedBatchRollsBackAndCanBeRetried() {
        var run=UUID.randomUUID(); var first=event(run,0,State.PRESENT,8);
        assertThrows(RuntimeException.class,()->service.ingest(pairing.token(),new Batch(List.of(first,event(run,2,State.COMPLETION_SIGNAL,111)))));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM quest_observation WHERE session_id=?",Integer.class,pairing.sessionId()));
        assertEquals(1,service.ingest(pairing.token(),new Batch(List.of(first))).get("accepted"));
        service.revoke(pairing.sessionId());
    }
    @Test void requestValidationAndAnonymousReads() throws Exception {
        mvc.perform(get("/api/quests?day=2026-10-23")).andExpect(status().isOk());
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/quests?day=2026-10-23").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/quests/ingest").header("X-Quest-Token",pairing.token()).contentType("application/json").content("{\"events\":[]}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/quests?day=2026-10-23&memberId="+memberId).with(authentication(auth(otherId))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.memberId").value(otherId)).andExpect(jsonPath("$.events").isEmpty());
    }
    @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentRetriesAreSerialized() throws Exception {
        var batch=new Batch(List.of(event(UUID.randomUUID(),0,State.PRESENT,8)));
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var a=executor.submit(()->service.ingest(pairing.token(),batch));
            var b=executor.submit(()->service.ingest(pairing.token(),batch));
            assertEquals(1,a.get(10,java.util.concurrent.TimeUnit.SECONDS).get("accepted")+b.get(10,java.util.concurrent.TimeUnit.SECONDS).get("accepted"));
        } finally { executor.shutdownNow(); service.revoke(pairing.sessionId()); }
    }
    @Test void expiryStatusAndDefaultGate() {
        jdbc.update("UPDATE quest_monitor_session SET expires_at=now()-interval '1 second' WHERE id=?",pairing.sessionId());
        assertThrows(RuntimeException.class,()->service.ingest(pairing.token(),new Batch(List.of(event(UUID.randomUUID(),0,State.PRESENT,8)))));
        var disabled=new QuestService(null,null,null,new org.springframework.mock.env.MockEnvironment(),true,true,null,null,null);
        assertThrows(RuntimeException.class,()->disabled.pair(new PairRequest("test")));
    }
    @Test void activeSessionLimit() {
        for(int i=0;i<4;i++) service.pair(new PairRequest("test"));
        assertThrows(RuntimeException.class,()->service.pair(new PairRequest("test")));
    }
    @Test void privateWebSocketRejectsOtherMembersAndWildcards() {
        for(String path:List.of("/topic/quests/member/"+otherId,"/topic/quests/**","/topic/quests/member/*","/topic/**","/**")) {
            var headers=StompHeaderAccessor.create(StompCommand.SUBSCRIBE); headers.setDestination(path); headers.setUser(auth(memberId));
            headers.setLeaveMutable(true);
            assertThrows(IllegalStateException.class,()->sockets.preSend(MessageBuilder.createMessage(new byte[0],headers.getMessageHeaders()),null));
        }
        var own=StompHeaderAccessor.create(StompCommand.SUBSCRIBE); own.setDestination("/topic/quests/member/"+memberId); own.setUser(auth(memberId)); own.setLeaveMutable(true);
        assertNotNull(sockets.preSend(MessageBuilder.createMessage(new byte[0],own.getMessageHeaders()),null));
    }
    @Test void resetBoundaryAndInvalidTransitions() {
        assertEquals(Instant.parse("2026-10-23T06:00:00Z"),QuestService.periodStart(LocalDate.of(2026,10,23),true));
        assertEquals(Instant.parse("2026-10-23T03:00:00Z"),QuestService.periodStart(LocalDate.of(2026,10,23),false));
        var run=UUID.randomUUID(); var present=event(run,0,State.PRESENT,8);
        assertThrows(RuntimeException.class,()->QuestService.validateTransition(present,event(run,1,State.COMPLETION_SIGNAL,103),Instant.now()));
        assertThrows(RuntimeException.class,()->QuestService.validateTransition(null,event(run,1,State.COMPLETION_SIGNAL,111),Instant.now()));
        assertDoesNotThrow(()->QuestService.validateTransition(present,event(run,1,State.COMPLETION_SIGNAL,111),Instant.now()));
    }
    PlayerSample sample(String name,String epoch,long sequence) {
        return new PlayerSample(sequence,Instant.now(),SampleStatus.OBSERVED,name,51,epoch,55,java.math.BigDecimal.ZERO,List.of());
    }
    @Test void liveStatsArePrivateAndIdentityCannotChange() {
        var pair=service.pairLive(new LivePairRequest("local-0.2","meow"));
        var sample=sample("meow","a".repeat(64),0);
        assertEquals(0,service.ingestLive(pair.token(),new LiveBatch(sample,List.of())).get("accepted"));
        var own=service.history(LocalDate.now(),true,0).player();
        assertEquals("meow",own.sample().name()); assertEquals(55,own.sample().level());
        assertEquals(0,own.sample().xpPercent().compareTo(java.math.BigDecimal.ZERO));
        assertThrows(RuntimeException.class,()->service.ingestLive(pair.token(),new LiveBatch(sample("another","a".repeat(64),1),List.of())));
        assertThrows(RuntimeException.class,()->service.ingestLive(pair.token(),new LiveBatch(sample("meow","b".repeat(64),1),List.of())));
        authenticate(otherId); assertNull(service.history(LocalDate.now(),true,0).player());
    }
    @Test void sourceScopesAndSampleRetryAreValidated() {
        var pair=service.pairLive(new LivePairRequest("local-0.2","meow"));
        var sample=sample("meow","a".repeat(64),0);
        service.ingestLive(pair.token(),new LiveBatch(sample,List.of()));
        assertEquals(0,service.ingestLive(pair.token(),new LiveBatch(sample,List.of())).get("accepted"));
        assertThrows(RuntimeException.class,()->service.ingestLive(pairing.token(),new LiveBatch(sample,List.of())));
        assertThrows(RuntimeException.class,()->service.ingest(pair.token(),new Batch(List.of(event(UUID.randomUUID(),0,State.PRESENT,8)))));
        assertThrows(RuntimeException.class,()->service.ingestLive(pair.token(),new LiveBatch(sample("meow","a".repeat(64),0),List.of())));
    }
    @Test void liveDefinitionAndEventRetry() {
        var pair=service.pairLive(new LivePairRequest("local-0.2","meow"));
        var run=UUID.randomUUID(); var raw=event(run,0,State.PRESENT,8); var definition=catalog.find(raw.definitionHash());
        var event=new Event(raw.eventId(),run,0,raw.occurredAt(),raw.code(),definition.title(),raw.clientHash(),raw.edfHash(),raw.definitionHash(),1,1,8,State.PRESENT);
        var batch=new LiveBatch(sample("meow","a".repeat(64),0),List.of(event));
        assertEquals(1,service.ingestLive(pair.token(),batch).get("accepted"));
        assertEquals(1,service.ingestLive(pair.token(),batch).get("duplicates"));
        assertEquals("LOCAL_MONITOR",service.history(LocalDate.of(2026,10,23),true,0).events().getFirst().source());
        var bad=new QuestBrief("Q999999","a".repeat(64),"unverified",1,1,8);
        var p=sample("meow","a".repeat(64),1);
        assertThrows(RuntimeException.class,()->service.ingestLive(pair.token(),new LiveBatch(new PlayerSample(p.sequence(),p.sampledAt(),p.status(),p.name(),p.serial(),p.identityEpoch(),p.level(),p.xpPercent(),List.of(bad)),List.of())));
    }
    @Test void couponDefinitionsObjectivesAndAdminVisibility() {
        // Transactional fixtures roll back, preserving the administrator's saved selection.
        jdbc.update("DELETE FROM quest_catalog_visibility");
        assertEquals(15,service.history(LocalDate.of(2026,10,23),true,0).expected().size());
        var selectedHash=catalog.coupons.quests().stream().filter(q->q.quest().code().equals("Q071396")).findFirst().orElseThrow().quest().definitionHash();
        assertThrows(RuntimeException.class,()->service.visibility(selectedHash,new VisibilityRequest(true)));
        var m=members.findById(memberId).orElseThrow(); m.setRole(com.guild.app.common.enums.Role.ADMINISTRADOR); members.saveAndFlush(m);
        authenticate(memberId);
        var history=service.history(LocalDate.of(2026,10,23),true,0);
        assertEquals(63,history.expected().size());
        assertEquals(List.of(30,30,0,1,2),history.npcCoverage().stream().map(NpcCoverage::questCount).toList());
        assertTrue(history.expected().stream().allMatch(row->!row.definition().objectives().isEmpty() && row.completionSignals()==0));
        assertTrue(history.expected().stream().allMatch(row->row.definition().races().equals(List.of(1))));
        var codes=history.expected().stream().map(row->row.definition().quest().code()).collect(java.util.stream.Collectors.toSet());
        assertTrue(codes.containsAll(Set.of("Q071382","Q070944","Q070947","Q071450","Q071396")));
        assertFalse(codes.contains("Q071449")); assertFalse(codes.contains("Q071451"));
        assertEquals(List.of("04121"),history.expected().stream().filter(row->row.definition().quest().code().equals("Q071382")).findFirst().orElseThrow().definition().npcCodes());
        service.visibility(selectedHash,new VisibilityRequest(true));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='QUEST_CATALOG_UPDATED' AND actor_id=?",Integer.class,memberId));
        authenticate(otherId);
        assertEquals(14,service.history(LocalDate.of(2026,10,23),true,0).expected().size());
        authenticate(memberId);
        var hiddenHash=history.expected().stream().filter(ExpectedQuest::hidden).findFirst().orElseThrow().definition().quest().definitionHash();
        service.visibility(hiddenHash,new VisibilityRequest(false));
        authenticate(otherId);
        assertEquals(15,service.history(LocalDate.of(2026,10,23),true,0).expected().size());
        assertTrue(service.history(LocalDate.of(2026,10,23),true,0).expected().stream().anyMatch(q->q.definition().quest().definitionHash().equals(hiddenHash)));
    }
    @Test void rePairRevokesPreviousMonitorAndUnknownStateIsNotCompletion() {
        var first=service.pairLive(new LivePairRequest("local-0.2","meow"));
        service.pairLive(new LivePairRequest("local-0.2","meow"));
        assertThrows(RuntimeException.class,()->service.ingestLive(first.token(),new LiveBatch(sample("meow","a".repeat(64),0),List.of())));
        var run=UUID.randomUUID();
        assertDoesNotThrow(()->QuestService.validateTransition(event(run,0,State.PRESENT,8),event(run,1,State.STATE_CHANGED,111),Instant.now()));
    }
    Event easyEvent(UUID run,int sequence,State state,int slot) {
        var base=event(run,sequence,state,slot);
        var hash="94e3b2f4d52c89ef506e66ba5404deaec370d85a7a48f695ab96ab76dba66177";
        return new Event(base.eventId(),run,sequence,base.occurredAt(),"Q071396",catalog.find(hash).title(),base.clientHash(),base.edfHash(),hash,1,1,slot,state);
    }
    @Test void easyDeliveryCountsOriginalObservationWithoutRewritingIt() {
        var pair=service.pairLive(new LivePairRequest("local-0.2","meow"));
        var run=UUID.randomUUID();
        var changed=easyEvent(run,1,State.STATE_CHANGED,111);
        var batch=new LiveBatch(sample("meow","a".repeat(64),0),List.of(easyEvent(run,0,State.PRESENT,8),changed));
        service.ingestLive(pair.token(),batch);
        service.ingestLive(pair.token(),batch);
        var history=service.history(LocalDate.of(2026,10,23),true,0);
        assertEquals(1,history.expected().stream().filter(q->q.definition().quest().code().equals("Q071396")).findFirst().orElseThrow().completionSignals());
        assertEquals(State.STATE_CHANGED,history.events().getLast().event().state());
        assertEquals(0,service.history(LocalDate.of(2026,10,24),true,0).expected().stream().filter(q->q.definition().quest().code().equals("Q071396")).findFirst().orElseThrow().completionSignals());
        var future=UUID.randomUUID();
        assertDoesNotThrow(()->QuestService.validateTransition(easyEvent(future,0,State.PRESENT,8),easyEvent(future,1,State.COMPLETION_SIGNAL,111),Instant.now()));
        assertThrows(RuntimeException.class,()->QuestService.validateTransition(easyEvent(future,0,State.PRESENT,8),easyEvent(future,1,State.COMPLETION_SIGNAL,110),Instant.now()));
        authenticate(otherId);
        assertTrue(service.history(LocalDate.of(2026,10,23),true,0).expected().stream().allMatch(q->q.completionSignals()==0));
    }
}
