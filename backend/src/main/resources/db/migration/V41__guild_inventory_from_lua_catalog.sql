-- Guild inventory: one row per game_lua_item (icons + game_code for listagem / leilões)

ALTER TABLE item ADD COLUMN IF NOT EXISTS lua_category VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_item_lua_category ON item (lua_category) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_item_game_code_active ON item (LOWER(game_code)) WHERE deleted = FALSE AND game_code IS NOT NULL;

-- Remove manual-only rows without Lua reference (e.g. old upload-only armlet)
UPDATE item SET deleted = TRUE WHERE deleted = FALSE AND (game_code IS NULL OR BTRIM(game_code) = '');

INSERT INTO item (type, name, rarity, image_url, game_code, lua_category, created_by_id, deleted)
SELECT
    CASE g.category
        WHEN 'WEAPON' THEN 'WEAPON'
        WHEN 'HELMET' THEN 'ARMOR'
        WHEN 'UPPER' THEN 'ARMOR'
        WHEN 'LOWER' THEN 'ARMOR'
        WHEN 'GLOVES' THEN 'ARMOR'
        WHEN 'SHOES' THEN 'ARMOR'
        WHEN 'SHIELD' THEN 'ARMOR'
        WHEN 'RING' THEN 'ACCESSORY'
        WHEN 'AMULET' THEN 'ACCESSORY'
        ELSE 'MISC'
    END,
    g.name,
    CASE g.item_grade
        WHEN 0 THEN 'Normal'
        WHEN 1 THEN 'Intense'
        WHEN 2 THEN 'Purple'
        WHEN 3 THEN 'Orange'
        WHEN 4 THEN 'Leon'
        WHEN 5 THEN 'Relic'
        WHEN 6 THEN 'PVP'
        WHEN 7 THEN 'Event'
        ELSE 'Normal'
    END,
    NULL,
    LOWER(g.game_code),
    g.category,
    (SELECT id FROM member WHERE role = 'LIDER' ORDER BY id LIMIT 1),
    FALSE
FROM game_lua_item g
WHERE NOT EXISTS (
    SELECT 1 FROM item i
    WHERE i.deleted = FALSE AND LOWER(i.game_code) = LOWER(g.game_code)
);

INSERT INTO item_weapon (item_id, level, subtype, attack_min, attack_max, force_attack_min, force_attack_max, special_effects)
SELECT
    i.id,
    GREATEST(g.level_required, 0),
    'Sword',
    0,
    0,
    0,
    0,
    '[]'::jsonb
FROM item i
JOIN game_lua_item g ON LOWER(i.game_code) = LOWER(g.game_code)
WHERE i.deleted = FALSE AND g.category = 'WEAPON'
  AND NOT EXISTS (SELECT 1 FROM item_weapon w WHERE w.item_id = i.id);

INSERT INTO item_armor (item_id, level, subtype, armor_class, avg_def_power, defense_success_rate, special_effects)
SELECT
    i.id,
    GREATEST(g.level_required, 0),
    g.category,
    'Warrior',
    0,
    0,
    '[]'::jsonb
FROM item i
JOIN game_lua_item g ON LOWER(i.game_code) = LOWER(g.game_code)
WHERE i.deleted = FALSE
  AND g.category IN ('HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES', 'SHIELD')
  AND NOT EXISTS (SELECT 1 FROM item_armor a WHERE a.item_id = i.id);

INSERT INTO item_accessory (item_id, race_id, subtype, special_effects)
SELECT
    i.id,
    (SELECT id FROM game_race WHERE name = 'Bellato' LIMIT 1),
    g.category,
    '[]'::jsonb
FROM item i
JOIN game_lua_item g ON LOWER(i.game_code) = LOWER(g.game_code)
WHERE i.deleted = FALSE AND g.category IN ('RING', 'AMULET')
  AND NOT EXISTS (SELECT 1 FROM item_accessory a WHERE a.item_id = i.id);

INSERT INTO item_misc (item_id)
SELECT i.id
FROM item i
JOIN game_lua_item g ON LOWER(i.game_code) = LOWER(g.game_code)
WHERE i.deleted = FALSE AND g.category IN ('BOOTY', 'BOX', 'POTION', 'RESOURCE')
  AND NOT EXISTS (SELECT 1 FROM item_misc m WHERE m.item_id = i.id);
