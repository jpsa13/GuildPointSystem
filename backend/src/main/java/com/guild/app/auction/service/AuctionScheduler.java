package com.guild.app.auction.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuctionScheduler {

    private final AuctionService auctionService;

    /** Short tick so DOLE / tie-break phases fire close to their deadline. */
    @Scheduled(fixedDelay = 200)
    public void tick() {
        for (var auctionId : auctionService.findDueAuctionIds()) {
            try {
                auctionService.advance(auctionId);
            } catch (Exception e) {
                log.error("Failed to advance auction {}", auctionId, e);
            }
        }
    }
}
