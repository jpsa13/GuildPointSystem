package com.guild.app.party.entity;

import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "party_lfg")
@Getter
@Setter
public class PartyLfg {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", insertable = false, updatable = false)
    private Member member;

    @Column(length = 200)
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "queue_order", nullable = false)
    private Long queueOrder;

    @Column(name = "last_unanswered_at")
    private Instant lastUnansweredAt;

    @Column(name = "afk_since")
    private Instant afkSince;
}
