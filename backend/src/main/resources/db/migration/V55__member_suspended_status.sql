-- Suspended accounts keep everything (credentials, points, history) but can't log in until lifted.
ALTER TABLE member DROP CONSTRAINT IF EXISTS chk_member_status;
ALTER TABLE member ADD CONSTRAINT chk_member_status
    CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXCLUIDO', 'SUSPENSO'));

ALTER TABLE member ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE member ADD COLUMN suspension_reason VARCHAR(500);
