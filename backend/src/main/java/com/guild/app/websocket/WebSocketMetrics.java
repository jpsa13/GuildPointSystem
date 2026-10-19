package com.guild.app.websocket;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.config.WebSocketMessageBrokerStats;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import java.util.function.ToIntFunction;

/**
 * Live socket counts in /actuator/metrics ({@code guild.websocket.sessions}, tag {@code transport}).
 * The STOMP channel thread pools (queued/active) are already published as {@code executor.*} metrics.
 */
@Component
public class WebSocketMetrics {

    public WebSocketMetrics(WebSocketMessageBrokerStats stats, MeterRegistry registry) {
        register(registry, stats, "all", SubProtocolWebSocketHandler.Stats::getTotalSessions);
        register(registry, stats, "websocket", SubProtocolWebSocketHandler.Stats::getWebSocketSessions);
        register(registry, stats, "sockjs-streaming", SubProtocolWebSocketHandler.Stats::getHttpStreamingSessions);
        register(registry, stats, "sockjs-polling", SubProtocolWebSocketHandler.Stats::getHttpPollingSessions);
        // Sessions closed for being too slow to receive (send buffer/time limit) — a client-side latency signal.
        Gauge.builder("guild.websocket.sessions.limit-exceeded", stats, s -> value(s, SubProtocolWebSocketHandler.Stats::getLimitExceededSessions))
                .register(registry);
    }

    private static void register(MeterRegistry registry, WebSocketMessageBrokerStats stats, String transport,
                                 ToIntFunction<SubProtocolWebSocketHandler.Stats> getter) {
        Gauge.builder("guild.websocket.sessions", stats, s -> value(s, getter))
                .tag("transport", transport)
                .register(registry);
    }

    private static double value(WebSocketMessageBrokerStats stats, ToIntFunction<SubProtocolWebSocketHandler.Stats> getter) {
        var sessionStats = stats.getWebSocketSessionStats();
        return sessionStats == null ? 0 : getter.applyAsInt(sessionStats);
    }
}
