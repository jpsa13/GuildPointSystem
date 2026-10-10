package com.guild.app.auction.dto;

/** Reply sent to the bidder's private queue ({@code /user/queue/auction-bids}). */
public record BidResult(
        String requestId,
        Long auctionId,
        long amount,
        boolean accepted,
        String error,
        AuctionResponse auction
) {}
