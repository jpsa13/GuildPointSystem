package com.guild.app.donation.entity;

import com.guild.app.common.enums.DonationStatus;
import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "donation")
@Getter
@Setter
public class Donation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /** Disena in kk (millions). */
    @Column(name = "amount_kk", nullable = false)
    private Long amountKk;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DonationStatus status = DonationStatus.PENDENTE;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_id")
    private Member reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /** Rate in force when the donation was accepted. */
    @Column(name = "points_per_kk")
    private Long pointsPerKk;

    @Column(name = "points_awarded")
    private Long pointsAwarded;
}
