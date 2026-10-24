CREATE TABLE quest_monitor_session (
    id UUID PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES member(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    monitor_version VARCHAR(40) NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source = 'SIMULATION'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_received_at TIMESTAMPTZ
);
CREATE INDEX idx_quest_session_member ON quest_monitor_session(member_id, created_at DESC);

CREATE TABLE quest_observation (
    session_id UUID NOT NULL REFERENCES quest_monitor_session(id),
    event_id UUID NOT NULL,
    run_id UUID NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    code VARCHAR(7) NOT NULL,
    client_hash VARCHAR(64) NOT NULL,
    edf_hash VARCHAR(64) NOT NULL,
    definition_hash VARCHAR(64) NOT NULL,
    state VARCHAR(30) NOT NULL CHECK (state IN ('PRESENT','COMPLETION_SIGNAL','REMOVED_UNKNOWN')),
    payload JSONB NOT NULL,
    PRIMARY KEY(session_id,event_id),
    UNIQUE(session_id,run_id,sequence)
);
CREATE UNIQUE INDEX idx_quest_completion_once ON quest_observation(session_id,run_id) WHERE state='COMPLETION_SIGNAL';
CREATE INDEX idx_quest_history ON quest_observation(session_id, occurred_at, run_id);
