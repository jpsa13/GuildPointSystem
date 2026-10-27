ALTER TABLE equipment_assignment ADD COLUMN delivery_only BOOLEAN NOT NULL DEFAULT false;

-- Somente operações explicitamente registradas como entrega avulsa são reclassificadas.
WITH RECURSIVE deliveries(id) AS (
    SELECT a.id FROM equipment_assignment a
    WHERE EXISTS (
        SELECT 1 FROM audit_log l WHERE l.type='EQUIPMENT_CHANGED'
        AND l.payload->>'action'='CREATE' AND l.payload ? 'quantity'
        AND l.payload->'assignmentIds' @> jsonb_build_array(a.id)
    )
    UNION
    SELECT a.id FROM equipment_assignment a JOIN deliveries d ON a.corrects_id=d.id
)
UPDATE equipment_assignment SET delivery_only=true WHERE id IN (SELECT id FROM deliveries);
