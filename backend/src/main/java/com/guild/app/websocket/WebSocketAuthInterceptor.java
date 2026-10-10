package com.guild.app.websocket;

import com.guild.app.auth.security.JwtService;
import com.guild.app.auth.security.MemberDetailsService;
import com.guild.app.auth.security.MemberPrincipal;
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
        }
        return message;
    }
}
