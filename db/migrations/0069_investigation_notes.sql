-- Migration 0069: investigation_notes — pet-independent timeline entries for
-- outbreak_investigation cases (and any future general-subject case kind that
-- needs a chronological dataset log not tied to a pet).
--
-- pet_events.pet_id is NOT NULL at the DB level, so general-subject cases
-- (primarySubjectKind = 'general' | 'location' | 'unowned_animal') cannot use
-- pet_events for case-scoped notes. This table fills that gap.
--
-- Design decisions:
--  - Plain text `entry_type` (not a PG enum) — same pattern as pet_events.event_type
--    and audit_log.action. Adding a new entry type is a one-line Zod change.
--  - `payload` JSONB mirrors pet_events.payload for read-consistency.
--  - `case_id` FK with ON DELETE CASCADE: notes belong to the case.
--  - No `pet_id` column — this table is intentionally pet-free.
--  - Append-only by convention (no UPDATE trigger yet; add when needed).

CREATE TABLE IF NOT EXISTS investigation_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entry_type   text NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  author_role  text NOT NULL DEFAULT 'govt',
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigation_notes_case_id_occurred_idx
  ON investigation_notes (case_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS investigation_notes_entry_type_idx
  ON investigation_notes (entry_type);

COMMENT ON TABLE investigation_notes IS
  'Pet-independent timeline entries for general-subject cases (outbreak_investigation etc.).
   Mirrors pet_events semantics but without a pet_id FK requirement.';
