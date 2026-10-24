package com.guild.app.party.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.discord.PartyDiscordGateway;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.entity.*;
import com.guild.app.party.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PartyDiscordCallServiceTest {
    PartyRepository parties=mock(PartyRepository.class);
    PartyMemberRepository roster=mock(PartyMemberRepository.class);
    PartyDiscordCallRepository calls=mock(PartyDiscordCallRepository.class);
    MemberRepository members=mock(MemberRepository.class);
    PartyDiscordGateway discord=mock(PartyDiscordGateway.class);
    AuditLogService audit=mock(AuditLogService.class);
    PlatformTransactionManager transactions=mock(PlatformTransactionManager.class);
    PartyDiscordCallService service;
    PartyDiscordCall stored;
    Member leader, other;
    Party party;
    Instant begin=Instant.parse("2026-10-23T15:00:00Z");

    @BeforeEach void setup() throws Exception {
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service=new PartyDiscordCallService(parties,roster,calls,members,discord,audit,transactions);
        at(0);
        leader=member(1); other=member(2);
        party=new Party(); party.setId(7L); party.setLeader(leader); party.setMap(PartyMap.ETHER);
        when(parties.findByIdForUpdate(7L)).thenReturn(Optional.of(party));
        when(parties.existsById(7L)).thenReturn(true);
        when(parties.findByMapOrderByCreatedAtAsc(PartyMap.ETHER)).thenReturn(List.of(party));
        when(calls.lock(7L)).thenAnswer(i->Optional.ofNullable(stored));
        when(calls.save(any())).thenAnswer(i->{stored=i.getArgument(0);return stored;});
        when(discord.channelId()).thenReturn("77777777777777777");
        when(discord.confirmations(anyString(),anyList())).thenReturn(Set.of());
        when(discord.send(anyString(),anyString(),anyInt(),anySet())).thenAnswer(i->"1000000000000000"+i.getArgument(2));
        when(roster.findByPartyIdInWithMember(List.of(7L))).thenReturn(List.of(entry(leader),entry(other)));
    }
    Member member(long id) {
        Member m=new Member(); m.setId(id); m.setNickname("Player "+id); m.setStatus(MemberStatus.APROVADO);
        m.setProfileComplete(true); m.setDiscordId("2000000000000000"+id);
        when(members.findById(id)).thenReturn(Optional.of(m)); return m;
    }
    PartyMember entry(Member m) { var e=new PartyMember(); e.setMember(m);return e; }
    void at(int seconds) { service.clock=Clock.fixed(begin.plusSeconds(seconds),ZoneOffset.UTC); }
    void start() {service.start(7L,new MemberPrincipal(leader));}

    @Test void sendsOnlyAtZero150And300Seconds() throws Exception {
        start(); service.process(7L);
        at(149); service.process(7L); assertEquals(1,stored.getSent());
        at(150); service.process(7L); assertEquals(2,stored.getSent());
        at(299); service.process(7L); assertEquals(2,stored.getSent());
        at(300); service.process(7L); service.process(7L);
        at(450); service.process(7L);
        assertEquals(3,stored.getSent()); assertEquals("COMPLETE",stored.getState());
        verify(discord,times(3)).send(anyString(),anyString(),anyInt(),eq(Set.of(leader.getDiscordId(),other.getDiscordId())));
    }
    @Test void checkOnEarlierMessageStopsOnlyThatMemberAndIsLatched() throws Exception {
        start(); service.process(7L);
        String message=stored.getMessages().getFirst();
        when(calls.findMessage(eq(stored.getChannelId()),anyString())).thenReturn(List.of(7L));
        service.confirmed(new PartyDiscordGateway.Checkmark(stored.getChannelId(),message,leader.getDiscordId()));
        service.confirmed(new PartyDiscordGateway.Checkmark(stored.getChannelId(),message,"99999999999999999"));
        assertEquals(Set.of(leader.getDiscordId()),stored.getConfirmed());
        at(150); service.process(7L);
        at(300); service.process(7L);
        verify(discord).send(anyString(),anyString(),eq(2),eq(Set.of(other.getDiscordId())));
        verify(discord).send(anyString(),anyString(),eq(3),eq(Set.of(other.getDiscordId())));
    }
    @Test void restReconciliationRecoversMissedReactionsAndStopsEarly() throws Exception {
        start(); service.process(7L);
        when(discord.confirmations(anyString(),anyList())).thenReturn(Set.of(leader.getDiscordId(),other.getDiscordId()));
        at(150); service.process(7L);
        assertEquals("COMPLETE",stored.getState()); assertEquals(1,stored.getSent());
        assertThrows(AppException.class,this::start);
        at(301); start(); assertEquals(0,stored.getSent()); assertTrue(stored.getConfirmed().isEmpty());
    }
    @Test void departureDoesNotCallReplacementAndDissolutionCancels() throws Exception {
        start(); service.process(7L);
        var replacement=member(3);
        when(roster.findByPartyIdInWithMember(List.of(7L))).thenReturn(List.of(entry(leader),entry(replacement)));
        at(150); service.process(7L);
        verify(discord).send(anyString(),anyString(),eq(2),eq(Set.of(leader.getDiscordId())));
        assertTrue(stored.getSkipped().contains(other.getNickname()));
        when(parties.existsById(7L)).thenReturn(false);
        at(300); service.process(7L);
        assertEquals("CANCELLED",stored.getState()); assertEquals(2,stored.getSent());
    }
    @Test void rejectsNonLeaderSuspendedAndDuplicateRounds() {
        assertThrows(AppException.class,()->service.start(7L,new MemberPrincipal(other)));
        leader.setSuspendedAt(begin); assertThrows(AppException.class,this::start);
        leader.setSuspendedAt(null); start(); assertThrows(AppException.class,this::start);
        at(300); stored.setState("SENDING"); assertThrows(AppException.class,this::start);
    }
    @Test void uncertainSendNeverAutomaticallyRetries() throws Exception {
        start(); when(discord.send(anyString(),anyString(),anyInt(),anySet())).thenThrow(new java.util.concurrent.TimeoutException());
        service.process(7L); at(150); service.process(7L);
        assertEquals("FAILED",stored.getState());
        verify(discord,times(1)).send(anyString(),anyString(),anyInt(),anySet());
    }
    @Test void restartDoesNotReplayUncertainOrExpiredSend() throws Exception {
        start(); stored.setState("SENDING"); at(91); service.process(7L);
        assertEquals("FAILED",stored.getState());
        verify(discord,never()).send(anyString(),anyString(),anyInt(),anySet());
        at(301); start(); at(332); service.process(7L);
        assertEquals("FAILED",stored.getState());
        verify(discord,never()).send(anyString(),anyString(),anyInt(),anySet());
    }
    @Test void seedFailureKeepsSentMessageAndStopsRound() throws Exception {
        start(); doThrow(new IllegalStateException()).when(discord).seedCheckmark(anyString(),anyString());
        service.process(7L);
        assertEquals(1,stored.getSent()); assertEquals(1,stored.getMessages().size());
        assertEquals("FAILED",stored.getState());
    }
    @Test void missingDiscordLinkIsReportedAndNoEmptyRoundIsCreated() {
        other.setDiscordId(null); start(); assertEquals(List.of(other.getNickname()),stored.getSkipped());
        assertEquals(1,stored.getRecipients().size());
        at(301); stored.setState("COMPLETE"); leader.setDiscordId(null);
        assertThrows(AppException.class,this::start);
    }
}
