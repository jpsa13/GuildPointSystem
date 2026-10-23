CREATE TABLE equipment_slot_edit (
    id UUID PRIMARY KEY,
    actor_id BIGINT NOT NULL REFERENCES member(id),
    member_id BIGINT NOT NULL REFERENCES member(id),
    request JSONB NOT NULL,
    before_state JSONB NOT NULL,
    after_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
