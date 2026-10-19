package com.guild.app.presence.dto;

/**
 * Sent by the client on every page change and every 15s. {@code pingId} is echoed back so the client can
 * time the round trip; {@code rttMs} carries the previous measurement.
 */
public record PresenceReport(
        String pingId,
        String page,
        String detail,
        String transport,
        Integer rttMs,
        boolean hidden
) {}
