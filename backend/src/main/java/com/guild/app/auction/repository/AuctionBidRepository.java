package com.guild.app.auction.repository;

import com.guild.app.auction.entity.AuctionBid;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AuctionBidRepository extends JpaRepository<AuctionBid, Long> {

    Optional<AuctionBid> findFirstByAuctionIdOrderByAmountDescIdAsc(Long auctionId);

    /** Members holding the given amount, in the order they reached it (stable roulette order). */
    @Query("""
            SELECT b.member.id FROM AuctionBid b
            WHERE b.auction.id = :auctionId AND b.amount = :amount
            GROUP BY b.member.id
            ORDER BY MIN(b.id) ASC
            """)
    List<Long> findTiedMemberIds(Long auctionId, Long amount);
}
