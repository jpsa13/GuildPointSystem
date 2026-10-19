package com.guild.app.websocket;

import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.config.WebSocketMessageBrokerStats;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import java.util.function.ToIntFunction;

/**
 * Socket metrics in /actuator/metrics and /actuator/prometheus. The STOMP channel thread pools
 * (queued/active) are already published as {@code executor.*} metrics.
 *
 * <ul>
 *   <li>{@code guild.websocket.sessions} (gauge, tag {@code transport}): sockets open right now;
 *       {@code all} is the sum of the three transports.</li>
 *   <li>{@code guild.websocket.sessions.opened} (counter): sessions opened since startup.</li>
 *   <li>{@code guild.websocket.sessions.limit-exceeded} (counter): sessions closed for being too slow
 *       to receive (send buffer/time limit), a client-side latency signal.</li>
 * </ul>
 */
@Component
public class WebSocketMetrics {

    public WebSocketMetrics(WebSocketMessageBrokerStats stats, MeterRegistry registry) {
        // Spring's "total sessions" is cumulative, so "all" is computed from the current per-transport counts.
        registerOpen(registry, stats, "all", s -> s.getWebSocketSessions() + s.getHttpStreamingSessions()
                + s.getHttpPollingSessions());
        registerOpen(registry, stats, "websocket", SubProtocolWebSocketHandler.Stats::getWebSocketSessions);
        registerOpen(registry, stats, "sockjs-streaming", SubProtocolWebSocketHandler.Stats::getHttpStreamingSessions);
        registerOpen(registry, stats, "sockjs-polling", SubProtocolWebSocketHandler.Stats::getHttpPollingSessions);

        FunctionCounter.builder("guild.websocket.sessions.opened", stats,
                        s -> value(s, SubProtocolWebSocketHandler.Stats::getTotalSessions))
                .register(registry);
        FunctionCounter.builder("guild.websocket.sessions.limit-exceeded", stats,
                        s -> value(s, SubProtocolWebSocketHandler.Stats::getLimitExceededSessions))
                .register(registry);
    }

    private static void registerOpen(MeterRegistry registry, WebSocketMessageBrokerStats stats, String transport,
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
