package com.guild.app.presence;

import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Pushes the online list to the leadership panel ({@code /topic/presence}, admins only). Every member
 * reports a ping every 15s, so changes are constant: at most one snapshot per second goes out.
 */
@Component
@RequiredArgsConstructor
public class PresenceBroadcaster {

    private final PresenceRegistry presenceRegistry;
    private final WebSocketPublisher webSocketPublisher;

    @Scheduled(fixedDelay = 1000)
    public void pushIfChanged() {
        if (presenceRegistry.takeChanged()) {
            webSocketPublisher.publishPresence(presenceRegistry.snapshot());
        }
    }
}
