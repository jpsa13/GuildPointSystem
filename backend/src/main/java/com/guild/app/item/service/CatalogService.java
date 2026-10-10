package com.guild.app.item.service;

import com.guild.app.common.enums.EffectDisplayType;
import com.guild.app.common.exception.AppException;
import com.guild.app.item.dto.*;
import com.guild.app.item.entity.EffectDefinition;
import com.guild.app.item.entity.GameAccessory;
import com.guild.app.item.entity.GameArmor;
import com.guild.app.item.entity.GameWeapon;
import com.guild.app.item.entity.ItemSet;
import com.guild.app.item.repository.EffectDefinitionRepository;
import com.guild.app.item.repository.GameAccessoryRepository;
import com.guild.app.item.repository.GameArmorRepository;
import com.guild.app.item.repository.GameLuaItemRepository;
import com.guild.app.item.repository.GameWeaponRepository;
import com.guild.app.item.repository.ItemSetRepository;
import com.guild.app.item.entity.GameLuaItem;
import com.guild.app.item.util.CivilMaskUtil;
import com.guild.app.item.util.DefFacingUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CatalogService {

    private static final Set<String> LUA_ITEM_CATEGORIES = Set.of(
            "WEAPON", "HELMET", "UPPER", "LOWER", "GLOVES", "SHOES",
            "AMULET", "RING", "SHIELD", "BOOTY", "BOX", "POTION", "RESOURCE");

    private final GameAccessoryRepository gameAccessoryRepository;
    private final GameArmorRepository gameArmorRepository;
    private final GameWeaponRepository gameWeaponRepository;
    private final GameLuaItemRepository gameLuaItemRepository;
    private final EffectDefinitionRepository effectDefinitionRepository;
    private final ItemSetRepository itemSetRepository;

    public Page<GameAccessoryResponse> listAccessories(
            String subtype, Integer grade, String civilMask, String search, Pageable pageable) {
        var effectMap = effectMap();
        var normalizedSearch = blankToNull(search);
        var hasSearch = normalizedSearch != null;
        var searchPattern = hasSearch ? "%" + normalizedSearch.toLowerCase() + "%" : "%";
        return gameAccessoryRepository
                .findFilteredPage(
                        subtype,
                        grade,
                        hasCivilFilter(civilMask),
                        CivilMaskUtil.storedMasksForFilter(civilMask),
                        hasSearch,
                        searchPattern,
                        pageable)
                .map(a -> toAccessoryResponse(a, effectMap));
    }

    public List<GameAccessoryIconResponse> listAccessoryIconRefs() {
        return gameAccessoryRepository.findAllIconRefs();
    }

    public GameAccessoryResponse getAccessory(String gameCode) {
        var accessory = gameAccessoryRepository.findByGameCode(gameCode)
                .orElseThrow(() -> new AppException("Acessório não encontrado no catálogo.", HttpStatus.NOT_FOUND));
        return toAccessoryResponse(accessory, effectMap());
    }

    public Page<GameArmorResponse> listArmor(
            String slot, Integer grade, String civilMask, Integer minLevel, String search, Pageable pageable) {
        var effectMap = effectMap();
        var normalizedSearch = blankToNull(search);
        var hasSearch = normalizedSearch != null;
        var searchPattern = hasSearch ? "%" + normalizedSearch.toLowerCase() + "%" : "%";
        int levelFloor = minLevel != null ? minLevel : 35;
        return gameArmorRepository
                .findFilteredPage(
                        slot,
                        grade,
                        hasCivilFilter(civilMask),
                        CivilMaskUtil.storedMasksForFilter(civilMask),
                        levelFloor,
                        hasSearch,
                        searchPattern,
                        pageable)
                .map(a -> toArmorResponse(a, effectMap));
    }

    public List<GameArmorIconResponse> listArmorIconRefs() {
        return gameArmorRepository.findAllIconRefs();
    }

    public GameArmorResponse getArmor(String gameCode) {
        var armor = gameArmorRepository.findByGameCode(gameCode)
                .orElseThrow(() -> new AppException("Armadura não encontrada no catálogo.", HttpStatus.NOT_FOUND));
        return toArmorResponse(armor, effectMap());
    }

    public Page<GameWeaponResponse> listWeapons(
            String weaponType, Integer grade, String civilMask, Integer minLevel, String search, Pageable pageable) {
        var effectMap = effectMap();
        var normalizedSearch = blankToNull(search);
        var hasSearch = normalizedSearch != null;
        var searchPattern = hasSearch ? "%" + normalizedSearch.toLowerCase() + "%" : "%";
        int levelFloor = minLevel != null ? minLevel : 35;
        return gameWeaponRepository
                .findFilteredPage(
                        weaponType,
                        grade,
                        hasCivilFilter(civilMask),
                        CivilMaskUtil.storedMasksForFilter(civilMask),
                        levelFloor,
                        hasSearch,
                        searchPattern,
                        pageable)
                .map(w -> toWeaponResponse(w, effectMap));
    }

    public List<GameWeaponIconResponse> listWeaponIconRefs() {
        return gameWeaponRepository.findAllIconRefs();
    }

    public GameWeaponResponse getWeapon(String gameCode) {
        var weapon = gameWeaponRepository.findByGameCode(gameCode)
                .orElseThrow(() -> new AppException("Arma não encontrada no catálogo.", HttpStatus.NOT_FOUND));
        return toWeaponResponse(weapon, effectMap());
    }

    public GameLuaItemResponse getLuaItem(String gameCode) {
        var normalized = gameCode == null ? null : gameCode.trim().toLowerCase();
        if (normalized == null || normalized.isBlank()) {
            throw new AppException("Código do item inválido.", HttpStatus.BAD_REQUEST);
        }
        return gameLuaItemRepository.findByGameCode(normalized)
                .map(this::toLuaItemResponse)
                .orElseThrow(() -> new AppException("Item não encontrado no catálogo Lua.", HttpStatus.NOT_FOUND));
    }

    public Page<GameLuaItemResponse> listLuaItems(String category, String search, Pageable pageable) {
        var normalizedCategory = category == null ? null : category.trim().toUpperCase();
        if (normalizedCategory == null || !LUA_ITEM_CATEGORIES.contains(normalizedCategory)) {
            throw new AppException("Categoria de item inválida.", HttpStatus.BAD_REQUEST);
        }
        var normalizedSearch = blankToNull(search);
        var hasSearch = normalizedSearch != null;
        var searchPattern = hasSearch ? "%" + normalizedSearch.toLowerCase() + "%" : "%";
        return gameLuaItemRepository
                .findFilteredPage(normalizedCategory, hasSearch, searchPattern, pageable)
                .map(this::toLuaItemResponse);
    }

    public List<EffectDefinitionResponse> listEffects() {
        return effectDefinitionRepository.findAll().stream()
                .map(e -> new EffectDefinitionResponse(e.getCode(), e.getName(), e.getDisplayType()))
                .toList();
    }

    public List<ItemSetResponse> listSetsForGameCode(String gameCode) {
        var effectMap = effectMap();
        return itemSetRepository.findByGameCode(gameCode).stream()
                .map(s -> toSetResponse(s, effectMap))
                .toList();
    }

    public List<ItemSetResponse> listAllSets() {
        var effectMap = effectMap();
        return itemSetRepository.findAll().stream()
                .map(s -> toSetResponse(s, effectMap))
                .toList();
    }

    private Map<Integer, EffectDefinition> effectMap() {
        return effectDefinitionRepository.findAll().stream()
                .collect(Collectors.toMap(EffectDefinition::getCode, Function.identity()));
    }

    private GameAccessoryResponse toAccessoryResponse(GameAccessory a, Map<Integer, EffectDefinition> effectMap) {
        var effects = new ArrayList<GameAccessoryEffectResponse>();
        addAccessoryEffect(effects, effectMap, a.getEffCode1(), a.getEffUnit1());
        addAccessoryEffect(effects, effectMap, a.getEffCode2(), a.getEffUnit2());
        addAccessoryEffect(effects, effectMap, a.getEffCode3(), a.getEffUnit3());
        addAccessoryEffect(effects, effectMap, a.getEffCode4(), a.getEffUnit4());

        return new GameAccessoryResponse(
                a.getId(), a.getGameCode(), a.getName(), a.getSubtype(),
                a.getIconId(), a.getSpriteSheet(), a.getGrade(), a.getCivilMask(),
                a.getLevelRequired(), a.getFire(), a.getWater(), a.getSoil(), a.getWind(),
                effects);
    }

    private GameArmorResponse toArmorResponse(GameArmor a, Map<Integer, EffectDefinition> effectMap) {
        var effects = new ArrayList<GameAccessoryEffectResponse>();
        addAccessoryEffect(effects, effectMap, a.getEffCode1(), a.getEffUnit1());
        addAccessoryEffect(effects, effectMap, a.getEffCode2(), a.getEffUnit2());
        addAccessoryEffect(effects, effectMap, a.getEffCode3(), a.getEffUnit3());
        addAccessoryEffect(effects, effectMap, a.getEffCode4(), a.getEffUnit4());

        return new GameArmorResponse(
                a.getId(), a.getGameCode(), a.getName(), a.getSlot(),
                a.getIconId(), a.getSpriteSheet(), a.getSpriteCols(), a.getGrade(), a.getCivilMask(),
                a.getLevelRequired(), a.getDefFc(), a.getDefFacing(),
                DefFacingUtil.toClientDsr(a.getDefFacing()),
                effects);
    }

    private GameLuaItemResponse toLuaItemResponse(GameLuaItem item) {
        return new GameLuaItemResponse(
                item.getCategory(),
                item.getGameIndex(),
                item.getGameCode(),
                item.getName(),
                item.getIconId(),
                item.getSpriteSheet(),
                item.getSpriteCols(),
                item.getItemGrade(),
                item.getLevelRequired());
    }

    private GameWeaponResponse toWeaponResponse(GameWeapon w, Map<Integer, EffectDefinition> effectMap) {
        var effects = new ArrayList<GameAccessoryEffectResponse>();
        addAccessoryEffect(effects, effectMap, w.getEffCode1(), w.getEffUnit1());
        addAccessoryEffect(effects, effectMap, w.getEffCode2(), w.getEffUnit2());
        addAccessoryEffect(effects, effectMap, w.getEffCode3(), w.getEffUnit3());
        addAccessoryEffect(effects, effectMap, w.getEffCode4(), w.getEffUnit4());

        return new GameWeaponResponse(
                w.getId(), w.getGameCode(), w.getName(), w.getWeaponType(),
                w.getIconId(), w.getSpriteSheet(), w.getSpriteCols(), w.getGrade(), w.getCivilMask(),
                w.getLevelRequired(), w.getGaMinAf(), w.getGaMaxAf(), w.getMaMinAf(), w.getMaMaxAf(),
                effects);
    }

    private void addAccessoryEffect(
            List<GameAccessoryEffectResponse> effects,
            Map<Integer, EffectDefinition> effectMap,
            Integer code,
            BigDecimal rawValue) {
        if (code == null || code == 0) return;
        var def = effectMap.get(code);
        var displayType = def != null ? def.getDisplayType() : EffectDisplayType.FLAT;
        var name = def != null ? def.getName() : "Effect " + code;
        effects.add(new GameAccessoryEffectResponse(
                code, name, displayType, rawValue, formatEffectValue(displayType, rawValue, code)));
    }

    private ItemSetResponse toSetResponse(ItemSet s, Map<Integer, EffectDefinition> effectMap) {
        var effects = new ArrayList<ItemSetEffectResponse>();
        addSetEffect(effects, effectMap, s.getEff1Code(), s.getEff1Unit());
        addSetEffect(effects, effectMap, s.getEff2Code(), s.getEff2Unit());
        addSetEffect(effects, effectMap, s.getEff3Code(), s.getEff3Unit());
        addSetEffect(effects, effectMap, s.getEff4Code(), s.getEff4Unit());
        addSetEffect(effects, effectMap, s.getEff5Code(), s.getEff5Unit());
        addSetEffect(effects, effectMap, s.getEff6Code(), s.getEff6Unit());
        addSetEffect(effects, effectMap, s.getEff7Code(), s.getEff7Unit());
        addSetEffect(effects, effectMap, s.getEff8Code(), s.getEff8Unit());

        return new ItemSetResponse(
                s.getId(), s.getSetCode(), s.getCivilMask(),
                s.getHead(), s.getUpper(), s.getLower(), s.getShoes(), s.getGauntlet(),
                s.getWeapon(), s.getShield(), s.getAmul1(), s.getAmul2(),
                s.getRing1(), s.getRing2(), s.getCloack(), effects);
    }

    private void addSetEffect(
            List<ItemSetEffectResponse> effects,
            Map<Integer, EffectDefinition> effectMap,
            Integer code,
            BigDecimal rawValue) {
        if (code == null || code == 0) return;
        var def = effectMap.get(code);
        var displayType = def != null ? def.getDisplayType() : EffectDisplayType.FLAT;
        var name = def != null ? def.getName() : "Effect " + code;
        effects.add(new ItemSetEffectResponse(
                code, name, displayType, rawValue, formatEffectValue(displayType, rawValue, code)));
    }

    static String formatEffectValue(EffectDisplayType displayType, BigDecimal rawValue, Integer code) {
        if (displayType == EffectDisplayType.BOOLEAN) {
            return "true";
        }
        if (rawValue == null) return "";
        switch (displayType) {
            case PERCENT_100:
                return formatPercentDisplay(rawValue, code);
            case FLAT:
                return rawValue.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
            case SEC_MILLIS:
                return formatSecDisplay(rawValue, code);
            default:
                return rawValue.toPlainString();
        }
    }

    /** SetItemEff stores Shield Block (28) as whole percent points (e.g. 10 = 10%). */
    static String formatPercentDisplay(BigDecimal rawValue, Integer code) {
        BigDecimal pct;
        if (code != null && (code == 19 || code == 28 || code == 32) && rawValue.abs().compareTo(BigDecimal.ONE) > 0) {
            pct = rawValue.setScale(1, RoundingMode.HALF_UP).stripTrailingZeros();
        } else {
            pct = rawValue.multiply(BigDecimal.valueOf(100))
                    .setScale(1, RoundingMode.HALF_UP)
                    .stripTrailingZeros();
        }
        return pct.toPlainString() + "%";
    }

    /** RF stores time bonuses as millis-like units; launcher uses ÷2000 when |raw| ≥ 100. */
    static String formatSecDisplay(BigDecimal rawValue, Integer code) {
        var abs = rawValue.abs();
        int divisor = code != null && code == 25 && abs.compareTo(BigDecimal.valueOf(100)) >= 0 ? 2000 : 1000;
        var sec = abs.divide(BigDecimal.valueOf(divisor), 3, RoundingMode.HALF_UP).stripTrailingZeros();
        return sec.toPlainString();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static boolean hasCivilFilter(String civilMask) {
        return civilMask != null && !civilMask.isBlank();
    }
}
