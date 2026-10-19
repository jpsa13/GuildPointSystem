package com.guild.app.party.service;

import com.guild.app.common.enums.PartyPendingKind;
import com.guild.app.member.entity.Member;
import com.guild.app.party.dto.PartyBoardSnapshot;
import com.guild.app.party.dto.PartyBoardUpdateMessage;
import com.guild.app.party.entity.PartyPending;
import com.guild.app.websocket.WebSocketPublisher;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * Pushes the public party board on {@code /topic/parties}, so a change costs one board build instead of
 * one {@code GET /parties/board} per connected client. Personal state (pending invites/requests) is not
 * broadcast: the message names whose pending changed, and only those clients refetch.
 *
 * <p>Changes are collected per transaction and sent after commit. Bursts are coalesced to at most one
 * broadcast per {@link #MIN_INTERVAL_MS}; the first change after a quiet period goes out immediately.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartyBoardBroadcaster {

    static final long MIN_INTERVAL_MS = 100;
    static final String TYPE = "BOARD_UPDATED";

    private static final Object TX_KEY = new Object();

    // Lazy: PartyService builds the snapshot and also depends on this broadcaster.
    private final ObjectProvider<PartyService> partyService;
    private final WebSocketPublisher webSocketPublisher;
    private final MeterRegistry meterRegistry;

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
        var thread = new Thread(r, "party-board-broadcast");
        thread.setDaemon(true);
        return thread;
    });
    private final Set<Long> pendingMemberIds = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean joinRequestsChanged = new AtomicBoolean();
    private final AtomicBoolean scheduled = new AtomicBoolean();
    private volatile long lastSentAt;

    /** The board changed in the current transaction. */
    public void boardChanged() {
        track(List.of(), false);
    }

    /** A pending invite/request was created or resolved: both sides must refresh their personal state. */
    public void pendingChanged(PartyPending pending) {
        var memberIds = Stream.of(pending.getInitiator(), pending.getTarget())
                .filter(Objects::nonNull)
                .map(Member::getId)
                .toList();
        track(memberIds, pending.getKind() == PartyPendingKind.JOIN_REQUEST);
    }

    private void track(Collection<Long> memberIds, boolean joinRequest) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            request(memberIds, joinRequest);
            return;
        }
        var changes = (TxChanges) TransactionSynchronizationManager.getResource(TX_KEY);
        if (changes == null) {
            var created = new TxChanges();
            TransactionSynchronizationManager.bindResource(TX_KEY, created);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    request(created.memberIds, created.joinRequestsChanged);
                }

                @Override
                public void afterCompletion(int status) {
                    TransactionSynchronizationManager.unbindResourceIfPossible(TX_KEY);
                }
            });
            changes = created;
        }
        changes.memberIds.addAll(memberIds);
        changes.joinRequestsChanged |= joinRequest;
    }

    private void request(Collection<Long> memberIds, boolean joinRequest) {
        pendingMemberIds.addAll(memberIds);
        if (joinRequest) joinRequestsChanged.set(true);
        if (scheduled.compareAndSet(false, true)) {
            long delay = Math.max(0, lastSentAt + MIN_INTERVAL_MS - System.currentTimeMillis());
            executor.schedule(this::flush, delay, TimeUnit.MILLISECONDS);
        }
    }

    /** Runs on the single broadcast thread, so snapshots go out in the order they were built. */
    private void flush() {
        // Cleared before draining: a change recorded from here on schedules the next flush.
        scheduled.set(false);
        lastSentAt = System.currentTimeMillis();

        var memberIds = new ArrayList<Long>();
        for (var it = pendingMemberIds.iterator(); it.hasNext(); ) {
            memberIds.add(it.next());
            it.remove();
        }
        boolean joinRequests = joinRequestsChanged.getAndSet(false);
        var sample = Timer.start(meterRegistry);

        PartyBoardSnapshot board = null;
        try {
            board = partyService.getObject().getPublicSnapshot();
        } catch (Exception e) {
            log.error("Failed to build the party board snapshot; clients will refetch", e);
        }
        try {
            webSocketPublisher.publishPartyBoard(new PartyBoardUpdateMessage(TYPE, board, memberIds, joinRequests));
        } catch (Exception e) {
            log.error("Failed to broadcast the party board", e);
        }
        sample.stop(meterRegistry.timer("guild.party.board.broadcast"));
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    private static final class TxChanges {
        final Set<Long> memberIds = new HashSet<>();
        boolean joinRequestsChanged;
    }
}
