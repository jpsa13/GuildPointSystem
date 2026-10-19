package com.guild.app.auth.security;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * Principals resolved from a JWT, so authenticated requests and WebSocket CONNECTs skip the member
 * lookup. Any change to a member evicts it after commit ({@link MemberCacheEvictionListener}), so a
 * deleted account or a role change takes effect on the next request; the TTL is only a backstop.
 */
@Component
public class MemberPrincipalCache {

    static final Duration TTL = Duration.ofSeconds(30);

    private record Entry(MemberPrincipal principal, long expiresAt) {}

    private final Map<Long, Entry> entries = new ConcurrentHashMap<>();
    /**
     * Bumped on every eviction. A load that started before an eviction is not stored: it may have read
     * the row before the change committed, and storing it would bring the stale principal back.
     */
    private final AtomicLong evictions = new AtomicLong();

    public MemberPrincipal get(Long memberId, Supplier<MemberPrincipal> loader) {
        long now = System.currentTimeMillis();
        var cached = entries.get(memberId);
        if (cached != null && cached.expiresAt() > now) return cached.principal();

        long evictionsBefore = evictions.get();
        var principal = loader.get();
        if (evictions.get() == evictionsBefore) {
            entries.put(memberId, new Entry(principal, now + TTL.toMillis()));
        }
        return principal;
    }

    public void evict(Long memberId) {
        evictions.incrementAndGet();
        entries.remove(memberId);
    }

    /** Evicts now and again once the current transaction ends, so no request caches the pre-commit row. */
    public void evictAfterCommit(Long memberId) {
        evict(memberId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    evict(memberId);
                }
            });
        }
    }
}
