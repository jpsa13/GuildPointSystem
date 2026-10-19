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
    /**
     * Same state without {@code items}, for the per-bid/per-tick AUCTION_UPDATE broadcasts: items never
     * change after creation and clients keep them from the first full response.
     */
    public AuctionResponse withoutItems() {
        return new AuctionResponse(id, status, durationMinutes, createdAt, endsAt, currentBid, winnerId,
                winnerNickname, leaderId, leaderNickname, tiedCount, tied, tiedMemberIds, tiedMemberNicknames,
                null, dolePhase, tieBreakPhase, version, serverTime);
    }

    /** {@code gameIcon} is set for game-catalog items, which have a sprite instead of an image URL. */
    public record AuctionItemResponse(
            Long itemId,
            String itemName,
            String imageUrl,
            int quantity,
            ItemResponse.GameIcon gameIcon) {}
}
