package com.guild.app.party.dto;

public record PartyMemberSummary(
        Long id,
        String nickname,
        String className,
        String classImageUrl,
        int level,
        Float expPercent,
        boolean leader,
        java.time.Instant afkUntil
) {}
