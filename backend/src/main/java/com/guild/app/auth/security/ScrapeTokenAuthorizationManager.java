package com.guild.app.auth.security;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.function.Supplier;

/**
 * Lets the metrics collector (Grafana Alloy) scrape {@code /actuator/prometheus} with a static
 * {@code Authorization: Bearer <token>}: a member JWT expires after a day, so it can't be used by a job.
 * With no token configured the endpoint is closed to everyone.
 */
public class ScrapeTokenAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    private static final String BEARER = "Bearer ";

    private final byte[] expected;

    public ScrapeTokenAuthorizationManager(String token) {
        this.expected = token == null || token.isBlank() ? null : token.trim().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {
        if (expected == null) return new AuthorizationDecision(false);
        var header = context.getRequest().getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) return new AuthorizationDecision(false);
        var given = header.substring(BEARER.length()).trim().getBytes(StandardCharsets.UTF_8);
        // Constant-time comparison: response timing must not reveal how much of the token matched.
        return new AuthorizationDecision(MessageDigest.isEqual(expected, given));
    }
}
