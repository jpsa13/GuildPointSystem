package com.guild.app.event.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.ObjectiveType;
import com.guild.app.common.enums.PointsModality;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.event.dto.ClaimEventRequest;
import com.guild.app.event.dto.CreateEventRequest;
import com.guild.app.event.dto.DenyClaimRequest;
import com.guild.app.event.dto.EventClaimResponse;
import com.guild.app.event.dto.EventResponse;
import com.guild.app.event.entity.EventClaim;
import com.guild.app.event.entity.GuildEvent;
import com.guild.app.event.repository.EventClaimRepository;
import com.guild.app.event.repository.GuildEventRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.objective.repository.ObjectiveRepository;
import com.guild.app.points.service.PointsService;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class EventService {

    private static final Set<Integer> ALLOWED_DURATIONS = Set.of(5, 15, 30, 60);

    private final GuildEventRepository guildEventRepository;
    private final EventClaimRepository eventClaimRepository;
    private final ObjectiveRepository objectiveRepository;
    private final MemberRepository memberRepository;
    private final PointsService pointsService;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;

    @Transactional(readOnly = true)
    public List<EventResponse> listActive(MemberPrincipal actor) {
        return guildEventRepository.findByActiveTrueAndExpiresAtAfterOrderByCreatedAtDesc(Instant.now())
                .stream().map(e -> toResponse(e, actor.getId())).toList();
    }

    @Transactional
    public EventResponse create(CreateEventRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        if (!ALLOWED_DURATIONS.contains(request.durationMinutes())) {
            throw new AppException("Duração inválida. Use 5, 15, 30 ou 60 minutos.", HttpStatus.BAD_REQUEST);
        }

        var objective = objectiveRepository.findById(request.objectiveId())
                .orElseThrow(() -> new AppException("Objetivo não encontrado.", HttpStatus.NOT_FOUND));

        var event = new GuildEvent();
        event.setObjective(objective);
        event.setPassword(request.password());
        event.setDurationMinutes(request.durationMinutes());
        event.setCreatedBy(memberRepository.getReferenceById(actor.getId()));
        event.setExpiresAt(Instant.now().plusSeconds(request.durationMinutes() * 60L));
        event = guildEventRepository.save(event);

        auditLogService.log(AuditLogType.EVENT_CREATED,
                memberRepository.getReferenceById(actor.getId()), null, Map.of(
                        "eventId", event.getId(),
                        "objectiveName", objective.getName(),
                        "durationMinutes", request.durationMinutes()));

        var response = toResponse(event, actor.getId());
        webSocketPublisher.publishEvent(response);
        return response;
    }

    @Transactional
    public EventResponse claim(Long eventId, ClaimEventRequest request, MemberPrincipal actor) {
        var event = guildEventRepository.findById(eventId)
                .orElseThrow(() -> new AppException("Evento não encontrado.", HttpStatus.NOT_FOUND));

        if (!event.isActive() || event.getExpiresAt().isBefore(Instant.now())) {
            throw new AppException("Evento expirado", HttpStatus.BAD_REQUEST);
        }
        if (!event.getPassword().equals(request.password())) {
            throw new AppException("Senha inválida", HttpStatus.BAD_REQUEST);
        }

        // Lock the member before the checks: concurrent claims by the same member (double click, or two
        // events of one LIMITADO objective) are serialized, so the daily cap can't be exceeded.
        var member = memberRepository.findByIdForUpdate(actor.getId())
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));

        if (eventClaimRepository.existsByEventIdAndMemberId(eventId, actor.getId())) {
            throw new AppException("Você já resgatou este evento", HttpStatus.CONFLICT);
        }

        var objective = event.getObjective();
        if (objective.getType() == ObjectiveType.LIMITADO) {
            long todayClaims = eventClaimRepository.countDailyClaims(
                    actor.getId(), objective.getId());
            if (todayClaims >= objective.getDailyLimit()) {
                throw new AppException("Limite diário deste objetivo atingido", HttpStatus.BAD_REQUEST);
            }
        }

        var actorEntity = memberRepository.getReferenceById(actor.getId());

        pointsService.adjustPoints(member, actorEntity, objective.getPoints(), PointsModality.EVENTO, "Event claim");

        var claim = new EventClaim();
        claim.setEvent(event);
        claim.setMember(member);
        claim.setObjective(objective);
        claim.setPoints(objective.getPoints());
        claim = eventClaimRepository.save(claim);

        auditLogService.log(AuditLogType.EVENT_CLAIMED, actorEntity, member, Map.of(
                "claimId", claim.getId(),
                "eventId", eventId,
                "objectiveName", objective.getName(),
                "points", objective.getPoints()));

        // No /topic/events broadcast: a claim changes nothing in the event itself, and with hundreds of
        // members claiming at once every broadcast would fan out to every client. The log goes out instead.
        return toResponse(event, actor.getId());
    }

    @Transactional
    public EventResponse cancel(Long eventId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var event = guildEventRepository.findById(eventId)
                .orElseThrow(() -> new AppException("Evento não encontrado.", HttpStatus.NOT_FOUND));

        if (!event.isActive()) {
            throw new AppException("Este evento já foi cancelado.", HttpStatus.BAD_REQUEST);
        }
        if (event.getExpiresAt().isBefore(Instant.now())) {
            throw new AppException("Este evento já expirou.", HttpStatus.BAD_REQUEST);
        }

        event.setActive(false);
        guildEventRepository.save(event);

        var actorEntity = memberRepository.getReferenceById(actor.getId());
        var claims = eventClaimRepository.findByEventIdAndDeniedFalse(eventId);
        for (var claim : claims) {
            revertClaim(claim, actorEntity, "Evento cancelado");
        }

        auditLogService.log(AuditLogType.EVENT_CANCELLED, actorEntity, null, Map.of(
                "eventId", eventId,
                "objectiveName", event.getObjective().getName(),
                "claimsReverted", claims.size()));

        var response = toResponse(event, actor.getId());
        webSocketPublisher.publishEvent(response);
        return response;
    }

    @Transactional(readOnly = true)
    public List<EventClaimResponse> listClaimsForMember(Long memberId) {
        memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        return eventClaimRepository.findTop20ByMemberIdOrderByClaimedAtDesc(memberId)
                .stream()
                .map(this::toClaimResponse)
                .toList();
    }

    @Transactional
    public EventClaimResponse grantManualToMember(Long memberId, Long objectiveId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var member = memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        if (member.getStatus() != com.guild.app.common.enums.MemberStatus.APROVADO) {
            throw new AppException("O membro ainda não foi aprovado.", HttpStatus.BAD_REQUEST);
        }

        var objective = objectiveRepository.findById(objectiveId)
                .orElseThrow(() -> new AppException("Objetivo não encontrado.", HttpStatus.NOT_FOUND));
        if (objective.isDeleted()) {
            throw new AppException("Objetivo não encontrado.", HttpStatus.NOT_FOUND);
        }

        if (objective.getType() == ObjectiveType.LIMITADO) {
            long todayClaims = eventClaimRepository.countDailyClaims(memberId, objective.getId());
            if (todayClaims >= objective.getDailyLimit()) {
                throw new AppException("Limite diário deste objetivo atingido", HttpStatus.BAD_REQUEST);
            }
        }

        var actorEntity = memberRepository.getReferenceById(actor.getId());
        pointsService.adjustPoints(member, actorEntity, objective.getPoints(), PointsModality.EVENTO, "Manual event grant");

        var claim = new EventClaim();
        claim.setEvent(null);
        claim.setMember(member);
        claim.setObjective(objective);
        claim.setPoints(objective.getPoints());
        claim = eventClaimRepository.save(claim);

        auditLogService.log(AuditLogType.EVENT_CLAIMED, actorEntity, member, Map.of(
                "claimId", claim.getId(),
                "objectiveName", objective.getName(),
                "points", objective.getPoints(),
                "manual", true));

        return toClaimResponse(claim);
    }

    @Transactional
    public void denyClaim(Long claimId, DenyClaimRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var claim = eventClaimRepository.findById(claimId)
                .orElseThrow(() -> new AppException("Resgate não encontrado.", HttpStatus.NOT_FOUND));
        if (claim.isDenied()) {
            throw new AppException("Este resgate já foi negado.", HttpStatus.BAD_REQUEST);
        }

        var actorEntity = memberRepository.getReferenceById(actor.getId());
        revertClaim(claim, actorEntity, request.reason());
    }

    private void revertClaim(EventClaim claim, Member actorEntity, String reason) {
        if (claim.isDenied()) {
            return;
        }

        var member = memberRepository.findByIdForUpdate(claim.getMember().getId())
                .orElseThrow();

        pointsService.adjustPoints(member, actorEntity, -claim.getPoints(), PointsModality.REVERSAO, reason);

        claim.setDenied(true);
        claim.setDeniedBy(actorEntity);
        claim.setDeniedAt(Instant.now());
        eventClaimRepository.save(claim);

        auditLogService.log(AuditLogType.EVENT_DENIED, actorEntity, member, Map.of(
                "claimId", claim.getId(),
                "pointsReverted", claim.getPoints(),
                "reason", reason,
                "objectiveName", claim.getObjective().getName(),
                "targetNickname", member.getNickname()));

        webSocketPublisher.publishPointsUpdate(member.getId(), Map.of(
                "memberId", member.getId(),
                "availablePoints", pointsService.getAvailablePoints(member.getId())));
    }

    private EventClaimResponse toClaimResponse(EventClaim claim) {
        return new EventClaimResponse(
                claim.getId(),
                claim.getObjective().getName(),
                claim.getPoints(),
                claim.getClaimedAt(),
                claim.isDenied(),
                claim.getEvent() == null);
    }

    private EventResponse toResponse(GuildEvent event, Long memberId) {
        boolean claimed = eventClaimRepository.existsByEventIdAndMemberId(event.getId(), memberId);
        return new EventResponse(
                event.getId(),
                event.getObjective().getId(),
                event.getObjective().getName(),
                event.getObjective().getPoints(),
                event.getDurationMinutes(),
                event.getCreatedAt(),
                event.getExpiresAt(),
                event.isActive(),
                claimed);
    }
}
