package com.guild.app.auction.dto;

import com.guild.app.common.enums.AuctionStatus;
import com.guild.app.item.dto.ItemResponse;

import java.time.Instant;
import java.util.List;

/**
 * {@code winnerId}/{@code winnerNickname} stay null until the auction is CLOSED, so a tie-break
 * winner is never visible before the roulette has stopped.
 */
public record AuctionResponse(
        Long id,
        AuctionStatus status,
        Integer durationMinutes,
        Instant createdAt,
        Instant endsAt,
        Long currentBid,
        Long winnerId,
        String winnerNickname,
        Long leaderId,
        String leaderNickname,
        int tiedCount,
        boolean tied,
        List<Long> tiedMemberIds,
        List<String> tiedMemberNicknames,
        List<AuctionItemResponse> items,
        int dolePhase,
        int tieBreakPhase,
        long version,
        Instant serverTime
) {
    /** {@code gameIcon} is set for game-catalog items, which have a sprite instead of an image URL. */
    public record AuctionItemResponse(
            Long itemId,
            String itemName,
            String imageUrl,
            int quantity,
            ItemResponse.GameIcon gameIcon) {}
}
