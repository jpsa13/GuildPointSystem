-- Guild news shown on the dashboard. content_html is sanitized server-side before it is stored.
CREATE TABLE news (
    id            BIGSERIAL PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    content_html  TEXT         NOT NULL,
    created_by_id BIGINT       NOT NULL REFERENCES member(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by_id BIGINT       REFERENCES member(id),
    updated_at    TIMESTAMPTZ
);

CREATE INDEX idx_news_created_at ON news (created_at DESC);
