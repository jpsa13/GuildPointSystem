package com.guild.app.item.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.ItemType;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.item.dto.CreateItemRequest;
import com.guild.app.item.dto.ItemResponse;
import com.guild.app.item.dto.UpdateItemRequest;
import com.guild.app.item.entity.*;
import com.guild.app.item.repository.*;
import com.guild.app.item.validation.TalicValidator;
import com.guild.app.member.repository.GameRaceRepository;
import com.guild.app.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItemService {

    private final ItemRepository itemRepository;
    private final ItemWeaponRepository itemWeaponRepository;
    private final ItemArmorRepository itemArmorRepository;
    private final ItemAccessoryRepository itemAccessoryRepository;
    private final ItemMiscRepository itemMiscRepository;
    private final ItemTalicRepository itemTalicRepository;
    private final GameRaceRepository gameRaceRepository;
    private final GameLuaItemRepository gameLuaItemRepository;
    private final MemberRepository memberRepository;

    public Page<ItemResponse> list(String category, String search, Pageable pageable) {
        var trimmedSearch = search != null ? search.trim() : "";
        var hasSearch = !trimmedSearch.isEmpty();
        var cat = category != null && !category.isBlank() ? category.trim().toUpperCase() : null;
        var page = itemRepository.findGuildInventoryPage(cat, hasSearch, trimmedSearch, pageable);
        var iconMap = loadIconMap(page.getContent());
        return page.map(item -> toResponse(item, resolveIconFromMap(iconMap, item.getGameCode())));
    }

    public ItemResponse getById(Long id) {
        var item = itemRepository.findById(id)
                .filter(i -> !i.isDeleted())
                .orElseThrow(() -> new AppException("Item não encontrado.", HttpStatus.NOT_FOUND));
        var icon = resolveIcon(item.getGameCode());
        return toResponse(item, icon);
    }

    @Transactional
    public ItemResponse create(CreateItemRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        validateImageOrGameCode(request.imageUrl(), request.gameCode());
        var gameCode = normalizeGameCode(request.gameCode());
        GameLuaItem luaRef = null;
        if (gameCode != null) {
            luaRef = gameLuaItemRepository.findByGameCode(gameCode)
                    .orElseThrow(() -> new AppException("Item do jogo não encontrado no catálogo Lua.", HttpStatus.BAD_REQUEST));
        }

        var item = new Item();
        item.setType(request.type());
        item.setName(request.name());
        item.setRarity(request.rarity());
        item.setImageUrl(blankToNull(request.imageUrl()));
        item.setGameCode(gameCode);
        item.setLuaCategory(luaRef != null ? luaRef.getCategory() : null);
        item.setDescription(request.description());
        item.setCreatedBy(memberRepository.getReferenceById(actor.getId()));
        item = itemRepository.save(item);

        applyTypeData(item, request);
        saveTalics(item, request);

        return toResponse(item, resolveIcon(gameCode));
    }

    @Transactional
    public ItemResponse update(Long id, UpdateItemRequest request) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var item = itemRepository.findById(id)
                .filter(i -> !i.isDeleted())
                .orElseThrow(() -> new AppException("Item não encontrado.", HttpStatus.NOT_FOUND));
        if (item.getType() != request.type()) {
            throw new AppException("Não é permitido alterar o tipo do item.", HttpStatus.BAD_REQUEST);
        }

        validateImageOrGameCode(request.imageUrl(), request.gameCode());
        var gameCode = normalizeGameCode(request.gameCode());
        GameLuaItem luaRef = null;
        if (gameCode != null) {
            luaRef = gameLuaItemRepository.findByGameCode(gameCode)
                    .orElseThrow(() -> new AppException("Item do jogo não encontrado no catálogo Lua.", HttpStatus.BAD_REQUEST));
        }

        item.setName(request.name());
        item.setRarity(request.rarity());
        item.setGameCode(gameCode);
        item.setLuaCategory(luaRef != null ? luaRef.getCategory() : item.getLuaCategory());
        item.setDescription(request.description());
        if (request.imageUrl() != null && !request.imageUrl().isBlank()) {
            item.setImageUrl(request.imageUrl());
        } else if (gameCode != null && (item.getImageUrl() == null || item.getImageUrl().isBlank())) {
            item.setImageUrl(null);
        }
        itemRepository.save(item);

        var createShape = new CreateItemRequest(
                request.type(), request.name(), request.rarity(), request.imageUrl(), request.gameCode(),
                request.description(), request.weapon(), request.armor(), request.accessory(), request.talics());
        applyTypeData(item, createShape);
        itemTalicRepository.deleteAll(itemTalicRepository.findByItemId(item.getId()));
        saveTalics(item, createShape);

        return toResponse(item, resolveIcon(gameCode));
    }

    @Transactional
    public void delete(Long id) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var item = itemRepository.findById(id)
                .filter(i -> !i.isDeleted())
                .orElseThrow(() -> new AppException("Item não encontrado.", HttpStatus.NOT_FOUND));
        item.setDeleted(true);
        itemRepository.save(item);
    }

    private void applyTypeData(Item item, CreateItemRequest request) {
        switch (request.type()) {
            case WEAPON -> upsertWeapon(item, request);
            case ARMOR -> upsertArmor(item, request);
            case ACCESSORY -> upsertAccessory(item, request);
            case MISC -> ensureMisc(item);
        }
    }

    private void saveTalics(Item item, CreateItemRequest request) {
        if (request.talics() == null || request.talics().isEmpty()) {
            return;
        }
        var talicInputs = request.talics().stream()
                .map(t -> new TalicValidator.TalicInput(t.talicType(), t.level(), t.slot()))
                .toList();
        if (request.type() == ItemType.WEAPON) {
            TalicValidator.validateWeaponTalics(talicInputs);
        } else if (request.type() == ItemType.ARMOR && request.armor() != null) {
            TalicValidator.validateArmorTalics(request.armor().subtype(), talicInputs);
        }
        for (var t : request.talics()) {
            var talic = new ItemTalic();
            talic.setItem(item);
            talic.setTalicType(t.talicType());
            talic.setLevel(t.level());
            talic.setSlot(t.slot());
            itemTalicRepository.save(talic);
        }
    }

    private void upsertWeapon(Item item, CreateItemRequest request) {
        if (request.weapon() == null) {
            throw new AppException("Informe os dados da arma.", HttpStatus.BAD_REQUEST);
        }
        var w = request.weapon();
        var weapon = itemWeaponRepository.findById(item.getId()).orElseGet(() -> {
            var entity = new ItemWeapon();
            entity.setItem(item);
            return entity;
        });
        weapon.setLevel(w.level() != null ? w.level() : 0);
        weapon.setSubtype(w.subtype());
        weapon.setAttackMin(w.attackMin() != null ? w.attackMin() : 0);
        weapon.setAttackMax(w.attackMax() != null ? w.attackMax() : 0);
        weapon.setForceAttackMin(w.forceAttackMin() != null ? w.forceAttackMin() : 0);
        weapon.setForceAttackMax(w.forceAttackMax() != null ? w.forceAttackMax() : 0);
        weapon.setCastName(w.castName());
        weapon.setSpecialEffects(w.specialEffects() != null ? w.specialEffects().stream().limit(4).toList() : List.of());
        itemWeaponRepository.save(weapon);
    }

    private void upsertArmor(Item item, CreateItemRequest request) {
        if (request.armor() == null) {
            throw new AppException("Informe os dados da armadura.", HttpStatus.BAD_REQUEST);
        }
        var a = request.armor();
        var armor = itemArmorRepository.findById(item.getId()).orElseGet(() -> {
            var entity = new ItemArmor();
            entity.setItem(item);
            return entity;
        });
        armor.setLevel(a.level() != null ? a.level() : 0);
        armor.setSubtype(a.subtype());
        armor.setArmorClass(a.armorClass());
        armor.setAvgDefPower(a.avgDefPower() != null ? a.avgDefPower() : 0);
        armor.setDefenseSuccessRate(a.defenseSuccessRate() != null ? a.defenseSuccessRate() : 0);
        armor.setSpecialEffects(a.specialEffects() != null ? a.specialEffects().stream().limit(4).toList() : List.of());
        itemArmorRepository.save(armor);
    }

    private void upsertAccessory(Item item, CreateItemRequest request) {
        if (request.accessory() == null) {
            throw new AppException("Informe os dados do acessório.", HttpStatus.BAD_REQUEST);
        }
        var a = request.accessory();
        var race = gameRaceRepository.findById(a.raceId())
                .orElseThrow(() -> new AppException("Raça inválida.", HttpStatus.BAD_REQUEST));
        var accessory = itemAccessoryRepository.findById(item.getId()).orElseGet(() -> {
            var entity = new ItemAccessory();
            entity.setItem(item);
            return entity;
        });
        accessory.setRace(race);
        accessory.setSubtype(a.subtype());
        accessory.setSpecialEffects(a.specialEffects() != null ? a.specialEffects().stream().limit(4).toList() : List.of());
        itemAccessoryRepository.save(accessory);
    }

    private void ensureMisc(Item item) {
        if (!itemMiscRepository.existsById(item.getId())) {
            var misc = new ItemMisc();
            misc.setItem(item);
            itemMiscRepository.save(misc);
        }
    }

    private Map<String, GameLuaItem> loadIconMap(List<Item> items) {
        var codes = items.stream()
                .map(Item::getGameCode)
                .filter(code -> code != null && !code.isBlank())
                .distinct()
                .toList();
        if (codes.isEmpty()) {
            return Map.of();
        }
        return gameLuaItemRepository.findByGameCodeIn(codes).stream()
                .collect(Collectors.toMap(GameLuaItem::getGameCode, Function.identity(), (a, b) -> a));
    }

    private static GameLuaItem resolveIconFromMap(Map<String, GameLuaItem> iconMap, String gameCode) {
        if (gameCode == null || gameCode.isBlank()) {
            return null;
        }
        return iconMap.get(gameCode);
    }

    private GameLuaItem resolveIcon(String gameCode) {
        if (gameCode == null || gameCode.isBlank()) {
            return null;
        }
        return gameLuaItemRepository.findByGameCode(gameCode).orElse(null);
    }

    private ItemResponse toResponse(Item item, GameLuaItem luaItem) {
        Object details = switch (item.getType()) {
            case WEAPON -> itemWeaponRepository.findById(item.getId())
                    .map(w -> new ItemResponse.WeaponDetails(
                            w.getLevel(), w.getSubtype(),
                            w.getAttackMin(), w.getAttackMax(),
                            w.getForceAttackMin(), w.getForceAttackMax(),
                            w.getCastName(), w.getSpecialEffects()))
                    .orElse(null);
            case ARMOR -> itemArmorRepository.findById(item.getId())
                    .map(a -> new ItemResponse.ArmorDetails(
                            a.getLevel(), a.getSubtype(), a.getArmorClass(),
                            a.getAvgDefPower(), a.getDefenseSuccessRate(),
                            a.getSpecialEffects()))
                    .orElse(null);
            case ACCESSORY -> itemAccessoryRepository.findByIdWithRace(item.getId())
                    .map(a -> new ItemResponse.AccessoryDetails(
                            a.getRace().getId(), a.getRace().getName(),
                            a.getSubtype(), a.getSpecialEffects()))
                    .orElse(null);
            case MISC -> null;
        };
        var talics = itemTalicRepository.findByItemId(item.getId()).stream()
                .map(t -> new ItemResponse.TalicResponse(t.getTalicType(), t.getLevel(), t.getSlot()))
                .toList();
        var gameIcon = luaItem == null ? null : new ItemResponse.GameIcon(
                luaItem.getCategory(),
                luaItem.getGameIndex(),
                luaItem.getGameCode(),
                luaItem.getIconId(),
                luaItem.getSpriteSheet(),
                luaItem.getSpriteCols());
        return new ItemResponse(
                item.getId(),
                item.getType(),
                item.getName(),
                item.getRarity(),
                item.getImageUrl(),
                item.getGameCode(),
                gameIcon,
                item.getDescription(),
                details,
                talics,
                item.getCreatedAt());
    }

    private static void validateImageOrGameCode(String imageUrl, String gameCode) {
        boolean hasImage = imageUrl != null && !imageUrl.isBlank();
        boolean hasGameCode = gameCode != null && !gameCode.isBlank();
        if (!hasImage && !hasGameCode) {
            throw new AppException("Informe uma imagem ou selecione um item do jogo (código Lua).", HttpStatus.BAD_REQUEST);
        }
    }

    private static String normalizeGameCode(String gameCode) {
        if (gameCode == null || gameCode.isBlank()) {
            return null;
        }
        return gameCode.trim().toLowerCase();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
