package com.guild.app.item.controller;

import com.guild.app.item.dto.*;
import com.guild.app.item.service.CatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/catalog")
@RequiredArgsConstructor
public class CatalogController {

    private final CatalogService catalogService;

    @GetMapping("/accessories")
    public Page<GameAccessoryResponse> listAccessories(
            @RequestParam(required = false) String subtype,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String civilMask,
            @RequestParam(required = false) String search,
            Pageable pageable) {
        return catalogService.listAccessories(subtype, grade, civilMask, search, pageable);
    }

    @GetMapping("/accessories/icon-index")
    public List<GameAccessoryIconResponse> listAccessoryIconIndex() {
        return catalogService.listAccessoryIconRefs();
    }

    @GetMapping("/accessories/{gameCode}")
    public GameAccessoryResponse getAccessory(@PathVariable String gameCode) {
        return catalogService.getAccessory(gameCode);
    }

    @GetMapping("/armor")
    public Page<GameArmorResponse> listArmor(
            @RequestParam(required = false) String slot,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String civilMask,
            @RequestParam(required = false) Integer minLevel,
            @RequestParam(required = false) String search,
            Pageable pageable) {
        return catalogService.listArmor(slot, grade, civilMask, minLevel, search, pageable);
    }

    @GetMapping("/armor/icon-index")
    public List<GameArmorIconResponse> listArmorIconIndex() {
        return catalogService.listArmorIconRefs();
    }

    @GetMapping("/armor/{gameCode}")
    public GameArmorResponse getArmor(@PathVariable String gameCode) {
        return catalogService.getArmor(gameCode);
    }

    @GetMapping("/weapons")
    public Page<GameWeaponResponse> listWeapons(
            @RequestParam(required = false) String weaponType,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String civilMask,
            @RequestParam(required = false) Integer minLevel,
            @RequestParam(required = false) String search,
            Pageable pageable) {
        return catalogService.listWeapons(weaponType, grade, civilMask, minLevel, search, pageable);
    }

    @GetMapping("/weapons/icon-index")
    public List<GameWeaponIconResponse> listWeaponIconIndex() {
        return catalogService.listWeaponIconRefs();
    }

    @GetMapping("/weapons/{gameCode}")
    public GameWeaponResponse getWeapon(@PathVariable String gameCode) {
        return catalogService.getWeapon(gameCode);
    }

    @GetMapping("/lua-items")
    public Page<GameLuaItemResponse> listLuaItems(
            @RequestParam String category,
            @RequestParam(required = false) String search,
            Pageable pageable) {
        return catalogService.listLuaItems(category, search, pageable);
    }

    @GetMapping("/lua-items/{gameCode}")
    public GameLuaItemResponse getLuaItem(@PathVariable String gameCode) {
        return catalogService.getLuaItem(gameCode);
    }

    @GetMapping("/effects")
    public List<EffectDefinitionResponse> listEffects() {
        return catalogService.listEffects();
    }

    @GetMapping("/sets")
    public List<ItemSetResponse> listSets(@RequestParam(required = false) String gameCode) {
        if (gameCode != null && !gameCode.isBlank()) {
            return catalogService.listSetsForGameCode(gameCode);
        }
        return catalogService.listAllSets();
    }
}
