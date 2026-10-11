package com.guild.app.websocket;

import com.guild.app.log.dto.AuditLogResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.function.Supplier;

/**
 * Every publish issued inside a transaction is deferred until after commit, so clients never
 * receive state that is rolled back or that a follow-up REST read cannot see yet.
 */
@Component
@RequiredArgsConstructor
public class WebSocketPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    public void publishLog(AuditLogResponse log) {
        send("/topic/logs", log);
    }

    public void publishEvent(Object payload) {
        send("/topic/events", payload);
    }

    public void publishAuction(Long auctionId, Object payload) {
        send("/topic/auctions/" + auctionId, payload);
    }

    public void publishAuctionList(Object payload) {
        send("/topic/auctions", payload);
    }

    public void publishPointsUpdate(Long memberId, Map<String, Object> payload) {
        send("/topic/points/" + memberId, payload);
    }

    /** Payload computed lazily after commit (e.g. balances that depend on committed rows). */
    public void publishPointsUpdate(Long memberId, Supplier<Map<String, Object>> payload) {
        afterCommit(() -> messagingTemplate.convertAndSend("/topic/points/" + memberId, payload.get()));
    }

    public void publishToUser(String user, String destination, Object payload) {
        afterCommit(() -> messagingTemplate.convertAndSendToUser(user, destination, payload));
    }

    public void publishPartyBoard() {
        send("/topic/parties", Map.of("type", "BOARD_UPDATED"));
    }

    public void publishPartyMemberNotice(Long memberId, Object payload) {
        send("/topic/parties/member/" + memberId, payload);
    }

    /** Account-level notices for one member (e.g. ACCOUNT_DELETED → the client logs out). */
    public void publishAccountNotice(Long memberId, Object payload) {
        send("/topic/account/" + memberId, payload);
    }

    public void publishNews(Object payload) {
        send("/topic/news", payload);
    }

    public void publishScheduleAlert(Object payload) {
        send("/topic/schedule", payload);
    }

    private void send(String destination, Object payload) {
        afterCommit(() -> messagingTemplate.convertAndSend(destination, payload));
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
