package com.guild.app.websocket;

import com.guild.app.auth.security.JwtService;
import com.guild.app.auth.security.MemberDetailsService;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Binds the STOMP session to the member from the CONNECT {@code Authorization: Bearer} header.
 * Anonymous sessions may still subscribe to public topics, but cannot SEND to {@code /app/**}.
 */
@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final String PARTY_TOPIC = "/topic/parties";
    private static final String PARTY_MEMBER_TOPIC = "/topic/parties/member/";
    private static final String PRESENCE_TOPIC = "/topic/presence";
    private static final String APPROVALS_TOPIC = "/topic/approvals";

    private final JwtService jwtService;
    private final MemberDetailsService memberDetailsService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            var header = accessor.getFirstNativeHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                var token = header.substring(7);
                try {
                    if (jwtService.isValid(token)) {
                        var principal = (MemberPrincipal) memberDetailsService.loadById(jwtService.extractMemberId(token));
                        accessor.setUser(new UsernamePasswordAuthenticationToken(
                                principal, null, principal.getAuthorities()));
                    }
                } catch (Exception ignored) {
                    // Invalid token → anonymous session.
                }
            }
        } else if (StompCommand.SEND.equals(accessor.getCommand()) && accessor.getUser() == null) {
            throw new IllegalStateException("Não autorizado. Faça login novamente.");
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            checkPartySubscription(accessor);
            checkPresenceSubscription(accessor);
            checkApprovalsSubscription(accessor);
        }
        return message;
    }

    /** Who is online and where: leadership only, like {@code GET /api/presence}. */
    private void checkPresenceSubscription(StompHeaderAccessor accessor) {
        var destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(PRESENCE_TOPIC)) return;

        var member = accessor.getUser() instanceof UsernamePasswordAuthenticationToken auth
                && auth.getPrincipal() instanceof MemberPrincipal principal ? principal : null;
        if (member == null || member.getStatus() != MemberStatus.APROVADO
                || !member.getRole().isAtLeast(Role.ADMINISTRADOR)) {
            throw new IllegalStateException("Não autorizado.");
        }
    }

    /** Pending registrations: moderators and above, like {@code GET /api/members/pending}. */
    private void checkApprovalsSubscription(StompHeaderAccessor accessor) {
        var destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(APPROVALS_TOPIC)) return;

        var member = accessor.getUser() instanceof UsernamePasswordAuthenticationToken auth
                && auth.getPrincipal() instanceof MemberPrincipal principal ? principal : null;
        if (member == null || member.getStatus() != MemberStatus.APROVADO
                || !member.getRole().isAtLeast(Role.MODERADOR)) {
            throw new IllegalStateException("Não autorizado.");
        }
    }

    /**
     * The party topics carry the board (same visibility as {@code GET /parties/board}: approved members),
     * and each member's notice topic is readable only by that member.
     */
    private void checkPartySubscription(StompHeaderAccessor accessor) {
        var destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(PARTY_TOPIC)) return;

        var member = accessor.getUser() instanceof UsernamePasswordAuthenticationToken auth
                && auth.getPrincipal() instanceof MemberPrincipal principal ? principal : null;
        if (member == null || member.getStatus() != MemberStatus.APROVADO) {
            throw new IllegalStateException("Não autorizado.");
        }
        if (destination.startsWith(PARTY_MEMBER_TOPIC) && !destination.equals(PARTY_MEMBER_TOPIC + member.getId())) {
            throw new IllegalStateException("Não autorizado.");
        }
    }
}
