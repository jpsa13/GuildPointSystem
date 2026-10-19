package com.guild.app.auth.security;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.member.entity.Member;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    private static final String SECRET = "test-secret-key-minimum-256-bits-for-hmac-sha256-algorithm";
    private static final long DAY_MS = Duration.ofDays(1).toMillis();

    private final JwtService jwt = new JwtService(SECRET, DAY_MS, 30);

    private static MemberPrincipal principal(long id) {
        var m = new Member();
        m.setId(id);
        m.setEmail("m" + id + "@test");
        m.setNickname("M" + id);
        m.setRole(Role.MEMBRO);
        m.setStatus(MemberStatus.APROVADO);
        return new MemberPrincipal(m);
    }

    /** A token as an older login would have produced (signed with the same key). */
    private static String token(long memberId, Instant issuedAt, Long authTime) {
        var builder = Jwts.builder()
                .subject(String.valueOf(memberId))
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(Instant.now().plus(Duration.ofHours(1))));
        if (authTime != null) builder.claim(JwtService.AUTH_TIME, authTime);
        return builder.signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();
    }

    @Test
    void renewalKeepsTheOriginalLoginTime() {
        long loggedInAt = Instant.now().minus(Duration.ofDays(3)).getEpochSecond();
        var renewed = jwt.renew(token(7, Instant.now(), loggedInAt), principal(7));
        assertThat(renewed).isPresent();
        assertThat(jwt.extractMemberId(renewed.get())).isEqualTo(7L);
        var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).build()
                .parseSignedClaims(renewed.get()).getPayload();
        assertThat(claims.get(JwtService.AUTH_TIME, Number.class).longValue()).isEqualTo(loggedInAt);
    }

    @Test
    void sessionOlderThanTheLimitMustLogInAgain() {
        long loggedInAt = Instant.now().minus(Duration.ofDays(31)).getEpochSecond();
        assertThat(jwt.renew(token(7, Instant.now(), loggedInAt), principal(7))).isEmpty();
    }

    @Test
    void tokensFromBeforeAuthTimeCountFromTheirIssueDate() {
        assertThat(jwt.renew(token(7, Instant.now().minus(Duration.ofHours(20)), null), principal(7))).isPresent();
        assertThat(jwt.renew(token(7, Instant.now().minus(Duration.ofDays(40)), null), principal(7))).isEmpty();
    }

    @Test
    void cannotRenewSomeoneElsesTokenOrGarbage() {
        assertThat(jwt.renew(token(8, Instant.now(), null), principal(7))).isEmpty();
        assertThat(jwt.renew("not-a-jwt", principal(7))).isEmpty();
    }

    @Test
    void freshLoginsCarryAuthTime() {
        var token = jwt.generateToken(principal(7));
        assertThat(jwt.renew(token, principal(7))).isPresent();
    }
}
