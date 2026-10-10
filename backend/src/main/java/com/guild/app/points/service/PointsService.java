package com.guild.app.points.service;

import com.guild.app.auction.repository.AuctionBidRepository;
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

import java.util.List;

@Service
@RequiredArgsConstructor
public class PointsService {

    private final MemberRepository memberRepository;
    private final PointsAdjustmentRepository pointsAdjustmentRepository;
    private final AuctionRepository auctionRepository;
    private final AuctionBidRepository auctionBidRepository;

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
        long reserved = 0;
        var openStatuses = List.of(AuctionStatus.OPEN, AuctionStatus.DOLE, AuctionStatus.TIE_BREAK);
        var auctions = auctionRepository.findByStatusInOrderByCreatedAtDesc(openStatuses);
        for (var auction : auctions) {
            if (auction.getCurrentBid() == 0) continue;
            if (auction.getId().equals(excludeAuctionId)) continue;
            var tied = auctionBidRepository.findTiedMemberIds(auction.getId(), auction.getCurrentBid());
            if (tied.contains(memberId)) {
                reserved += auction.getCurrentBid();
            }
        }
        return member.getPoints() - reserved;
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
