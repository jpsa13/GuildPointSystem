package com.guild.app.auction.dto;

import jakarta.validation.constraints.NotBlank;

public record ChatMessageRequest(
        @NotBlank(message = "Digite uma mensagem.")
        String content,
        /** Id of the message being replied to (optional). */
        Long replyToId
) {}
