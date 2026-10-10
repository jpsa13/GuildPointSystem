package com.guild.app.item.dto;

import com.guild.app.common.enums.ItemType;

import java.util.List;

public record UpdateItemRequest(
        ItemType type,
        String name,
        String rarity,
        String imageUrl,
        String gameCode,
        String description,
        CreateItemRequest.WeaponData weapon,
        CreateItemRequest.ArmorData armor,
        CreateItemRequest.AccessoryData accessory,
        List<CreateItemRequest.TalicData> talics
) {}
