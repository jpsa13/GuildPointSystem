-- Lançamentos sincronizados pela DLL do cliente (nome do personagem, sem token).
-- Continuam no mesmo histórico auditável que as entregas e correções manuais.
ALTER TABLE equipment_assignment DROP CONSTRAINT equipment_assignment_origin_check;
ALTER TABLE equipment_assignment ADD CONSTRAINT equipment_assignment_origin_check
    CHECK (origin IN ('INITIAL','GUILD_DISTRIBUTION','GAME_CLIENT'));
