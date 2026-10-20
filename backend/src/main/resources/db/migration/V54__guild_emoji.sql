-- Custom guild emojis (Discord style): an image with a :name:, usable in reactions and chat text.
CREATE TABLE guild_emoji (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(32)  NOT NULL,
    image_url     VARCHAR(500) NOT NULL,
    animated      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by_id BIGINT       REFERENCES member(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_guild_emoji_name ON guild_emoji (LOWER(name));
