package com.guild.app.item.dto;

import com.guild.app.common.enums.ItemType;

import java.util.List;

public record CreateItemRequest(
        ItemType type,
        String name,
        String rarity,
        String imageUrl,
        String gameCode,
        String description,
        WeaponData weapon,
        ArmorData armor,
        AccessoryData accessory,
        List<TalicData> talics
) {
    public record WeaponData(
            Integer level, String subtype,
            Integer attackMin, Integer attackMax,
            Integer forceAttackMin, Integer forceAttackMax,
            String castName, List<String> specialEffects
    ) {}

    public record ArmorData(
            Integer level, String subtype, String armorClass,
            Integer avgDefPower, Integer defenseSuccessRate,
            List<String> specialEffects
    ) {}

    public record AccessoryData(Long raceId, String subtype, List<String> specialEffects) {}

    public record TalicData(String talicType, Integer level, Integer slot) {}
}
