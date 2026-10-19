package com.guild.app.auth.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

/**
 * Tokens last {@code guild.jwt.expiration-ms} (24h) and are renewed while the member uses the app
 * ({@code POST /api/auth/refresh}). The {@code auth_time} claim keeps the original login time across
 * renewals, so a session can't be stretched past {@code guild.jwt.max-session-days} without logging in.
 */
@Component
public class JwtService {

    static final String AUTH_TIME = "auth_time";

    private final SecretKey key;
    private final long expirationMs;
    private final Duration maxSession;

    public JwtService(
            @Value("${guild.jwt.secret}") String secret,
            @Value("${guild.jwt.expiration-ms}") long expirationMs,
            @Value("${guild.jwt.max-session-days:30}") long maxSessionDays) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
        this.maxSession = Duration.ofDays(maxSessionDays);
    }

    public String generateToken(MemberPrincipal principal) {
        return generateToken(principal, Instant.now());
    }

    /**
     * A renewed token for the same login, or empty when the token is invalid/expired or the session
     * already reached its maximum age (the member has to log in again).
     */
    public Optional<String> renew(String token, MemberPrincipal principal) {
        Claims claims;
        try {
            claims = parseClaims(token);
        } catch (Exception e) {
            return Optional.empty();
        }
        if (!String.valueOf(principal.getId()).equals(claims.getSubject())) return Optional.empty();
        var authTime = authTime(claims);
        if (authTime.plus(maxSession).isBefore(Instant.now())) return Optional.empty();
        return Optional.of(generateToken(principal, authTime));
    }

    private String generateToken(MemberPrincipal principal, Instant authTime) {
        return Jwts.builder()
                .subject(String.valueOf(principal.getId()))
                .claim("role", principal.getRole().name())
                .claim(AUTH_TIME, authTime.getEpochSecond())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    /** Tokens issued before auth_time existed count from their own issue date. */
    private static Instant authTime(Claims claims) {
        var authTime = claims.get(AUTH_TIME, Number.class);
        if (authTime != null) return Instant.ofEpochSecond(authTime.longValue());
        return claims.getIssuedAt() != null ? claims.getIssuedAt().toInstant() : Instant.now();
    }

    public Long extractMemberId(String token) {
        Claims claims = parseClaims(token);
        return Long.parseLong(claims.getSubject());
    }

    public boolean isValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
