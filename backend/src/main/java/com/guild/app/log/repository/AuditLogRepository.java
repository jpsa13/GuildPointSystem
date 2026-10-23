package com.guild.app.log.repository;

import com.guild.app.log.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    @EntityGraph(attributePaths = {"actor", "target"})
    Page<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @EntityGraph(attributePaths = {"actor", "target"})
    Page<AuditLog> findByTypeNotInOrderByCreatedAtDesc(java.util.Collection<com.guild.app.common.enums.AuditLogType> types, Pageable pageable);
}
