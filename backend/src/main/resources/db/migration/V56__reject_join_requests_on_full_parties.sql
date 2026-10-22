-- Join requests left pending on full PTs by a race (request racing the last slot being filled).
-- New ones can't happen anymore; clear the ones already stuck so leaders stop seeing them.
UPDATE party_pending
SET status = 'REJECTED'
WHERE kind = 'JOIN_REQUEST'
  AND status = 'PENDING'
  AND party_id IN (
      SELECT party_id FROM party_member GROUP BY party_id HAVING COUNT(*) >= 8
  );
