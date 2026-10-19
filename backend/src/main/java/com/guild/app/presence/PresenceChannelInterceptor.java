package com.guild.app.presence;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * Drops a tab from presence as soon as it sends STOMP DISCONNECT (the client does on F5 / closing the tab).
 * Spring only ends the session once the socket itself closes, and behind a proxy that keeps the upstream
 * connection open that takes until the missed heartbeats are noticed (~40s).
 */
@Component
@RequiredArgsConstructor
public class PresenceChannelInterceptor implements ChannelInterceptor {

    private final PresenceRegistry presenceRegistry;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && StompCommand.DISCONNECT.equals(accessor.getCommand()) && accessor.getSessionId() != null) {
            presenceRegistry.disconnected(accessor.getSessionId());
        }
        return message;
    }
}
