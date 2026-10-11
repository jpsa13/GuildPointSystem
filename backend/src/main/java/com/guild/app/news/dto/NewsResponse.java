package com.guild.app.news.dto;

import java.time.Instant;

public record NewsResponse(
        Long id,
        String title,
        String contentHtml,
        Long authorId,
        String authorNickname,
        Instant createdAt,
        String editorNickname,
        Instant updatedAt
) {}
