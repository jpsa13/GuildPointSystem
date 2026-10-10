-- weapon.png is a 32×32 icon grid (not 64 like armor sheets)
UPDATE game_lua_item SET sprite_cols = 32 WHERE category = 'WEAPON';
UPDATE game_weapon SET sprite_cols = 32;
