ALTER TABLE quest_monitor_session DROP CONSTRAINT quest_monitor_session_source_check;
ALTER TABLE quest_monitor_session ADD CONSTRAINT quest_monitor_session_source_check CHECK (source IN ('SIMULATION','LOCAL_MONITOR'));
ALTER TABLE quest_monitor_session ADD COLUMN expected_name VARCHAR(32);
ALTER TABLE quest_monitor_session ADD COLUMN identity_epoch VARCHAR(64);
ALTER TABLE quest_monitor_session ADD COLUMN character_serial BIGINT;
ALTER TABLE quest_monitor_session ADD COLUMN sample_sequence BIGINT;
ALTER TABLE quest_monitor_session ADD COLUMN player_sample JSONB;
CREATE TABLE quest_catalog_visibility (
    definition_hash VARCHAR(64) PRIMARY KEY,
    hidden BOOLEAN NOT NULL,
    updated_by BIGINT NOT NULL REFERENCES member(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
