package com.guild.app.common.logging;

import com.guild.app.auth.security.MemberPrincipal;
import org.slf4j.MDC;

import java.security.SecureRandom;
import java.util.Map;

/**
 * MDC keys shared by the HTTP access log, the WebSocket message log and any log written while handling a
 * request, so a stack trace carries the same request id and member as the request that caused it.
 * In Loki they show up as {@code mdc_<key>}.
 */
public final class RequestLogContext {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    public static final String REQUEST_ID = "requestId";
    public static final String MEMBER_ID = "memberId";
    public static final String MEMBER = "member";
    public static final String ROLE = "role";
    public static final String TRANSPORT = "transport";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();

    private RequestLogContext() {}

    /** Short, unambiguous id a member can read back from an error message (no 0/o, 1/l/i). */
    public static String newRequestId() {
        var id = new char[10];
        for (int i = 0; i < id.length; i++) id[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        return new String(id);
    }

    public static void putMember(MemberPrincipal member) {
        if (member == null) return;
        MDC.put(MEMBER_ID, String.valueOf(member.getId()));
        if (member.getNickname() != null) MDC.put(MEMBER, member.getNickname());
        if (member.getRole() != null) MDC.put(ROLE, member.getRole().name());
    }

    public static void clearMember() {
        MDC.remove(MEMBER_ID);
        MDC.remove(MEMBER);
        MDC.remove(ROLE);
    }

    /** Puts extra fields for one log call and returns a handle that removes them again. */
    public static AutoCloseable with(Map<String, String> fields) {
        fields.forEach((k, v) -> {
            if (v != null) MDC.put(k, v);
        });
        return () -> fields.keySet().forEach(MDC::remove);
    }
}
