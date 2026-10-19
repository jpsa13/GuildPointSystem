package com.guild.app.discord;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Getter
@Setter
@ConfigurationProperties(prefix = "guild.discord.bot")
public class DiscordBotProperties {

    /** Bot token from the Developer Portal; blank disables the member list. */
    private String token = "";

    /** Server to read; blank = first server the bot is in. */
    private String guildId = "";

    /** Role names shown in the list, in display order (a member goes under the first one they have). */
    private List<String> roles = List.of("Leader", "Cerberus");

    public boolean isEnabled() {
        return token != null && !token.isBlank();
    }
}
