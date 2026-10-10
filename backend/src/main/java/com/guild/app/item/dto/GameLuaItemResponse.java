package com.guild.app.item.dto;

public record GameLuaItemResponse(
        String category,
        int gameIndex,
        String gameCode,
        String name,
        int iconId,
        String spriteSheet,
        int spriteCols,
        int itemGrade,
        int levelRequired
) {}
