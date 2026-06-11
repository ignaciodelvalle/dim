-- 0089_eno_queue_processing_status.sql
-- ENO queue atomic-claim hardening (V1-4, pooler-safe overlap guard).
--
-- Problem (V1-4 BLOCKER): process-eno-queue/route.ts used
-- pg_try_advisory_lock / pg_advisory_unlock for cron-overlap mutual exclusion.
-- Session-level advisory locks are pooler-unsafe: on Supabase's pgBouncer
-- in transaction mode the LOCK and UNLOCK statements can execute on different
-- backend connections, silently voiding the mutual-exclusion guarantee. Two
-- concurrent cron runs could both proceed and process the same rows.
--
-- Fix: pickPendingBatch now claims rows with a single atomic statement:
--   UPDATE eno_processing_queue
--   SET status = 'processing', claimed_at = now()
--   WHERE id IN (
--     SELECT id FROM eno_processing_queue
--     WHERE status = 'pending'
--       OR (status = 'processing' AND claimed_at < now() - interval '10 minutes')
--     ORDER BY queued_at ASC
--     LIMIT n
--     FOR UPDATE SKIP LOCKED
--   )
--   RETURNING *;
--
-- Two concurrent runs atomically claim disjoint row sets — SKIP LOCKED skips
-- rows already locked by a racing UPDATE. No cross-connection lock state is
-- involved, so this is safe on any pooler mode.
--
-- Stale-claim recovery: rows stuck in 'processing' for more than 10 minutes
-- (caused by a crashed cron run) are automatically re-eligible on the next
-- drain cycle via the claimed_at < now() - interval '10 minutes' predicate.
-- This prevents rows from being stranded forever after a crash.
--
-- Status flow after this migration:
--   pending    → processing (claimed by pickPendingBatch)
--   processing → processed  (markEnoProcessed, happy path)
--   processing → pending    (markEnoFailed, retryCount < 2 — reset for retry)
--   processing → failed     (markEnoFailed, retryCount >= 2 — terminal)
--   processing → processing (stale re-claim after 10 min, crashed run recovery)

-- Add the claimed_at column (nullable — only set when a row is claimed).
ALTER TABLE eno_processing_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Drop and recreate the CHECK constraint to include 'processing'.
-- Named constraint must be dropped by name first.
ALTER TABLE eno_processing_queue
  DROP CONSTRAINT IF EXISTS eno_processing_queue_status_check;

ALTER TABLE eno_processing_queue
  ADD CONSTRAINT eno_processing_queue_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed'));

-- Update the status index to continue covering all queryable states.
-- The existing index already covers (status, queued_at); just rebuild
-- so the planner sees the updated statistics after the schema change.
REINDEX INDEX CONCURRENTLY eno_processing_queue_status_idx;

COMMENT ON COLUMN eno_processing_queue.claimed_at IS
  'Set to now() when a cron run claims the row (status=processing). '
  'Rows claimed more than 10 minutes ago are re-eligible for claiming to '
  'recover from crashed runs. NULL when status is pending, processed, or failed.';
