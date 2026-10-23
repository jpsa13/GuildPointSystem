ALTER TABLE game_lua_item ADD COLUMN edf_icon_id INTEGER CHECK (edf_icon_id >= 0);
ALTER TABLE equipment_instance ADD COLUMN icon_id INTEGER CHECK (icon_id >= 0);
ALTER TABLE equipment_assignment
    ADD COLUMN status_reason VARCHAR(500),
    ADD COLUMN status_actor_id BIGINT REFERENCES member(id),
    ADD COLUMN status_changed_at TIMESTAMPTZ;

-- As operações antigas já guardam motivo e autor; não inventar o horário ausente.
UPDATE equipment_assignment a SET status_reason=o.request->>'reason', status_actor_id=o.actor_id
FROM equipment_operation o
WHERE o.request->>'action' IN ('CANCEL','CORRECT')
  AND o.request->>'assignmentId'=a.id::text AND a.status IN ('CANCELLED','CORRECTED');
