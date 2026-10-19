package com.guild.app.donation.entity;

import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** Single row (id = 1). */
@Entity
@Table(name = "donation_settings")
@Getter
@Setter
public class DonationSettings {

    public static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "points_per_kk", nullable = false)
    private Long pointsPerKk;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by_id")
    private Member updatedBy;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
