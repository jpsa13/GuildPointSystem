package com.guild.app.party.dto;

import java.time.Instant;

public record PartyLfgEntry(
        Long memberId,
        String nickname,
        String className,
        String classImageUrl,
        int level,
        Float expPercent,
        String note,
        Instant createdAt,
        int priorityPoints,
        long queueOrder,
        Instant lastUnansweredAt,
        Instant afkSince
) {}
