package com.guild.app.presence;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.presence.dto.PresencePong;
import com.guild.app.presence.dto.PresenceReport;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Clients SEND to {@code /app/presence} on every page change and every 15s. The pong goes back only to
 * the tab that sent it, which turns the exchange into a round-trip measurement over the live socket.
 */
@Controller
@RequiredArgsConstructor
public class PresenceWsController {

    private final PresenceRegistry presenceRegistry;

    @MessageMapping("/presence")
    @SendToUser(destinations = "/queue/presence-pong", broadcast = false)
    public PresencePong report(@Payload PresenceReport report, Principal principal,
                               @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String sessionId) {
        if (!(principal instanceof Authentication auth) || !(auth.getPrincipal() instanceof MemberPrincipal member)) {
            return null;
        }
        presenceRegistry.report(sessionId, member.getId(), report.page(), report.detail(), report.transport(),
                report.rttMs(), report.hidden());
        return new PresencePong(report.pingId());
    }
}
