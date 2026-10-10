-- Monotonic version so clients can discard out-of-order WS updates.
ALTER TABLE auction ADD COLUMN state_version BIGINT NOT NULL DEFAULT 0;

-- Tie-break timeline: 1 = countdown, 2 = spinning, 3 = landing on the drawn winner.
ALTER TABLE auction ADD COLUMN tie_break_phase SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_auction_bid_auction_amount ON auction_bid (auction_id, amount);
