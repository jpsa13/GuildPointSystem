-- Auctions force-closed by a leader/admin: no winner, no debit, reserves released.
ALTER TABLE auction DROP CONSTRAINT IF EXISTS chk_auction_status;
ALTER TABLE auction ADD CONSTRAINT chk_auction_status
    CHECK (status IN ('OPEN', 'DOLE', 'TIE_BREAK', 'CLOSED', 'CANCELLED'));
