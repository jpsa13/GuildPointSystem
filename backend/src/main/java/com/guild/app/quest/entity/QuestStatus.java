package com.guild.app.quest.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Ultimo estado de quests de um membro, enviado pelo cliente CerberusBags.
 * Name-based, display-only. Codigos no formato Q000000, separados por virgula.
 */
@Entity
@Table(name = "quest_status")
@Getter
@Setter
public class QuestStatus {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "quest_day", nullable = false)
    private LocalDate questDay;

    @Column(name = "active_codes", nullable = false)
    private String activeCodes = "";

    @Column(name = "done_codes", nullable = false)
    private String doneCodes = "";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
