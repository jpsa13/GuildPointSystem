ALTER TABLE party_member ADD COLUMN afk_until TIMESTAMPTZ;
CREATE INDEX idx_party_member_afk_due ON party_member(afk_until) WHERE afk_until IS NOT NULL;
ALTER TABLE party_lfg ADD COLUMN afk_since TIMESTAMPTZ;
