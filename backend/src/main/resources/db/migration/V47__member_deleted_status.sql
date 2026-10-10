-- Deleted accounts stay as rows (points history, bids, claims and audit logs reference them),
-- with login credentials and personal data wiped.
ALTER TABLE member DROP CONSTRAINT IF EXISTS chk_member_status;
ALTER TABLE member ADD CONSTRAINT chk_member_status
    CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXCLUIDO'));

ALTER TABLE member ADD COLUMN deleted_at TIMESTAMPTZ;
