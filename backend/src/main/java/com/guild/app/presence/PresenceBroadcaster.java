package com.guild.app.presence;

import com.guild.app.presence.dto.AuctionViewer;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Pushes the online list to the leadership panel ({@code /topic/presence}, admins only). Every member
 * reports a ping every 15s, so changes are constant: at most one snapshot per second goes out.
 */
@Component
@RequiredArgsConstructor
public class PresenceBroadcaster {

    private final PresenceRegistry presenceRegistry;
    private final WebSocketPublisher webSocketPublisher;

    /** Last viewer list pushed per auction: the 15s pings change nothing here, so most ticks push none. */
    private Map<Long, List<AuctionViewer>> lastViewers = Map.of();

    @Scheduled(fixedDelay = 1000)
    public void pushIfChanged() {
        if (presenceRegistry.takeChanged()) {
            webSocketPublisher.publishPresence(presenceRegistry.snapshot());
            pushAuctionViewers();
        }
    }

    private void pushAuctionViewers() {
        var viewers = presenceRegistry.auctionViewers();
        viewers.forEach((auctionId, list) -> {
            if (!list.equals(lastViewers.get(auctionId))) {
                webSocketPublisher.publishAuctionViewers(auctionId, list);
            }
        });
        // Everyone left: tell the (now empty) page so it does not keep showing the last people.
        lastViewers.keySet().stream()
                .filter(auctionId -> !viewers.containsKey(auctionId))
                .forEach(auctionId -> webSocketPublisher.publishAuctionViewers(auctionId, List.of()));
        lastViewers = viewers;
    }
}
