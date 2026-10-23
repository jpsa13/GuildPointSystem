package com.guild.app.log.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.log.dto.AuditLogResponse;
import com.guild.app.log.entity.AuditLog;
import com.guild.app.log.repository.AuditLogRepository;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;
    private final WebSocketPublisher webSocketPublisher;
    private final MemberRepository memberRepository;

    @Transactional
    public AuditLog log(AuditLogType type, Member actor, Member target, Map<String, Object> payload) {
        var entry = new AuditLog();
        entry.setType(type);
        entry.setActor(actor);
        entry.setTarget(target);
        entry.setPayload(payload);
        var saved = auditLogRepository.save(entry);
        if (type.isEquipmentPrivate()) webSocketPublisher.publishEquipmentChanged();
        else webSocketPublisher.publishLog(toResponse(saved));
        return saved;
    }

    private AuditLogResponse toResponse(AuditLog log) {
        var actor = log.getActor();
        var target = log.getTarget();
        return new AuditLogResponse(
                log.getId(),
                log.getType(),
                actor != null ? actor.getId() : null,
                actor != null ? actor.getNickname() : "System",
                target != null ? target.getId() : null,
                target != null ? target.getNickname() : null,
                log.getPayload(),
                log.getCreatedAt());
    }

    @Transactional
    public AuditLog log(AuditLogType type, MemberPrincipal actor, Member target, Map<String, Object> payload) {
        // A managed reference (not a bare new Member) so the broadcast log carries the actor's nickname.
        return log(type, memberRepository.getReferenceById(actor.getId()), target, payload);
    }
}
