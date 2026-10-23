-- EDF metadata extends the shared catalogue without replacing existing display/stat data.
ALTER TABLE game_lua_item
    ADD COLUMN edf_source_hash VARCHAR(64),
    ADD COLUMN edf_name VARCHAR(200),
    ADD COLUMN edf_level INTEGER,
    ADD COLUMN edf_grade INTEGER,
    ADD COLUMN edf_effects JSONB;

CREATE TABLE equipment_instance (
    id BIGSERIAL PRIMARY KEY,
    catalog_item_id BIGINT NOT NULL REFERENCES game_lua_item(id),
    game_code VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    item_level INTEGER NOT NULL,
    item_grade INTEGER NOT NULL,
    source_hash VARCHAR(64) NOT NULL,
    effect JSONB NOT NULL
);

CREATE TABLE equipment_assignment (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES member(id),
    instance_id BIGINT NOT NULL UNIQUE REFERENCES equipment_instance(id),
    slot VARCHAR(20) NOT NULL CHECK (slot IN ('Weapon','Weapon2','Helmet','Upper','Lower','Gloves','Shoes','Amulet1','Amulet2','Ring1','Ring2')),
    origin VARCHAR(30) NOT NULL CHECK (origin IN ('INITIAL','GUILD_DISTRIBUTION')),
    occurred_on DATE NOT NULL,
    created_by_id BIGINT NOT NULL REFERENCES member(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED','CORRECTED')),
    corrects_id BIGINT UNIQUE REFERENCES equipment_assignment(id),
    reason VARCHAR(500)
);
CREATE INDEX idx_equipment_history ON equipment_assignment(member_id, created_at DESC, id DESC);

CREATE TABLE member_equipment_slot (
    member_id BIGINT NOT NULL REFERENCES member(id),
    slot VARCHAR(20) NOT NULL CHECK (slot IN ('Weapon','Weapon2','Helmet','Upper','Lower','Gloves','Shoes','Amulet1','Amulet2','Ring1','Ring2')),
    assignment_id BIGINT UNIQUE REFERENCES equipment_assignment(id),
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY(member_id, slot)
);
CREATE TABLE equipment_operation (
    id UUID PRIMARY KEY,
    actor_id BIGINT NOT NULL REFERENCES member(id),
    request JSONB NOT NULL,
    assignment_id BIGINT NOT NULL REFERENCES equipment_assignment(id)
);
CREATE TABLE equipment_catalog_import (
    source_hash VARCHAR(64) PRIMARY KEY,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    imported_count INTEGER NOT NULL,
    excluded JSONB NOT NULL
);
