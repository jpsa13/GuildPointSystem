-- Disena donations: a member declares an amount (in kk = millions) and Líder/Administrador accepts
-- or rejects it. Accepting credits amount_kk * points_per_kk points (rate snapshotted on the row).
CREATE TABLE donation_settings (
    id            SMALLINT    PRIMARY KEY DEFAULT 1,
    points_per_kk BIGINT      NOT NULL DEFAULT 1,
    updated_by_id BIGINT      REFERENCES member(id),
    updated_at    TIMESTAMPTZ,
    CONSTRAINT chk_donation_settings_single CHECK (id = 1),
    CONSTRAINT chk_donation_points_per_kk CHECK (points_per_kk >= 1)
);

INSERT INTO donation_settings (id, points_per_kk) VALUES (1, 1);

CREATE TABLE donation (
    id             BIGSERIAL   PRIMARY KEY,
    member_id      BIGINT      NOT NULL REFERENCES member(id),
    amount_kk      BIGINT      NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by_id BIGINT      REFERENCES member(id),
    reviewed_at    TIMESTAMPTZ,
    points_per_kk  BIGINT,
    points_awarded BIGINT,
    CONSTRAINT chk_donation_amount CHECK (amount_kk >= 1),
    CONSTRAINT chk_donation_status CHECK (status IN ('PENDENTE', 'ACEITA', 'RECUSADA'))
);

CREATE INDEX idx_donation_status_created ON donation (status, created_at);
CREATE INDEX idx_donation_member_created ON donation (member_id, created_at DESC);

ALTER TABLE points_adjustment DROP CONSTRAINT IF EXISTS chk_points_modality;
ALTER TABLE points_adjustment ADD CONSTRAINT chk_points_modality
    CHECK (modality IN ('AJUSTE', 'LEILAO', 'EVENTO', 'REVERSAO', 'DOACAO'));
