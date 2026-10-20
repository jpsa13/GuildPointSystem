package com.guild.app.auction.repository;

import com.guild.app.auction.entity.AuctionMessageReaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AuctionMessageReactionRepository extends JpaRepository<AuctionMessageReaction, Long> {

    @Query("""
            SELECT r FROM AuctionMessageReaction r
            JOIN FETCH r.member
            WHERE r.message.auction.id = :auctionId
            ORDER BY r.createdAt ASC, r.id ASC
            """)
    List<AuctionMessageReaction> findByAuctionId(@Param("auctionId") Long auctionId);

    @Query("""
            SELECT r FROM AuctionMessageReaction r
            JOIN FETCH r.member
            WHERE r.message.id = :messageId
            ORDER BY r.createdAt ASC, r.id ASC
            """)
    List<AuctionMessageReaction> findByMessageId(@Param("messageId") Long messageId);

    Optional<AuctionMessageReaction> findByMessageIdAndMemberIdAndEmoji(Long messageId, Long memberId, String emoji);

    /** A guild emoji was deleted: its reactions go with it. */
    @Modifying
    @Query("DELETE FROM AuctionMessageReaction r WHERE r.emoji = :emoji")
    void deleteByEmoji(@Param("emoji") String emoji);

    boolean existsByMessageIdAndEmoji(Long messageId, String emoji);

    @Query("SELECT COUNT(DISTINCT r.emoji) FROM AuctionMessageReaction r WHERE r.message.id = :messageId")
    long countDistinctEmojis(@Param("messageId") Long messageId);
}
