package com.guild.app.presence.dto;

import java.time.Instant;

/**
 * {@code page} is one of {@code PresenceRegistry.PAGES}; {@code detail} narrows it (e.g. the auction id).
 * {@code rttMs} is the member's last measured round trip to the server; {@code hidden} means the tab is
 * in the background. {@code tabs} counts the member's open sockets.
 */
public record OnlineMember(
        Long memberId,
        String nickname,
        String className,
        String classImageUrl,
        String page,
        String detail,
        String transport,
        Integer rttMs,
        boolean hidden,
        Instant onlineSince,
        int tabs
) {}
