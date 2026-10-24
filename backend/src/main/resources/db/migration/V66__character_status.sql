-- Status de personagem (nome/level/EXP) enviado pelo cliente CerberusBags, opt-in.
-- Dado do cliente, NAO autoritativo e NAO autenticado: o envio e associado ao
-- membro pelo nome do personagem (unico no jogo = nickname do membro no site).
-- Guardamos somente o ultimo estado de cada personagem.

CREATE TABLE character_status (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES member(id),
    gid BIGINT NOT NULL,
    character_name VARCHAR(32) NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 200),
    exp_percent REAL NOT NULL CHECK (exp_percent >= 0 AND exp_percent <= 100),
    hp INTEGER NOT NULL,
    hp_max INTEGER NOT NULL,
    fp INTEGER NOT NULL,
    fp_max INTEGER NOT NULL,
    sp INTEGER NOT NULL,
    sp_max INTEGER NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, gid)
);
CREATE INDEX idx_character_status_ranking ON character_status(level DESC, exp_percent DESC);
