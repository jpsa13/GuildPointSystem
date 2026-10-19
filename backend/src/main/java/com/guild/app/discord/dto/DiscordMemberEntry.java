package com.guild.app.discord.dto;

/**
 * @param status         online | idle | dnd | offline
 * @param customStatus   text of the member's custom status, if any
 * @param activity       e.g. "Jogando RF Online", if any
 * @param siteMemberId   member in this app linked by Discord login, if any
 */
public record DiscordMemberEntry(
        String id,
        String name,
        String avatarUrl,
        String color,
        String status,
        String customStatus,
        String activity,
        boolean inVoice,
        Long siteMemberId) {}
