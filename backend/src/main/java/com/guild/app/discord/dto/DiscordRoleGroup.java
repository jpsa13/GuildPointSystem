package com.guild.app.discord.dto;

import java.util.List;

/** One role section of the list, like Discord's "Leader — 3". */
public record DiscordRoleGroup(String id, String name, String color, int onlineCount, List<DiscordMemberEntry> members) {}
