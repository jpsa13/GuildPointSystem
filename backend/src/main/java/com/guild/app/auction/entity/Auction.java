package com.guild.app.auction.entity;

import com.guild.app.common.enums.AuctionStatus;
import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "auction")
@Getter
@Setter
public class Auction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AuctionStatus status = AuctionStatus.OPEN;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id", nullable = false)
    private Member createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(name = "current_bid", nullable = false)
    private Long currentBid = 0L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "winner_id")
    private Member winner;

    @Column(name = "tie_break_seed")
    private Long tieBreakSeed;

    @Column(name = "dole_phase", nullable = false)
    private Integer dolePhase = 0;

    @Column(name = "tie_break_phase", nullable = false)
    private Short tieBreakPhase = 0;

    @Column(name = "state_version", nullable = false)
    private Long stateVersion = 0L;

    public void bumpVersion() {
        stateVersion = stateVersion + 1;
    }
}
