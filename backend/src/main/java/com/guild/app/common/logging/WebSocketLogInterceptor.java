package com.guild.app.common.logging;

import com.guild.app.auth.security.MemberPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.annotation.support.SimpAnnotationMethodMessageHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ExecutorChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * The WebSocket counterpart of {@link AccessLogFilter}: STOMP SENDs (bids, …) never go through HTTP.
 * While a SEND is handled the MDC carries a request id and the member, so the controller's own logs and
 * any stack trace are tied to them; afterwards one line records the destination and duration.
 * Presence pings (every 15s per tab) are not logged.
 */
@Component
public class WebSocketLogInterceptor implements ExecutorChannelInterceptor {

    private static final Logger WS = LoggerFactory.getLogger("guild.ws");
    private static final String PRESENCE_DESTINATION = "/app/presence";

    private final ThreadLocal<Long> startedAt = new ThreadLocal<>();

    @Override
    public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
        if (!isAppSend(message, handler)) return message;
        MDC.clear();
        MDC.put(RequestLogContext.REQUEST_ID, RequestLogContext.newRequestId());
        MDC.put(RequestLogContext.TRANSPORT, "ws");
        var accessor = StompHeaderAccessor.wrap(message);
        if (accessor.getUser() instanceof Authentication auth && auth.getPrincipal() instanceof MemberPrincipal member) {
            RequestLogContext.putMember(member);
        }
        startedAt.set(System.nanoTime());
        return message;
    }

    @Override
    public void afterMessageHandled(Message<?> message, MessageChannel channel, MessageHandler handler, Exception ex) {
        if (!isAppSend(message, handler)) return;
        try {
            var destination = StompHeaderAccessor.wrap(message).getDestination();
            var start = startedAt.get();
            long ms = start == null ? 0 : (System.nanoTime() - start) / 1_000_000;
            if (destination != null && !destination.startsWith(PRESENCE_DESTINATION)) {
                var member = MDC.get(RequestLogContext.MEMBER);
                try (var ignored = RequestLogContext.with(Map.of(
                        "method", "SEND", "path", destination, "durationMs", String.valueOf(ms),
                        "status", ex == null ? "ok" : "error"))) {
                    var event = WS.atLevel(ex != null ? Level.ERROR : ms >= AccessLogFilter.SLOW_MS ? Level.WARN : Level.INFO);
                    if (ex != null) event = event.setCause(ex);
                    event.log("SEND {} in {}ms{}", destination, ms, member != null ? " by " + member : "");
                }
            }
        } catch (Exception ignored) {
            // Logging must never break message handling.
        } finally {
            startedAt.remove();
            MDC.clear();
        }
    }

    /** Only the @MessageMapping handler: the same SEND also reaches the broker handlers. */
    private static boolean isAppSend(Message<?> message, MessageHandler handler) {
        if (!(handler instanceof SimpAnnotationMethodMessageHandler)) return false;
        var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        return accessor != null && StompCommand.SEND.equals(accessor.getCommand());
    }
}
