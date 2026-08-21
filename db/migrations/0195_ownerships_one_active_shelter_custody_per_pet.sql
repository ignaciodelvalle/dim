-- 0195 — ONE live shelter_custody row per pet (rehome-by-titular, design ADR-1).
--
-- THE RACE THIS CLOSES
-- ---------------------------------------------------------------------------
-- `ownerships_one_active_owner_per_pet` covers role='owner' only. Until now the
-- only shelter_custody index was 0077's `ownerships_one_active_shelter_custody_
-- per_pet_org` on (pet_id, owner_organization_id): it stops ONE org from holding
-- two live custody rows on a pet, and lets TWO orgs hold one each. That is
-- exactly what two concurrent accepts of the same rehome_request would produce
-- — two live shelter_custody rows, permanently, with nothing to detect it.
-- /adoptar/[petToken] already carries an `ORDER BY started_at DESC` defence
-- with a comment saying two open custody rows should not exist; somebody met
-- this before. The accept transaction takes `SELECT ... FOR UPDATE` on the case
-- (mitigation 1); this index is mitigation 2, the one that holds for a write
-- path nobody has written yet.
--
-- WHY THE 0077 INDEX IS DROPPED HERE, IN THE SAME FILE
-- ---------------------------------------------------------------------------
-- The new per-pet index strictly implies it: at most one live row per pet is at
-- most one per (pet, org). Keeping both is redundant write overhead and a
-- second source of truth for one rule; a future reader would have to work out
-- which of the two is load-bearing. 0077's own header names the race it closed
-- (concurrent orgAcceptOwnerReturnWriter calls) — that race is still caught,
-- by the stricter index, under a different constraint name. Every in-tree
-- reference to the old name was repointed in the same commit.
--
-- PRE-FLIGHT: REFUSE TO APPLY OVER DIRTY DATA. A pet already holding two live
-- custody rows would make CREATE UNIQUE INDEX fail with a raw 23505 after the
-- DROP had already run inside this transaction — rolled back, but opaque. The
-- block below names the problem first. It does NOT clean the rows: hand-fixing
-- production data inside a migration is the "aplicada no es cerrada" trap. If
-- this raises, inventory and clean by hand, then re-run.
--
-- Measured on local before writing (2026-08-21): 0 violating pets across
-- 32,432 ownership rows, 229 live shelter_custody rows. Staging and prod are
-- NOT this database; the pre-flight runs there too.
--
-- Drizzle mirror: db/schema.ts `oneActiveShelterCustodyPerPet` replaces
-- `oneActiveShelterCustodyPerPetOrg`, so a `drizzle-kit push` after bootstrap
-- keeps the new index and does not resurrect the old one.

BEGIN;

DO $$
DECLARE
  dirty_pets integer;
BEGIN
  SELECT count(*) INTO dirty_pets
  FROM (
    SELECT pet_id
    FROM public.ownerships
    WHERE role = 'shelter_custody' AND ended_at IS NULL
    GROUP BY pet_id
    HAVING count(*) > 1
  ) d;

  IF dirty_pets > 0 THEN
    RAISE EXCEPTION
      '0195 pre-flight failed: % pet(s) hold more than one live shelter_custody row. Inventory with: SELECT pet_id, count(*) FROM ownerships WHERE role=''shelter_custody'' AND ended_at IS NULL GROUP BY 1 HAVING count(*)>1. Clean by hand, never inside a migration, then re-run.',
      dirty_pets;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ownerships_one_active_shelter_custody_per_pet
  ON public.ownerships (pet_id)
  WHERE role = 'shelter_custody' AND ended_at IS NULL;

-- Superseded by ownerships_one_active_shelter_custody_per_pet (above).
DROP INDEX IF EXISTS public.ownerships_one_active_shelter_custody_per_pet_org;

-- ---------------------------------------------------------------------------
-- Post-condition fence. "Applied" is not the same as "closed".
-- ---------------------------------------------------------------------------
-- `DROP INDEX IF EXISTS` reports success when the name is absent — which is
-- how 0172 once "applied" against an environment that used a different name
-- (docs/ops/migrations.md). Verify the EFFECT, by definition, not the ok.
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  new_def text;
BEGIN
  SELECT indexdef INTO new_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'ownerships'
    AND indexname = 'ownerships_one_active_shelter_custody_per_pet';

  IF new_def IS NULL THEN
    missing := missing || 'ownerships_one_active_shelter_custody_per_pet was not created'::text;
  ELSE
    IF new_def NOT LIKE '%UNIQUE INDEX%' THEN
      missing := missing || 'ownerships_one_active_shelter_custody_per_pet is not UNIQUE'::text;
    END IF;
    IF new_def NOT LIKE '%(pet_id)%' THEN
      missing := missing || 'ownerships_one_active_shelter_custody_per_pet is not keyed on (pet_id) alone'::text;
    END IF;
    IF new_def NOT LIKE '%shelter_custody%' OR new_def NOT LIKE '%ended_at IS NULL%' THEN
      missing := missing || 'ownerships_one_active_shelter_custody_per_pet lost its partial predicate'::text;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'ownerships'
      AND indexname = 'ownerships_one_active_shelter_custody_per_pet_org'
  ) THEN
    missing := missing || 'ownerships_one_active_shelter_custody_per_pet_org still exists after DROP'::text;
  END IF;

  -- The sibling indexes this file must not touch.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ownerships'
      AND indexname = 'ownerships_one_active_owner_per_pet'
  ) THEN
    missing := missing || '0195 touched ownerships_one_active_owner_per_pet'::text;
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION '0195 post-condition failed: %', array_to_string(missing, '; ');
  END IF;
END
$$;

COMMIT;
