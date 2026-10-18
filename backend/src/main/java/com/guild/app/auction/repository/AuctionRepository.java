package com.guild.app.auction.repository;

import com.guild.app.auction.entity.Auction;
import com.guild.app.common.enums.AuctionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AuctionRepository extends JpaRepository<Auction, Long> {

    List<Auction> findByStatusInOrderByCreatedAtDesc(List<AuctionStatus> statuses);

    List<Auction> findByStatusOrderByCreatedAtDesc(AuctionStatus status);

    @Query("SELECT a FROM Auction a LEFT JOIN FETCH a.winner WHERE a.id = :id")
    Optional<Auction> findByIdWithWinner(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Auction a WHERE a.id = :id")
    Optional<Auction> findByIdForUpdate(Long id);

    List<Auction> findByStatus(AuctionStatus status);

    @Query("SELECT a.id FROM Auction a WHERE a.status IN :statuses AND a.endsAt <= :now")
    List<Long> findDueIds(Collection<AuctionStatus> statuses, Instant now);

    /**
     * Points the member has reserved: the current bid of every auction in {@code statuses} where they hold
     * (or tie on) the top bid. {@code excludeAuctionId} skips one auction (pass 0 to skip none).
     */
    @Query("""
            SELECT COALESCE(SUM(a.currentBid), 0) FROM Auction a
            WHERE a.status IN :statuses AND a.currentBid > 0 AND a.id <> :excludeAuctionId
              AND EXISTS (SELECT 1 FROM AuctionBid b
                          WHERE b.auction = a AND b.member.id = :memberId AND b.amount = a.currentBid)
            """)
    long sumReservedBy(Long memberId, Collection<AuctionStatus> statuses, Long excludeAuctionId);

    /** Same reserve for every member at once, as {@code [memberId, reserved]} rows (members without one are absent). */
    @Query("""
            SELECT b.member.id, SUM(a.currentBid) FROM AuctionBid b JOIN b.auction a
            WHERE a.status IN :statuses AND a.currentBid > 0 AND b.amount = a.currentBid
            GROUP BY b.member.id
            """)
    List<Object[]> sumReservedByMember(Collection<AuctionStatus> statuses);

    /** Auctions in {@code statuses} where the member holds (or ties on) the top bid. */
    @Query("""
            SELECT a.id FROM Auction a
            WHERE a.status IN :statuses AND a.currentBid > 0
              AND EXISTS (SELECT 1 FROM AuctionBid b
                          WHERE b.auction = a AND b.member.id = :memberId AND b.amount = a.currentBid)
            ORDER BY a.createdAt DESC
            """)
    List<Long> findIdsLedBy(Long memberId, Collection<AuctionStatus> statuses);

    /** Bulk delete: bids, items and messages go with it via ON DELETE CASCADE. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Auction a WHERE a.id = :id")
    void deleteByIdCascade(Long id);
}
