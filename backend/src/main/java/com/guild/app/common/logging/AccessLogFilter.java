package com.guild.app.common.logging;

import com.guild.app.auth.security.MemberPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashMap;

/**
 * One log line per API request: who (member), what (method, path), outcome (status, duration) and from
 * where (client IP, browser). Runs before Spring Security, so rejected requests (401/403) are logged too.
 * Every response carries {@code X-Request-Id}; the frontend shows it on server errors so a member can
 * report it and the exact request (and its stack trace) can be found in Grafana.
 */
public class AccessLogFilter extends OncePerRequestFilter {

    /** Set by the JWT filter once the member is known. */
    public static final String MEMBER_ATTRIBUTE = AccessLogFilter.class.getName() + ".member";

    static final long SLOW_MS = 1000;
    private static final int MAX_USER_AGENT = 160;
    private static final Logger ACCESS = LoggerFactory.getLogger("guild.access");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Only the API: uploads/static files and the actuator would only add volume.
        return !request.getRequestURI().startsWith("/api/") || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var requestId = RequestLogContext.newRequestId();
        response.setHeader(RequestLogContext.REQUEST_ID_HEADER, requestId);
        MDC.clear();
        MDC.put(RequestLogContext.REQUEST_ID, requestId);
        MDC.put(RequestLogContext.TRANSPORT, "http");
        long start = System.nanoTime();
        boolean failed = false;
        try {
            chain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException e) {
            failed = true;
            throw e;
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            log(request, failed ? 500 : response.getStatus(), ms);
            MDC.clear();
        }
    }

    private void log(HttpServletRequest request, int status, long ms) {
        if (request.getAttribute(MEMBER_ATTRIBUTE) instanceof MemberPrincipal member) {
            RequestLogContext.putMember(member);
        }
        var fields = new HashMap<String, String>();
        fields.put("method", request.getMethod());
        fields.put("path", request.getRequestURI());
        fields.put("status", String.valueOf(status));
        fields.put("durationMs", String.valueOf(ms));
        fields.put("ip", clientIp(request));
        fields.put("userAgent", truncate(request.getHeader("User-Agent")));

        try (var ignored = RequestLogContext.with(fields)) {
            var member = MDC.get(RequestLogContext.MEMBER);
            ACCESS.atLevel(level(status, ms)).log("{} {} -> {} in {}ms{}", request.getMethod(),
                    request.getRequestURI(), status, ms, member != null ? " by " + member : "");
        } catch (Exception ignored) {
            // Removing MDC keys cannot fail.
        }
    }

    static Level level(int status, long ms) {
        if (status >= 500) return Level.ERROR;
        if (status >= 400 || ms >= SLOW_MS) return Level.WARN;
        return Level.INFO;
    }

    /** Behind the Coolify proxy the client is the first X-Forwarded-For entry. */
    static String clientIp(HttpServletRequest request) {
        var forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    private static String truncate(String value) {
        if (value == null) return null;
        return value.length() <= MAX_USER_AGENT ? value : value.substring(0, MAX_USER_AGENT);
    }
}
