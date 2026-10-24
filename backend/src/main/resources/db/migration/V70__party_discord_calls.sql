CREATE TABLE party_discord_call (
    party_id BIGINT PRIMARY KEY,
    run_id UUID NOT NULL,
    actor_id BIGINT NOT NULL,
    label VARCHAR(300) NOT NULL,
    channel_id VARCHAR(24) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    next_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(20) NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0 CHECK (sent BETWEEN 0 AND 3),
    recipients JSONB NOT NULL DEFAULT '[]',
    confirmed JSONB NOT NULL DEFAULT '[]',
    messages JSONB NOT NULL DEFAULT '[]',
    skipped JSONB NOT NULL DEFAULT '[]',
    error VARCHAR(300)
);
CREATE INDEX idx_party_discord_call_due ON party_discord_call (next_at) WHERE state IN ('WAITING','SENDING');
