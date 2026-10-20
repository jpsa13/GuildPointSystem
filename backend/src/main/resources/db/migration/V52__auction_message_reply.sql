-- Chat replies (Discord style): a message may quote an earlier message of the same auction.
ALTER TABLE auction_message
    ADD COLUMN reply_to_id BIGINT REFERENCES auction_message(id) ON DELETE SET NULL;
