package com.guild.app.log.service;

import com.guild.app.common.enums.AuditLogType;
import com.guild.app.event.repository.EventClaimRepository;
import com.guild.app.log.dto.AuditLogResponse;
import com.guild.app.log.entity.AuditLog;
import com.guild.app.log.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class LogService {

    private final AuditLogRepository auditLogRepository;
    private final EventClaimRepository eventClaimRepository;

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> list(Pageable pageable) {
        boolean admin = com.guild.app.common.security.SecurityUtils.currentMember().getRole()
                .isAtLeast(com.guild.app.common.enums.Role.ADMINISTRADOR);
        var page = admin ? auditLogRepository.findAllByOrderByCreatedAtDesc(pageable)
                : auditLogRepository.findByTypeNotInOrderByCreatedAtDesc(java.util.List.of(
                    AuditLogType.EQUIPMENT_CHANGED, AuditLogType.EQUIPMENT_CATALOG_IMPORTED), pageable);

        var claimIds = new HashSet<Long>();
        for (var log : page.getContent()) {
            if (log.getType() != AuditLogType.EVENT_CLAIMED) continue;
            Long claimId = parseClaimId(log.getPayload().get("claimId"));
            if (claimId != null) claimIds.add(claimId);
        }

        Map<Long, Boolean> deniedByClaimId = claimIds.isEmpty()
                ? Map.of()
                : eventClaimRepository.findAllById(claimIds).stream()
                        .collect(Collectors.toMap(c -> c.getId(), c -> c.isDenied()));

        return page.map(log -> toResponse(log, deniedByClaimId));
    }

    private Long parseClaimId(Object claimIdObj) {
        if (claimIdObj instanceof Number number) {
            return number.longValue();
        }
        if (claimIdObj instanceof String text) {
            try {
                return Long.parseLong(text);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private AuditLogResponse toResponse(AuditLog log, Map<Long, Boolean> deniedByClaimId) {
        var payload = new HashMap<>(log.getPayload());
        if (log.getType() == AuditLogType.EVENT_CLAIMED) {
            Long claimId = parseClaimId(payload.get("claimId"));
            if (claimId != null) {
                payload.put("claimDenied", deniedByClaimId.getOrDefault(claimId, false));
            }
        }

        return new AuditLogResponse(
                log.getId(),
                log.getType(),
                log.getActor() != null ? log.getActor().getId() : null,
                log.getActor() != null ? log.getActor().getNickname() : "System",
                log.getTarget() != null ? log.getTarget().getId() : null,
                log.getTarget() != null ? log.getTarget().getNickname() : null,
                payload,
                log.getCreatedAt());
    }
}
