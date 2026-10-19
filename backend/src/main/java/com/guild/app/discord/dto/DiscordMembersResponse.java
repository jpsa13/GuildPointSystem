package com.guild.app.discord.dto;

import java.util.List;

public record DiscordMembersResponse(boolean available, String guildName, List<DiscordRoleGroup> groups) {

    public static DiscordMembersResponse unavailable() {
        return new DiscordMembersResponse(false, null, List.of());
    }
}
