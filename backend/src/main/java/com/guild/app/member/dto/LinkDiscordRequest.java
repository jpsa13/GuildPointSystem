package com.guild.app.member.dto;

import jakarta.validation.constraints.Pattern;

/** {@code discordId} null or blank unlinks. */
public record LinkDiscordRequest(
        @Pattern(regexp = "^\\s*$|^\\d{17,20}$", message = "ID do Discord inválido.") String discordId
) {}
