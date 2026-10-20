package com.guild.app.auction.repository;

import com.guild.app.auction.entity.AuctionMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AuctionMessageRepository extends JpaRepository<AuctionMessage, Long> {

    @Query("""
            SELECT m FROM AuctionMessage m
            LEFT JOIN FETCH m.member
            LEFT JOIN FETCH m.replyTo r
            LEFT JOIN FETCH r.member
            WHERE m.auction.id = :auctionId
            ORDER BY m.createdAt ASC
            """)
    List<AuctionMessage> findByAuctionIdOrderByCreatedAtAsc(@Param("auctionId") Long auctionId);
}
