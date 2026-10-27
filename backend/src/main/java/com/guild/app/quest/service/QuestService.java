package com.guild.app.quest.service;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.quest.dto.QuestDtos.*;
import com.guild.app.quest.repository.QuestRepository;
import com.guild.app.websocket.WebSocketPublisher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class QuestService {
    private final QuestRepository repository;
    private final MemberRepository members;
    private final WebSocketPublisher publisher;
    private final boolean simulationEnabled;
    private final boolean liveEnabled;
    private final QuestCatalog catalog;
    private final AuditLogService audit;
    private final QuestStatusService questStatus;
    public QuestService(QuestRepository repository, MemberRepository members, WebSocketPublisher publisher,
                        Environment environment, @Value("${guild.quests.simulation-enabled:false}") boolean enabled,
                        @Value("${guild.quests.live-enabled:false}") boolean live,QuestCatalog catalog,AuditLogService audit,
                        QuestStatusService questStatus) {
        this.repository=repository; this.members=members; this.publisher=publisher;
        simulationEnabled=enabled && environment.acceptsProfiles(Profiles.of("quests-local"));
        liveEnabled=live && environment.acceptsProfiles(Profiles.of("quests-local"));
        this.catalog=catalog;
        this.audit=audit;
        this.questStatus=questStatus;
    }
    private Member member(long id) {
        var member=members.findById(id).orElseThrow(()->error("Não autorizado.",HttpStatus.FORBIDDEN));
        if(member.getStatus()!=MemberStatus.APROVADO || !member.isProfileComplete() || member.getDeletedAt()!=null)
            throw error("Não autorizado.",HttpStatus.FORBIDDEN);
        return member;
    }
    private long actor() { return member(SecurityUtils.currentMember().getId()).getId(); }
    private void requireSimulation() {
        if(!simulationEnabled) throw error("Envio real indisponível. Simulação local desabilitada.",HttpStatus.FORBIDDEN);
    }
    public History history(LocalDate day, boolean resetPeriod, long offset) {
        var id=actor();
        if(offset<0 || offset>1000000) throw error("Página inválida.",HttpStatus.BAD_REQUEST);
        var events=repository.history(id,periodStart(day,resetPeriod),periodStart(day.plusDays(1),resetPeriod),offset);
        boolean more=events.size()>500;
        var visibility=repository.visibility(); boolean admin=member(id).getRole().isAtLeast(Role.ADMINISTRADOR);
        var signals=repository.signals(id,periodStart(day,resetPeriod),periodStart(day.plusDays(1),resetPeriod));
        var expected=catalog.coupons.quests().stream()
            .map(row->new ExpectedQuest(row,signals.getOrDefault(row.quest().code(),0L),catalog.hidden(row.quest(),visibility)))
            .filter(row->admin||!row.hidden()).toList();
        var player=repository.player(id);
        // Native status remains a fallback for display; journal disappearance never checks off a quest.
        if(player==null) player=questStatus.playerStatus(member(id)).orElse(null);
        return new History(id,simulationEnabled,repository.sessions(id),events.stream().limit(500).toList(),more,offset+Math.min(500,events.size()),liveEnabled,player,expected,catalog.coupons.npcs());
    }
    public static Instant periodStart(LocalDate day, boolean resetPeriod) {
        return day.atTime(resetPeriod?3:0,0).atZone(ZoneId.of("America/Sao_Paulo")).toInstant();
    }
    @Transactional public Pairing pair(PairRequest request) {
        requireSimulation(); return createPair(request.monitorVersion(),actor());
    }
    @Transactional public Pairing pairLive(LivePairRequest request) {
        requireLive(); var pair=createPair(request.monitorVersion(),actor());
        repository.makeLive(pair.sessionId(),request.expectedName());
        repository.revokeOtherLive(actor(),pair.sessionId()); return pair;
    }
    private Pairing createPair(String version,long id) {
        members.findByIdForUpdate(id).orElseThrow();
        if(repository.activeSessions(id)>=5) throw error("Revogue uma sessão antes de criar outra.",HttpStatus.CONFLICT);
        byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes);
        String token=HexFormat.of().formatHex(bytes);
        var session=UUID.randomUUID(); var expires=Instant.now().plus(Duration.ofHours(24));
        repository.create(session,id,hash(token),version,expires);
        publisher.publishQuestChanged(id);
        return new Pairing(session,token,expires);
    }
    @Transactional public void revoke(UUID id) {
        var owner=actor(); repository.revoke(owner,id); publisher.publishQuestChanged(owner);
    }
    @Transactional public Map<String,Integer> ingest(String token, Batch batch) {
        requireSimulation();
        var owner=owner(token);
        if(!repository.liveOwner(owner.sessionId()).source().equals("SIMULATION")) throw error("Origem inválida.",HttpStatus.FORBIDDEN);
        return acceptEvents(owner,batch.events());
    }
    private QuestRepository.Owner owner(String token) {
        if(token==null || !token.matches("[a-f0-9]{64}")) throw error("Pareamento inválido.",HttpStatus.UNAUTHORIZED);
        var owner=repository.lock(hash(token));
        if(owner==null || owner.revokedAt()!=null || !owner.expiresAt().isAfter(Instant.now()))
            throw error("Pareamento expirado ou revogado.",HttpStatus.UNAUTHORIZED);
        member(owner.memberId()); return owner;
    }
    private Map<String,Integer> acceptEvents(QuestRepository.Owner owner,List<Event> events) {
        int inserted=0;
        for(var event:events) {
            var existing=repository.existing(owner.sessionId(),event.eventId());
            if(existing!=null) {
                if(!existing.equals(event)) throw error("Identificador reutilizado com outros dados.",HttpStatus.CONFLICT);
                continue;
            }
            validateTransition(repository.previous(owner.sessionId(),event.runId()),event,Instant.now());
            repository.insert(owner.sessionId(),event); inserted++;
        }
        repository.received(owner.sessionId()); publisher.publishQuestChanged(owner.memberId());
        return Map.of("accepted",inserted,"duplicates",events.size()-inserted);
    }
    private void requireLive() { if(!liveEnabled) throw error("Monitor local real desabilitado.",HttpStatus.FORBIDDEN); }
    @Transactional public Map<String,Integer> ingestLive(String token,LiveBatch batch) {
        requireLive(); var owner=owner(token); var live=repository.liveOwner(owner.sessionId()); var sample=batch.sample();
        if(!live.source().equals("LOCAL_MONITOR") || !live.expectedName().equals(sample.name()) ||
            (live.epoch()!=null && (!live.epoch().equals(sample.identityEpoch()) || live.serial()!=sample.serial())))
            throw error("Personagem ou conexão mudou. Faça um novo pareamento.",HttpStatus.FORBIDDEN);
        if(sample.sampledAt().isBefore(Instant.now().minus(Duration.ofHours(24))) || sample.sampledAt().isAfter(Instant.now().plusSeconds(60)))
            throw error("Leitura fora da janela permitida.",HttpStatus.BAD_REQUEST);
        if(live.sequence()!=null && (sample.sequence()<live.sequence() ||
            (sample.sequence()==live.sequence() && !sample.equals(live.sample())) || sample.sampledAt().isBefore(live.sample().sampledAt())))
            throw error("Sequência de leitura inválida.",HttpStatus.CONFLICT);
        if(sample.status()==SampleStatus.UNAVAILABLE && (!sample.quests().isEmpty() || !batch.events().isEmpty()))
            throw error("Leitura indisponível não pode informar quests.",HttpStatus.BAD_REQUEST);
        for(var quest:sample.quests()) requireDefinition(quest.code(),quest.definitionHash(),quest.title());
        for(var event:batch.events()) {
            requireDefinition(event.code(),event.definitionHash(),event.title());
            if(!catalog.matchesContext(event.clientHash(),event.edfHash(),event.code(),event.definitionHash(),event.title()) || event.occurredAt().isAfter(sample.sampledAt()))
                throw error("Contexto da definição inválido.",HttpStatus.BAD_REQUEST);
        }
        var result=acceptEvents(owner,batch.events()); repository.sample(owner.sessionId(),sample); return result;
    }
    private void requireDefinition(String code,String hash,String title) {
        if(!catalog.matches(code,hash,title))
            throw error("Definição não reconhecida para este build.",HttpStatus.BAD_REQUEST);
    }
    @Transactional public void visibility(String hash,VisibilityRequest request) {
        var actor=member(actor());
        if(!actor.getRole().isAtLeast(Role.ADMINISTRADOR)) throw error("Apenas administradores podem revisar a lista.",HttpStatus.FORBIDDEN);
        if(!catalog.daily(hash)) throw error("Quest não encontrada na lista dos NPCs.",HttpStatus.BAD_REQUEST);
        repository.visibility(actor.getId(),hash,request.hidden());
        audit.log(AuditLogType.QUEST_CATALOG_UPDATED,actor,null,Map.of("code",catalog.find(hash).code(),"hidden",request.hidden()));
        publisher.publishQuestCatalogChanged();
    }
    public static void validateTransition(Event previous, Event event, Instant now) {
        if(event.occurredAt().isAfter(now.plusSeconds(300)) || event.occurredAt().isBefore(Instant.parse("2020-01-01T00:00:00Z")))
            throw error("Instante inválido.",HttpStatus.BAD_REQUEST);
        if(previous==null) {
            if(event.sequence()!=0 || event.state()!=State.PRESENT) throw error("Execução precisa iniciar com presença.",HttpStatus.CONFLICT);
            return;
        }
        if(event.sequence()!=previous.sequence()+1 || event.occurredAt().isBefore(previous.occurredAt()) ||
            !event.code().equals(previous.code()) || !event.clientHash().equals(previous.clientHash()) ||
            !event.edfHash().equals(previous.edfHash()) || !event.definitionHash().equals(previous.definitionHash()) ||
            event.group()!=previous.group() || event.type()!=previous.type() || previous.state()==State.REMOVED_UNKNOWN)
            throw error("Continuidade de execução inválida. Reinicie com outra execução.",HttpStatus.CONFLICT);
        if(event.state()==State.COMPLETION_SIGNAL) {
            boolean legacy=event.clientHash().equals("8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379") &&
                event.edfHash().equals("fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98") &&
                event.definitionHash().equals(Map.of(
                    "Q082000","8ff9cb699fa6dd13d37cbec6cdbb2334bc1774ea8c9579efad5c3ecc2ad6472d",
                    "Q082010","011cef16f49fbee284b90ff0117633a0be15d943165cfec7b16c928dfe4a0a86",
                    "Q071356","0d1df9a6f52f3984cd6248b833da423856268627ec112413404753e5f4aa4831",
                    "Q071396","94e3b2f4d52c89ef506e66ba5404deaec370d85a7a48f695ab96ab76dba66177").get(event.code())) &&
                (Set.of("Q071356","Q071396").contains(event.code()) ? event.group()==1 && event.type()==1 : event.group()==0 && event.type()==0);
            if(previous.state()!=State.PRESENT || previous.slot()>=103 || event.slot()-previous.slot()!=103 ||
                !(legacy || QuestCatalog.supportsCurrentCompletion(event)))
                throw error("Sinal de conclusão não validado para este caso.",HttpStatus.BAD_REQUEST);
        } else if(event.state()!=State.REMOVED_UNKNOWN && event.state()!=State.STATE_CHANGED) {
            throw error("Transição não suportada.",HttpStatus.CONFLICT);
        }
    }
    private static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static AppException error(String message,HttpStatus status) { return new AppException(message,status); }
}
