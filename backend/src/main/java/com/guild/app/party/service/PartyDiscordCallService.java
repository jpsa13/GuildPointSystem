package com.guild.app.party.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.discord.PartyDiscordGateway;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.entity.PartyDiscordCall;
import com.guild.app.party.entity.PartyDiscordCall.Recipient;
import com.guild.app.party.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Service @RequiredArgsConstructor
public class PartyDiscordCallService {
    private final PartyRepository parties;
    private final PartyMemberRepository roster;
    private final PartyDiscordCallRepository calls;
    private final MemberRepository members;
    private final PartyDiscordGateway discord;
    private final AuditLogService audit;
    private final PlatformTransactionManager transactions;
    Clock clock=Clock.systemUTC();
    public record CallView(Long partyId,UUID runId,String state,int sent,List<String> confirmed,
        List<String> pending,List<String> skipped,Instant nextAt,Instant endsAt,String messageUrl,String error) {}
    public record Board(boolean available,String reason,List<CallView> calls) {}
    private record Work(Long partyId,UUID runId,String channel,String label,int sent,List<String> messages) {}
    private <T> T tx(Supplier<T> action) { return new TransactionTemplate(transactions).execute(s->action.get()); }
    private Member approved(MemberPrincipal actor) {
        var member=members.findById(actor.getId()).orElseThrow(()->new AppException("Membro não encontrado",HttpStatus.NOT_FOUND));
        if(member.getStatus()!=MemberStatus.APROVADO || !member.isProfileComplete() || member.getDeletedAt()!=null || member.getSuspendedAt()!=null)
            throw new AppException("Acesso negado",HttpStatus.FORBIDDEN);
        return member;
    }
    public Board board(MemberPrincipal actor) {
        return tx(()->{
            approved(actor);
            String reason=discord.unavailable();
            return new Board(reason==null,reason,calls.findAll().stream().map(this::view).toList());
        });
    }
    public CallView start(Long id,MemberPrincipal actor) {
        return tx(()->{
            Member member=approved(actor);
            var party=parties.findByIdForUpdate(id).orElseThrow(()->new AppException("PT não encontrada",HttpStatus.NOT_FOUND));
            if(!member.getRole().isAtLeast(Role.ADMINISTRADOR) && (party.getLeader()==null || !party.getLeader().getId().equals(member.getId())))
                throw new AppException("Apenas o líder desta PT ou um organizador pode chamá-la.",HttpStatus.FORBIDDEN);
            String reason=discord.unavailable();
            if(reason!=null) throw new AppException(reason,HttpStatus.SERVICE_UNAVAILABLE);
            Instant now=clock.instant();
            var old=calls.lock(id);
            if(old.isPresent() && (now.isBefore(old.get().getStartedAt().plusSeconds(300))
                    || Set.of("WAITING","SENDING").contains(old.get().getState())))
                throw new AppException("Aguarde o fim dos cinco minutos desta rodada.",HttpStatus.CONFLICT);
            var entries=roster.findByPartyIdInWithMember(List.of(id));
            var recipients=new ArrayList<Recipient>(); var skipped=new ArrayList<String>();
            for(var entry:entries) {
                var m=entry.getMember();
                if(eligible(m) && m.getDiscordId()!=null && m.getDiscordId().matches("[0-9]{17,20}"))
                    recipients.add(new Recipient(m.getId(),m.getDiscordId(),m.getNickname()));
                else skipped.add(m.getNickname());
            }
            if(recipients.isEmpty()) throw new AppException("Nenhum integrante desta PT tem Discord vinculado e cadastro ativo.",HttpStatus.BAD_REQUEST);
            var ordered=parties.findByMapOrderByCreatedAtAsc(party.getMap());
            int number=1;
            for(var p:ordered) { if(p.getId().equals(id))break; number++; }
            var call=old.orElseGet(PartyDiscordCall::new);
            call.setPartyId(id); call.setRunId(UUID.randomUUID()); call.setActorId(member.getId());
            String label="PT "+number+" · "+party.getMap()+(party.getSpot()==null?"":" · "+party.getSpot());
            call.setLabel(label); call.setChannelId(discord.channelId()); call.setStartedAt(now); call.setNextAt(now);
            call.setState("WAITING"); call.setSent(0); call.setError(null);
            call.setRecipients(recipients); call.setConfirmed(new HashSet<>()); call.setMessages(new ArrayList<>()); call.setSkipped(skipped);
            calls.save(call);
            audit.log(AuditLogType.PARTY_DISCORD_CALLED,member,null,Map.of("partyId",id,"party",label,"runId",call.getRunId().toString()));
            return view(call);
        });
    }
    private boolean eligible(Member member) {
        return member.getStatus()==MemberStatus.APROVADO && member.isProfileComplete()
            && member.getDeletedAt()==null && member.getSuspendedAt()==null;
    }
    @EventListener
    public void confirmed(PartyDiscordGateway.Checkmark check) {
        if(!check.messageId().matches("[0-9]{1,20}"))return;
        for(Long id:calls.findMessage(check.channelId(),"[\""+check.messageId()+"\"]")) tx(()->{
            calls.lock(id).ifPresent(call->{
                if(call.getChannelId().equals(check.channelId()) && call.getMessages().contains(check.messageId()) &&
                    call.getRecipients().stream().anyMatch(r->r.discordId().equals(check.userId()))) {
                    call.getConfirmed().add(check.userId());
                    if(call.getState().equals("WAITING") && pending(call).isEmpty()) call.setState("COMPLETE");
                }
            }); return null;
        });
    }
    @Scheduled(fixedDelay=1000)
    public void tick() {
        for(Long id:calls.activeIds()) process(id);
    }
    void process(Long id) {
        Work work=tx(()->{
            var call=calls.lock(id).orElse(null);
            if(call==null)return null;
            Instant now=clock.instant();
            if(call.getState().equals("SENDING")) {
                if(now.isAfter(call.getNextAt().plusSeconds(90))) fail(call,"Envio interrompido. Confira o Discord antes de iniciar outra rodada.");
                return null;
            }
            if(!call.getState().equals("WAITING") || now.isBefore(call.getNextAt()))return null;
            if(now.isAfter(call.getNextAt().plusSeconds(30))) {
                fail(call,"Rodada interrompida por atraso do servidor; lembretes antigos não foram enviados."); return null;
            }
            call.setState("SENDING");
            return new Work(id,call.getRunId(),call.getChannelId(),call.getLabel(),call.getSent(),List.copyOf(call.getMessages()));
        });
        if(work==null)return;
        try {
            Set<String> confirmed=discord.confirmations(work.channel(),work.messages());
            Set<String> targets=tx(()->{
                var call=current(work); if(call==null)return Set.<String>of();
                if(!parties.existsById(id)) {call.setState("CANCELLED");return Set.<String>of();}
                call.getConfirmed().addAll(confirmed);
                var current=roster.findByPartyIdInWithMember(List.of(id)).stream().map(e->e.getMember())
                    .filter(this::eligible).collect(Collectors.toMap(Member::getId,m->m));
                call.getRecipients().removeIf(r->{
                    var member=current.get(r.memberId());
                    if(member!=null && r.discordId().equals(member.getDiscordId()))return false;
                    call.getSkipped().add(r.nickname()); return true;
                });
                var remaining=pending(call);
                if(remaining.isEmpty())call.setState("COMPLETE");
                return remaining;
            });
            if(targets==null || targets.isEmpty())return;
            String messageId=discord.send(work.channel(),work.label(),work.sent()+1,targets);
            tx(()->{
                var call=current(work);
                if(call!=null) {call.getMessages().add(messageId);call.setSent(call.getSent()+1);}
                return null;
            });
            discord.seedCheckmark(work.channel(),messageId);
            tx(()->{
                var call=current(work);
                if(call!=null) {
                    call.setState(call.getSent()==3 || pending(call).isEmpty()?"COMPLETE":"WAITING");
                    call.setNextAt(call.getStartedAt().plusSeconds(150L*call.getSent()));
                }
                return null;
            });
        } catch(Exception e) {
            if(e instanceof InterruptedException)Thread.currentThread().interrupt();
            tx(()->{var call=current(work);if(call!=null)fail(call,"Falha de comunicação/permissão no Discord. Confira o canal; o envio não será repetido automaticamente.");return null;});
        }
    }
    private PartyDiscordCall current(Work work) {
        var call=calls.lock(work.partyId()).orElse(null);
        return call!=null && call.getRunId().equals(work.runId()) && call.getState().equals("SENDING")?call:null;
    }
    private Set<String> pending(PartyDiscordCall call) {
        return call.getRecipients().stream().map(Recipient::discordId).filter(id->!call.getConfirmed().contains(id)).collect(Collectors.toCollection(LinkedHashSet::new));
    }
    private void fail(PartyDiscordCall call,String reason) {call.setState("FAILED");call.setError(reason);}
    private CallView view(PartyDiscordCall call) {
        var yes=call.getRecipients().stream().filter(r->call.getConfirmed().contains(r.discordId())).map(Recipient::nickname).toList();
        var no=call.getRecipients().stream().filter(r->!call.getConfirmed().contains(r.discordId())).map(Recipient::nickname).toList();
        String link=call.getMessages().isEmpty()?null:discord.url(call.getChannelId(),call.getMessages().getFirst());
        return new CallView(call.getPartyId(),call.getRunId(),call.getState(),call.getSent(),yes,no,List.copyOf(call.getSkipped()),
            call.getState().equals("WAITING")?call.getNextAt():null,call.getStartedAt().plusSeconds(300),link,call.getError());
    }
}
