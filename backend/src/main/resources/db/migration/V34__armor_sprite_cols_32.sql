-- Armor sprite sheets are 32×32 grids (same as weapon.png)
UPDATE game_armor SET sprite_cols = 32;

UPDATE game_lua_item
SET sprite_cols = 32
WHERE category IN ('HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES', 'SHIELD');
