package com.guild.app.points.service;

import com.guild.app.auction.repository.AuctionRepository;
import com.guild.app.common.enums.AuctionStatus;
import com.guild.app.common.exception.AppException;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.points.entity.PointsAdjustment;
import com.guild.app.points.repository.PointsAdjustmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PointsService {

    private static final List<AuctionStatus> RESERVING_STATUSES =
            List.of(AuctionStatus.OPEN, AuctionStatus.DOLE, AuctionStatus.TIE_BREAK);
    /** Auction ids start at 1, so this excludes nothing. */
    private static final long NO_AUCTION = 0L;

    private final MemberRepository memberRepository;
    private final PointsAdjustmentRepository pointsAdjustmentRepository;
    private final AuctionRepository auctionRepository;

    public long getAvailablePoints(Long memberId) {
        return getAvailablePoints(memberId, null);
    }

    /**
     * Total points minus the amounts the member is winning (or tied on) in active auctions.
     * {@code excludeAuctionId} skips one auction: a new bid there replaces the member's own reserve.
     */
    public long getAvailablePoints(Long memberId, Long excludeAuctionId) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        return getAvailablePoints(member, excludeAuctionId);
    }

    /** For an already loaded member (skips the lookup). */
    public long getAvailablePoints(Member member, Long excludeAuctionId) {
        long reserved = auctionRepository.sumReservedBy(member.getId(), RESERVING_STATUSES,
                excludeAuctionId != null ? excludeAuctionId : NO_AUCTION);
        return member.getPoints() - reserved;
    }

    /** Reserved points per member in one query, for listings (members without a reserve are absent). */
    public Map<Long, Long> getReservedPointsByMember() {
        var reserved = new HashMap<Long, Long>();
        for (var row : auctionRepository.sumReservedByMember(RESERVING_STATUSES)) {
            reserved.put((Long) row[0], ((Number) row[1]).longValue());
        }
        return reserved;
    }

    @Transactional
    public void adjustPoints(Member member, Member actor, long amount, com.guild.app.common.enums.PointsModality modality, String reason) {
        var locked = memberRepository.findByIdForUpdate(member.getId())
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));

        if (amount < 0 && locked.getPoints() + amount < 0) {
            throw new AppException("Pontos insuficientes.", HttpStatus.BAD_REQUEST);
        }

        locked.setPoints(locked.getPoints() + amount);

        var adjustment = new PointsAdjustment();
        adjustment.setMember(locked);
        adjustment.setActor(actor);
        adjustment.setAmount(amount);
        adjustment.setModality(modality);
        adjustment.setReason(reason);
        pointsAdjustmentRepository.save(adjustment);
    }
}
