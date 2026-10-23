CREATE TABLE equipment_review_request (
    id UUID PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES member(id),
    requested_by BIGINT NOT NULL REFERENCES member(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
    confirmed_at TIMESTAMPTZ,
    CHECK (due_at > requested_at)
);
CREATE UNIQUE INDEX equipment_review_pending ON equipment_review_request(member_id) WHERE confirmed_at IS NULL;
CREATE INDEX equipment_review_member ON equipment_review_request(member_id, requested_at DESC);
