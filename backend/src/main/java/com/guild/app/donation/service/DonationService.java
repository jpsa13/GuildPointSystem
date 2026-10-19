package com.guild.app.donation.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.DonationStatus;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.PointsModality;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.donation.dto.CreateDonationRequest;
import com.guild.app.donation.dto.DonationResponse;
import com.guild.app.donation.dto.DonationSettingsRequest;
import com.guild.app.donation.dto.DonationSettingsResponse;
import com.guild.app.donation.entity.Donation;
import com.guild.app.donation.entity.DonationSettings;
import com.guild.app.donation.repository.DonationRepository;
import com.guild.app.donation.repository.DonationSettingsRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.points.service.PointsService;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DonationService {

    private static final int MAX_PAGE_SIZE = 50;

    private final DonationRepository donationRepository;
    private final DonationSettingsRepository settingsRepository;
    private final MemberRepository memberRepository;
    private final PointsService pointsService;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;

    @Transactional(readOnly = true)
    public DonationSettingsResponse getSettings() {
        return toResponse(loadSettings());
    }

    @Transactional
    public DonationSettingsResponse updateSettings(DonationSettingsRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var settings = loadSettings();
        long oldValue = settings.getPointsPerKk();
        settings.setPointsPerKk(request.pointsPerKk());
        settings.setUpdatedBy(memberRepository.getReferenceById(actor.getId()));
        settings.setUpdatedAt(Instant.now());
        settingsRepository.save(settings);

        if (oldValue != request.pointsPerKk()) {
            auditLogService.log(AuditLogType.DONATION_RATE_UPDATED, actor, null,
                    Map.of("oldPointsPerKk", oldValue, "newPointsPerKk", request.pointsPerKk()));
        }
        publishChanged("SETTINGS_UPDATED", null);
        return toResponse(settings);
    }

    @Transactional
    public DonationResponse create(CreateDonationRequest request, MemberPrincipal actor) {
        var member = memberRepository.findById(actor.getId())
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        if (member.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Apenas membros aprovados podem doar.", HttpStatus.FORBIDDEN);
        }
        var donation = new Donation();
        donation.setMember(member);
        donation.setAmountKk(request.amountKk());
        donation = donationRepository.save(donation);

        publishChanged("CREATED", donation.getId());
        return toResponse(donation);
    }

    @Transactional(readOnly = true)
    public Page<DonationResponse> listMine(MemberPrincipal actor, int page, int size) {
        return donationRepository.findByMemberIdOrderByCreatedAtDescIdDesc(actor.getId(), pageOf(page, size))
                .map(this::toResponse);
    }

    /** Review queue, oldest first. */
    @Transactional(readOnly = true)
    public List<DonationResponse> listPending() {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        return donationRepository.findByStatusOrderByCreatedAtAscIdAsc(DonationStatus.PENDENTE).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public DonationResponse accept(Long id, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var donation = lockPending(id);
        var member = donation.getMember();
        if (member.getStatus() == MemberStatus.EXCLUIDO) {
            throw new AppException("A conta deste membro foi excluída. Recuse a doação.", HttpStatus.CONFLICT);
        }

        long pointsPerKk = loadSettings().getPointsPerKk();
        long points = Math.multiplyExact(donation.getAmountKk(), pointsPerKk);
        var actorEntity = memberRepository.getReferenceById(actor.getId());

        pointsService.adjustPoints(member, actorEntity, points, PointsModality.DOACAO,
                "Doação de " + donation.getAmountKk() + "kk de disena");

        donation.setStatus(DonationStatus.ACEITA);
        donation.setPointsPerKk(pointsPerKk);
        donation.setPointsAwarded(points);
        markReviewed(donation, actor);

        auditLogService.log(AuditLogType.DONATION_ACCEPTED, actorEntity, member, Map.of(
                "donationId", donation.getId(),
                "amountKk", donation.getAmountKk(),
                "pointsPerKk", pointsPerKk,
                "points", points));

        Long memberId = member.getId();
        webSocketPublisher.publishPointsUpdate(memberId, () -> Map.of(
                "memberId", memberId,
                "availablePoints", pointsService.getAvailablePoints(memberId)));
        publishChanged("ACCEPTED", donation.getId());
        return toResponse(donation);
    }

    @Transactional
    public DonationResponse reject(Long id, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var donation = lockPending(id);
        donation.setStatus(DonationStatus.RECUSADA);
        markReviewed(donation, actor);

        auditLogService.log(AuditLogType.DONATION_REJECTED, actor, donation.getMember(), Map.of(
                "donationId", donation.getId(),
                "amountKk", donation.getAmountKk()));

        publishChanged("REJECTED", donation.getId());
        return toResponse(donation);
    }

    /** Row lock + status check, so two reviewers clicking at once cannot both credit the points. */
    private Donation lockPending(Long id) {
        var donation = donationRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new AppException("Doação não encontrada.", HttpStatus.NOT_FOUND));
        if (donation.getStatus() != DonationStatus.PENDENTE) {
            throw new AppException("Esta doação já foi revisada.", HttpStatus.CONFLICT);
        }
        return donation;
    }

    private void markReviewed(Donation donation, MemberPrincipal actor) {
        donation.setReviewedBy(memberRepository.getReferenceById(actor.getId()));
        donation.setReviewedAt(Instant.now());
        donationRepository.save(donation);
    }

    private DonationSettings loadSettings() {
        return settingsRepository.findById(DonationSettings.SINGLETON_ID)
                .orElseThrow(() -> new AppException("Configuração de doação ausente.", HttpStatus.INTERNAL_SERVER_ERROR));
    }

    private static PageRequest pageOf(int page, int size) {
        return PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE));
    }

    private void publishChanged(String action, Long donationId) {
        var payload = donationId != null
                ? Map.<String, Object>of("type", "DONATION_" + action, "donationId", donationId)
                : Map.<String, Object>of("type", "DONATION_" + action);
        webSocketPublisher.publishDonations(payload);
    }

    private DonationSettingsResponse toResponse(DonationSettings settings) {
        var editor = settings.getUpdatedBy();
        return new DonationSettingsResponse(
                settings.getPointsPerKk(),
                editor != null ? editor.getNickname() : null,
                settings.getUpdatedAt());
    }

    private DonationResponse toResponse(Donation donation) {
        var member = donation.getMember();
        var reviewer = donation.getReviewedBy();
        return new DonationResponse(
                donation.getId(),
                member.getId(),
                member.getNickname(),
                donation.getAmountKk(),
                donation.getStatus(),
                donation.getCreatedAt(),
                reviewer != null ? reviewer.getNickname() : null,
                donation.getReviewedAt(),
                donation.getPointsPerKk(),
                donation.getPointsAwarded());
    }
}
