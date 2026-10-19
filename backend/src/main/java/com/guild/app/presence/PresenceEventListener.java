package com.guild.app.presence;

import com.guild.app.auth.security.MemberPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/** A member is online while at least one authenticated STOMP session of theirs is open. */
@Component
@RequiredArgsConstructor
public class PresenceEventListener {

    private final PresenceRegistry presenceRegistry;

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        if (!(event.getUser() instanceof Authentication auth) || !(auth.getPrincipal() instanceof MemberPrincipal member)) {
            return;
        }
        var sessionId = StompHeaderAccessor.wrap(event.getMessage()).getSessionId();
        if (sessionId != null) presenceRegistry.connected(sessionId, member.getId());
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        presenceRegistry.disconnected(event.getSessionId());
    }
}
