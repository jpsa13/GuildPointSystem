ALTER TABLE member ADD COLUMN party_priority_points INTEGER NOT NULL DEFAULT 0 CHECK (party_priority_points >= 0);
CREATE SEQUENCE party_lfg_order_seq;
ALTER TABLE party_lfg ADD COLUMN queue_order BIGINT;
ALTER TABLE party_lfg ADD COLUMN last_unanswered_at TIMESTAMPTZ;
WITH ordered AS (
    SELECT member_id, row_number() OVER (ORDER BY created_at,member_id) AS position FROM party_lfg
)
UPDATE party_lfg l SET queue_order=o.position FROM ordered o WHERE l.member_id=o.member_id;
SELECT setval('party_lfg_order_seq',COALESCE((SELECT max(queue_order) FROM party_lfg),0)+1,false);
ALTER TABLE party_lfg ALTER COLUMN queue_order SET NOT NULL;
ALTER TABLE party_lfg ALTER COLUMN queue_order SET DEFAULT nextval('party_lfg_order_seq');
