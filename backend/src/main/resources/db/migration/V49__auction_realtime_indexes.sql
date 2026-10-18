-- The auction scheduler polls for due active auctions every 200ms; keep that lookup on a tiny index.
CREATE INDEX IF NOT EXISTS idx_auction_active_ends_at
    ON auction (ends_at)
    WHERE status IN ('OPEN', 'DOLE', 'TIE_BREAK');

-- Reserved-points lookups: "does this member hold the current bid of this auction?"
CREATE INDEX IF NOT EXISTS idx_auction_bid_member_auction_amount
    ON auction_bid (member_id, auction_id, amount);
