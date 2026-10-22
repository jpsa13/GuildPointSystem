package com.guild.app.member.service;

import com.guild.app.auction.service.AuctionService;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.party.service.PartyService;
import com.guild.app.websocket.WebSocketPublisher;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.discord.DiscordMemberService;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.dto.ApprovalRequest;
import com.guild.app.member.dto.LinkDiscordRequest;
import com.guild.app.member.dto.MemberResponse;
import com.guild.app.member.dto.UpdateProfileRequest;
import com.guild.app.member.dto.UpdateRoleRequest;
import com.guild.app.member.entity.Member;
import com.guild.app.member.entity.CharacterClass;
import com.guild.app.member.entity.GameRace;
import com.guild.app.member.policy.GuildRacePolicy;
import com.guild.app.member.repository.CharacterClassRepository;
import com.guild.app.member.repository.GameRaceRepository;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.points.dto.PointsAdjustmentRequest;
import com.guild.app.points.service.PointsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;
    private final GameRaceRepository gameRaceRepository;
    private final CharacterClassRepository characterClassRepository;
    private final AuditLogService auditLogService;
    private final PointsService pointsService;
    private final AuctionService auctionService;
    private final PartyService partyService;
    private final WebSocketPublisher webSocketPublisher;
    private final DiscordMemberService discordMemberService;

    @Transactional(readOnly = true)
    public MemberResponse getById(Long id) {
        var member = memberRepository.findById(id)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        return toResponse(member);
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> getRanking() {
        return toResponses(memberRepository.findByStatusOrderByPointsDesc(MemberStatus.APROVADO));
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> getPending() {
        SecurityUtils.requireRole(Role.MODERADOR);
        return toResponses(memberRepository.findAll().stream()
                .filter(m -> m.getStatus() == MemberStatus.PENDENTE)
                .toList());
    }

    @Transactional
    public MemberResponse updateProfile(Long memberId, UpdateProfileRequest request, MemberPrincipal actor) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));

        if (!member.getId().equals(actor.getId()) && !actor.getRole().isAtLeast(Role.ADMINISTRADOR)) {
            throw new AppException("Você não tem permissão para esta ação.", HttpStatus.FORBIDDEN);
        }
        requireNotDeleted(member);

        GuildRacePolicy.requireRaceUnchanged(member, request.raceId());
        var race = gameRaceRepository.findById(request.raceId())
                .orElseThrow(() -> new AppException("Raça inválida.", HttpStatus.BAD_REQUEST));
        var clazz = characterClassRepository.findById(request.classId())
                .orElseThrow(() -> new AppException("Classe inválida.", HttpStatus.BAD_REQUEST));
        validateClassForRace(clazz, race);

        logProfileChange(member, actor, "nickname", member.getNickname(), request.nickname());
        logProfileChange(member, actor, "race", member.getRace() != null ? member.getRace().getName() : null, race.getName());
        logProfileChange(member, actor, "class",
                member.getCharacterClass() != null ? member.getCharacterClass().getName() : null, clazz.getName());
        logProfileChange(member, actor, "level", String.valueOf(member.getLevel()), String.valueOf(request.level()));

        member.setNickname(request.nickname());
        member.setRace(race);
        member.setCharacterClass(clazz);
        member.setLevel(request.level());
        if (request.avatarUrl() != null) {
            member.setAvatarUrl(request.avatarUrl());
        }
        member.setProfileComplete(true);
        return toResponse(memberRepository.save(member));
    }

    @Transactional
    public MemberResponse approve(Long memberId, ApprovalRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.MODERADOR);
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        requireNotDeleted(member);

        if (request.status() != MemberStatus.APROVADO && request.status() != MemberStatus.REJEITADO) {
            throw new AppException("Status inválido.", HttpStatus.BAD_REQUEST);
        }

        member.setStatus(request.status());
        memberRepository.save(member);

        var type = request.status() == MemberStatus.APROVADO
                ? AuditLogType.MEMBER_APPROVED : AuditLogType.MEMBER_REJECTED;
        Member actorEntity = memberRepository.getReferenceById(actor.getId());
        auditLogService.log(type, actorEntity, member, Map.of("status", request.status().name()));
        webSocketPublisher.publishApprovals(Map.of("type", "PENDING_CHANGED"));

        return toResponse(member);
    }

    @Transactional
    public MemberResponse adjustPoints(Long memberId, PointsAdjustmentRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        requireNotDeleted(member);
        var actorEntity = memberRepository.getReferenceById(actor.getId());

        pointsService.adjustPoints(member, actorEntity, request.amount(), request.modality(), request.reason());

        auditLogService.log(AuditLogType.POINTS_ADJUSTED, actorEntity, member, Map.of(
                "amount", request.amount(),
                "modality", request.modality().name(),
                "reason", request.reason()));

        return toResponse(memberRepository.findById(memberId).orElseThrow());
    }

    @Transactional
    public MemberResponse promoteToLeader(Long memberId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.LIDER);
        if (actor.getRole() != Role.LIDER) {
            throw new AppException("Apenas o líder pode atribuir o cargo de líder.", HttpStatus.FORBIDDEN);
        }

        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        requireNotDeleted(member);
        var previousLeader = memberRepository.findByRole(Role.LIDER).orElse(null);

        if (previousLeader != null && !previousLeader.getId().equals(memberId)) {
            previousLeader.setRole(Role.ADMINISTRADOR);
            memberRepository.save(previousLeader);
            logRoleChange(actor, previousLeader, Role.LIDER, Role.ADMINISTRADOR);
        }

        if (member.getRole() != Role.LIDER) {
            var oldRole = member.getRole();
            member.setRole(Role.LIDER);
            memberRepository.save(member);
            logRoleChange(actor, member, oldRole, Role.LIDER);
        }

        return toResponse(member);
    }

    @Transactional
    public MemberResponse updateRole(Long memberId, UpdateRoleRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.LIDER);
        if (actor.getId().equals(memberId)) {
            throw new AppException("Você não pode alterar o próprio papel.", HttpStatus.BAD_REQUEST);
        }

        if (request.role() == Role.LIDER) {
            return promoteToLeader(memberId, actor);
        }

        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));

        requireNotDeleted(member);
        if (member.getRole() == Role.LIDER) {
            throw new AppException(
                    "Para transferir a liderança, selecione outro membro como Líder.",
                    HttpStatus.BAD_REQUEST);
        }

        var oldRole = member.getRole();
        if (oldRole == request.role()) {
            return toResponse(member);
        }

        member.setRole(request.role());
        memberRepository.save(member);
        logRoleChange(actor, member, oldRole, request.role());
        return toResponse(member);
    }

    /**
     * Líder/Administrador: links a member to a Discord account (for the Dashboard's Discord list),
     * or unlinks it with a blank id. Independent of Discord login.
     */
    @Transactional
    public MemberResponse linkDiscord(Long memberId, LinkDiscordRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        requireNotDeleted(member);

        String discordId = request.discordId() == null || request.discordId().isBlank()
                ? null
                : request.discordId().trim();
        String oldDiscordId = member.getDiscordId();
        if (Objects.equals(oldDiscordId, discordId)) {
            return toResponse(member);
        }
        if (discordId != null) {
            memberRepository.findByDiscordId(discordId)
                    .filter(other -> !other.getId().equals(memberId))
                    .ifPresent(other -> {
                        throw new AppException(
                                "Esta conta do Discord já está vinculada a " + other.getNickname() + ".",
                                HttpStatus.CONFLICT);
                    });
        }

        member.setDiscordId(discordId);
        memberRepository.save(member);
        logProfileChange(member, actor, "discord", oldDiscordId, discordId != null ? discordId : "");
        discordMemberService.refreshAfterCommit();
        return toResponse(member);
    }

    /**
     * Líder/Administrador: deletes a member's account. The row stays (points history, bids, claims and
     * audit logs reference it) but login and personal data are wiped and the member leaves every
     * party/LFG/pending invite. Email and Discord become free for a fresh registration.
     */
    @Transactional
    public void deleteAccount(Long memberId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        if (actor.getId().equals(memberId)) {
            throw new AppException("Você não pode excluir a própria conta.", HttpStatus.BAD_REQUEST);
        }
        var member = memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        if (member.getStatus() == MemberStatus.EXCLUIDO) {
            throw new AppException("Esta conta já foi excluída.", HttpStatus.CONFLICT);
        }
        if (member.getRole() == Role.LIDER) {
            throw new AppException("Transfira a liderança antes de excluir a conta do líder.", HttpStatus.BAD_REQUEST);
        }
        // Administrador can remove Membro/Moderador; only the Líder can remove an Administrador.
        if (member.getRole().isAtLeast(actor.getRole())) {
            throw new AppException("Você só pode excluir membros com cargo abaixo do seu.", HttpStatus.FORBIDDEN);
        }
        var leading = auctionService.findActiveAuctionsLedBy(memberId);
        if (!leading.isEmpty()) {
            throw new AppException("Este membro está vencendo leilão(ões) em andamento ("
                    + leading.stream().map(id -> "#" + id).collect(java.util.stream.Collectors.joining(", "))
                    + "). Encerre o leilão antes de excluir a conta.", HttpStatus.CONFLICT);
        }

        partyService.removeMemberEverywhere(memberId);

        var previousRole = member.getRole();
        var wasPending = member.getStatus() == MemberStatus.PENDENTE;
        member.setStatus(MemberStatus.EXCLUIDO);
        member.setRole(Role.MEMBRO);
        member.setEmail(null);
        member.setDiscordId(null);
        member.setPasswordHash(null);
        member.setAvatarUrl(null);
        member.setDeletedAt(java.time.Instant.now());
        memberRepository.save(member);

        auditLogService.log(AuditLogType.MEMBER_DELETED, memberRepository.getReferenceById(actor.getId()), member,
                Map.of("nickname", member.getNickname(),
                        "role", previousRole.name(),
                        "points", member.getPoints()));
        // Kick any open session of the deleted member (their token is already rejected server-side).
        webSocketPublisher.publishAccountNotice(memberId, Map.of("type", "ACCOUNT_DELETED"));
        if (wasPending) {
            webSocketPublisher.publishApprovals(Map.of("type", "PENDING_CHANGED"));
        }
    }

    private static void requireNotDeleted(Member member) {
        if (member.getStatus() == MemberStatus.EXCLUIDO) {
            throw new AppException("Esta conta foi excluída.", HttpStatus.CONFLICT);
        }
    }

    private void logRoleChange(MemberPrincipal actor, Member member, Role oldRole, Role newRole) {
        Member actorEntity = memberRepository.getReferenceById(actor.getId());
        auditLogService.log(AuditLogType.MEMBER_ROLE_CHANGED, actorEntity, member, Map.of(
                "oldRole", oldRole.name(),
                "newRole", newRole.name()));
    }

    private void logProfileChange(Member member, MemberPrincipal actor, String field, String oldVal, String newVal) {
        if (oldVal != null && oldVal.equals(newVal)) return;
        Member actorEntity = memberRepository.getReferenceById(actor.getId());
        auditLogService.log(AuditLogType.PROFILE_UPDATED, actorEntity, member, Map.of(
                "field", field, "oldValue", oldVal != null ? oldVal : "", "newValue", newVal));
    }

    private void validateClassForRace(CharacterClass clazz, GameRace race) {
        if (!clazz.getRace().getId().equals(race.getId())) {
            throw new AppException("A classe não pertence à raça selecionada.", HttpStatus.BAD_REQUEST);
        }
    }

    private MemberResponse toResponse(Member member) {
        return toResponse(member, pointsService.getAvailablePoints(member, null));
    }

    /** Lists resolve every member's auction reserve in one query instead of one per member. */
    private List<MemberResponse> toResponses(List<Member> members) {
        var reserved = pointsService.getReservedPointsByMember();
        return members.stream()
                .map(m -> toResponse(m, m.getPoints() - reserved.getOrDefault(m.getId(), 0L)))
                .toList();
    }

    private MemberResponse toResponse(Member member, long availablePoints) {
        return new MemberResponse(
                member.getId(),
                member.getEmail(),
                member.getNickname(),
                member.getAvatarUrl(),
                member.getRace() != null ? member.getRace().getId() : null,
                member.getRace() != null ? member.getRace().getName() : null,
                member.getCharacterClass() != null ? member.getCharacterClass().getId() : null,
                member.getCharacterClass() != null ? member.getCharacterClass().getName() : null,
                member.getCharacterClass() != null ? member.getCharacterClass().getImageUrl() : null,
                member.getRole(),
                member.getStatus(),
                member.getPoints(),
                availablePoints,
                member.getLevel() != null ? member.getLevel() : 1,
                member.isProfileComplete(),
                member.getLastLoginAt());
    }
}
