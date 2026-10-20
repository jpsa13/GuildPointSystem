package com.guild.app.auction.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Caps reaction toggles per member (fixed one-second window). Every toggle is broadcast on the
 * auction topic that also carries the bids, so a member clicking non-stop must not flood it.
 * In memory: one entry per member who ever reacted, which for a guild stays small.
 */
@Component
class ReactionRateLimiter {

    static final int MAX_PER_SECOND = 5;

    private final Map<Long, long[]> windows = new ConcurrentHashMap<>();

    /** Counts the attempt; false when the member already used this second's quota. */
    boolean tryAcquire(Long memberId) {
        long second = System.currentTimeMillis() / 1000;
        long[] window = windows.compute(memberId, (id, w) -> {
            if (w == null || w[0] != second) return new long[] {second, 1};
            w[1]++;
            return w;
        });
        return window[1] <= MAX_PER_SECOND;
    }
}
