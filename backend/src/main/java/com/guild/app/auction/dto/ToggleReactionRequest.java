package com.guild.app.auction.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ToggleReactionRequest(
        @NotBlank(message = "Escolha um emoji.")
        @Size(max = 64, message = "Emoji inválido.")
        String emoji
) {}
