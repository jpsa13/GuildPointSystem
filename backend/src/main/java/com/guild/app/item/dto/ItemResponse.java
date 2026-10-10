package com.guild.app.item.dto;

import com.guild.app.common.enums.ItemType;

import java.time.Instant;
import java.util.List;

public record ItemResponse(
        Long id,
        ItemType type,
        String name,
        String rarity,
        String imageUrl,
        String gameCode,
        GameIcon gameIcon,
        String description,
        Object details,
        List<TalicResponse> talics,
        Instant createdAt
) {
    public record GameIcon(
            String category,
            int gameIndex,
            String gameCode,
            int iconId,
            String spriteSheet,
            int spriteCols
    ) {}
    public record TalicResponse(String talicType, Integer level, Integer slot) {}

    public record WeaponDetails(
            Integer level,
            String subtype,
            Integer attackMin,
            Integer attackMax,
            Integer forceAttackMin,
            Integer forceAttackMax,
            String castName,
            List<String> specialEffects
    ) {}

    public record ArmorDetails(
            Integer level,
            String subtype,
            String armorClass,
            Integer avgDefPower,
            Integer defenseSuccessRate,
            List<String> specialEffects
    ) {}

    public record AccessoryDetails(
            Long raceId,
            String raceName,
            String subtype,
            List<String> specialEffects
    ) {}
}
