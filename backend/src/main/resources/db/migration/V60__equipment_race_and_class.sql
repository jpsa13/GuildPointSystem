ALTER TABLE game_lua_item
    ADD COLUMN edf_civil VARCHAR(5),
    ADD COLUMN edf_expert_id SMALLINT;

ALTER TABLE game_lua_item
    ADD CONSTRAINT chk_equipment_edf_civil CHECK (edf_civil IS NULL OR edf_civil ~ '^[01]{5}$'),
    ADD CONSTRAINT chk_equipment_edf_expert CHECK (edf_expert_id IS NULL OR edf_expert_id BETWEEN 0 AND 255);
