-- Chat reactions (Discord style): each member can react to a message once per emoji.
CREATE TABLE auction_message_reaction (
    id         BIGSERIAL PRIMARY KEY,
    message_id BIGINT      NOT NULL REFERENCES auction_message(id) ON DELETE CASCADE,
    member_id  BIGINT      NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    emoji      VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auction_message_reaction UNIQUE (message_id, member_id, emoji)
);
