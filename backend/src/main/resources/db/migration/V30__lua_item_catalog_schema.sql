-- Lua server item reference catalog (filtered equip <= 55, Exist=true)

CREATE TABLE game_lua_item (
    id              BIGSERIAL PRIMARY KEY,
    category        VARCHAR(20)  NOT NULL,
    game_index      INT          NOT NULL DEFAULT 0,
    game_code       VARCHAR(50)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    icon_id         INT          NOT NULL DEFAULT 0,
    sprite_sheet    VARCHAR(500) NOT NULL,
    sprite_cols     INT          NOT NULL DEFAULT 64,
    item_grade      INT          NOT NULL DEFAULT 0,
    level_required  INT          NOT NULL DEFAULT 0,
    CONSTRAINT uq_game_lua_item_code UNIQUE (game_code),
    CONSTRAINT chk_game_lua_item_category CHECK (category IN (
        'WEAPON', 'HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES',
        'AMULET', 'RING', 'SHIELD', 'BOOTY', 'BOX', 'POTION', 'RESOURCE'
    ))
);

CREATE INDEX idx_game_lua_item_category_name ON game_lua_item (category, name);
CREATE INDEX idx_game_lua_item_category_level ON game_lua_item (category, level_required);
