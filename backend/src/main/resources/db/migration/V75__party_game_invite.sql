-- Convites de PT disparados pelo site e executados pela DLL do cliente do líder
-- ("@party Nick" no chat do jogo). Um registro por PT: o pedido mais recente.
CREATE TABLE party_game_invite (
    party_id     BIGINT PRIMARY KEY REFERENCES party(id) ON DELETE CASCADE,
    id           UUID NOT NULL UNIQUE,
    leader_id    BIGINT NOT NULL REFERENCES member(id),
    actor_id     BIGINT NOT NULL REFERENCES member(id),
    nicks        JSONB NOT NULL,
    skipped      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_party_game_invite_leader ON party_game_invite(leader_id);
