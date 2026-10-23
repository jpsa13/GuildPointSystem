ALTER TABLE game_lua_item ADD COLUMN edf_effects_note VARCHAR(300);
ALTER TABLE game_lua_item DROP CONSTRAINT chk_game_lua_item_category;
ALTER TABLE game_lua_item ADD CONSTRAINT chk_game_lua_item_category CHECK (category IN (
    'WEAPON','HELMET','UPPER','LOWER','GLOVES','SHOES','AMULET','RING','SHIELD','BOOTY','BOX','POTION','RESOURCE','CLOAK'
));

ALTER TABLE equipment_assignment DROP CONSTRAINT equipment_assignment_slot_check;
ALTER TABLE equipment_assignment ADD CONSTRAINT equipment_assignment_slot_check
    CHECK (slot IN ('Weapon','Weapon2','Helmet','Upper','Lower','Gloves','Shoes','Amulet1','Amulet2','Ring1','Ring2','Cloak'));

ALTER TABLE member_equipment_slot DROP CONSTRAINT member_equipment_slot_slot_check;
ALTER TABLE member_equipment_slot ADD CONSTRAINT member_equipment_slot_slot_check
    CHECK (slot IN ('Weapon','Weapon2','Helmet','Upper','Lower','Gloves','Shoes','Amulet1','Amulet2','Ring1','Ring2','Cloak'));
