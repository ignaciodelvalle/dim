# Event sourcing hardening — Claude Code prompt

> Six concrete improvements to DIM's event sourcing implementation, ordered by ROI. Each is small, low-risk, and pays off immediately. They close the gaps named in `AGENTS.md → Event sourcing — invariants and scaling roadmap → Known gaps`. The four heavier items (partitioning, PostGIS, projection tables, aggregate version) are deliberately out of scope for this prompt — they live under "Scaling roadmap" in AGENTS.md with explicit trigger conditions and should not be started before those conditions fire.

## Before you start

1. **Read `AGENTS.md` end-to-end.** The locked-in principles ("events are forever", "projections are first-class", "corrections are new events") are non-negotiable. Pay particular attention to the new "Event sourcing — invariants and scaling roadmap" section.
2. **Read this entire prompt before touching code.** The items are ordered so earlier ones unlock later ones: Zod schemas (item 2) are used by the projection-rebuild assertions (item 1); `payload_version` (item 3) lives inside the Zod schemas; UUIDv7 (item 5) makes future projectors cheap.
3. **Run `pnpm test` (and `pnpm lint`, `pnpm typecheck` if they exist) before any change** to confirm the baseline is green. If they're not green, stop and tell Ignacio — don't patch around pre-existing failures.
4. **One PR per item is the default.** They are independent and small. If two items naturally land together (e.g. items 2 and 3 both touch `lib/events.ts`), bundle those two, not all six.

## Conventions

- All code in English, all user-facing strings in es-AR.
- Append-only events: never `update` or `delete` from `pet_events`. Corrections are new events.
- Drizzle owns the table schema (`db/schema.ts`). Triggers, RLS policies, and non-modeled SQL live in `db/*.sql` and are applied manually via Supabase Studio. **Do NOT run `pnpm db:push` for anything that requires unmodeled SQL** — it will propose dropping policies you didn't write in `schema.ts`. See `AGENTS.md → Owner-facing RLS` for the rationale.
- When you ask the user to run a command, explain in one sentence what it does. Ignacio is non-technical.
- Don't change behavior the user didn't ask for. If you spot a separate bug while doing this work, write it down in `docs/` or open a separate issue — don't fold it into these PRs.

## Item 1 — Projection-rebuild script

**Why.** `pets.status`, `pets.estimatedWeightKg`, the `microchipId` block, and (eventually) `ownerships` are denormalized caches over `pet_events`. The dual-write in server actions keeps them in sync. There is no path to re-derive them from the event log today, which means a single bad migration, hand-edit in Studio, or future bug can drift the cache silently. Building the rebuild path is the proof that "events are the source of truth" — and it doubles as a regression test for every server action that emits an event.

**Files to touch.**
- `scripts/rebuild-projections.ts` (new)
- `package.json` — add `rebuild:projections` script entry
- `lib/projections/` (new) — one file per projection, each exposing `replayEvents(events) → cachedState`

**What to build.**

A single Node script callable as `pnpm rebuild:projections [--pet <publicToken>] [--dry-run]`. Defaults:
- Without `--pet`, iterate every pet in the `pets` table.
- With `--pet`, restrict to that one (useful for debugging).
- With `--dry-run` (the default), do not write; report drift.
- Without `--dry-run`, update the `pets` row to match the replayed projection.

For each pet:
1. Load the pet row and all its events ordered by `(occurred_at ASC, recorded_at ASC, id ASC)`.
2. Replay the events through each projection module to compute expected cache values.
3. Diff expected vs. actual on the `pets` row. Report any drift.
4. If `--dry-run` is false, apply the update.

**Projections to implement now.** Keep them small; this is the foundation, not the finished system.

- `lib/projections/pet-status.ts` — `status` and `deceasedAt`. Rules: latest `death_recorded` event → `status='deceased', deceasedAt=occurredAt`. Otherwise latest `status_changed` event → `status=payload.to_status`. Otherwise `status='active'`.
- `lib/projections/pet-weight.ts` — `estimatedWeightKg`. Latest `weight_recorded` event's `payload.kg`, or null if none.
- `lib/projections/pet-microchip.ts` — the five-field microchip block. Earliest `microchip_implanted` event (with payload preference, since the AGENTS.md rule says "never overwrite existing chip data" — but the rebuild script's job is to replay deterministically, so use the earliest event as the binding fact).

**Acceptance criteria.**
- Running `pnpm rebuild:projections --dry-run` against the local dev DB after `pnpm db:start` reports **zero drift** for any pet seeded through the normal flows.
- Manually breaking one row (e.g. `update pets set estimated_weight_kg = 999 where ...` in Studio) and re-running the script reports the drift and, with `--dry-run` off, fixes it.
- A Vitest unit test per projection module covers: empty event list, single event, multiple events of different types, out-of-order `occurred_at`.
- The script's output is grep-friendly (one pet per line, status code in the first column: `OK` / `DRIFT` / `FIXED`).

## Item 2 — Zod payload schemas per event type

**Why.** `EVENT_TYPES` in `db/schema.ts` prevents typos in `event_type`. Nothing prevents an insert with `eventType: 'vaccination_administered'` and an empty payload. That insert succeeds, and the bug surfaces months later when the first vaccination-coverage dashboard runs `WHERE payload->>'vaccine_name' IS NOT NULL` and silently drops rows. Zod schemas per event type, called from every server action before the insert, eliminate this class of bug at the only place writes happen.

**Files to touch.**
- `lib/events.ts` — add a `PayloadSchemas` record keyed by event type, plus `validateEventPayload(eventType, payload)` helper
- Every server action in `app/actions/events.ts` and `app/actions/pets.ts` and `app/actions/scans.ts` that inserts into `pet_events`
- Add Zod if not present: `pnpm add zod`

**What to build.**

In `lib/events.ts`:

```ts
import { z } from "zod";

export const VaccinationAdministeredPayload = z.object({
  payload_version: z.literal(1).default(1),
  vaccine_name: z.string().min(1),
  brand: z.string().nullable(),
  batch: z.string().nullable(),
  administered_by: z.string().nullable(),
  next_due_at: z.string().datetime().nullable(),
});

// ... one per event type. Mirror the AGENTS.md → Event catalog payload columns.

export const PayloadSchemas = {
  vaccination_administered: VaccinationAdministeredPayload,
  // ...
} as const satisfies Record<EventType, z.ZodTypeAny>;

export function validateEventPayload(eventType: EventType, payload: unknown) {
  const schema = PayloadSchemas[eventType];
  return schema.parse(payload); // throws ZodError on failure
}
```

In each server action, call `validateEventPayload('vaccination_administered', { ... })` immediately before the `tx.insert(petEvents).values({ payload: validated, ... })`. Surface ZodError messages via the existing `EventFormState.error` channel in es-AR — translate the field-level error to a sentence Ignacio can ship to users without it leaking implementation detail (e.g. "Falta el nombre de la vacuna" not "vaccine_name: Required").

**Schema discipline.**
- One schema per event type. No "loose" `.passthrough()` — payloads are part of the public contract and unknown keys are mistakes.
- Every schema includes `payload_version: z.literal(1).default(1)` (sets the foundation for item 3).
- Keys match the documented payloads in `AGENTS.md → Event catalog`. If the implementation drifted from the doc, fix the doc in the same PR — they must agree.
- Return type inference (`z.infer<typeof VaccinationAdministeredPayload>`) replaces ad-hoc `Record<string, unknown>` casts in `lib/events.ts → eventPayloadSummary`.

**Acceptance criteria.**
- `validateEventPayload` exists with a schema for every value in `EVENT_TYPES`.
- Every server action that inserts into `pet_events` calls it before the insert. A grep for `tx.insert(petEvents)` and a grep for `db.insert(petEvents)` both show every call site preceded by validation.
- Vitest covers: missing required field rejects, unknown field rejects, valid payload passes, error message is in Spanish at the form layer.
- `eventPayloadSummary` in `lib/events.ts` uses the inferred types instead of `Record<string, unknown>`.

## Item 3 — `payload_version` field and upcaster registry

**Why.** Today's read paths cope with legacy payload shapes inline — `lib/events.ts` renders both old and new `death_recorded.disposition_method` enums in the same switch case. That works for one schema change. It does not scale across the dozens of payload evolutions a five-year system will accumulate. A `payload_version` integer inside every payload plus a typed upcaster table localizes schema evolution to one file and keeps read paths reading the latest shape.

**Depends on item 2** (the version lives inside the Zod schema).

**Files to touch.**
- `lib/events.ts` — add `upcasters` registry, `currentVersion` per event type, `loadPayload(eventType, raw)` helper that runs upcasters
- Every read path that decodes a payload — replace direct `payload as Record<string, unknown>` with `loadPayload(event.eventType, event.payload)`
- Backfill: every existing payload in the DB needs a `payload_version: 1`. One-time migration via `db/migrations/NNNN_payload_version_backfill.sql`

**What to build.**

```ts
// lib/events.ts

const CURRENT_VERSION: Record<EventType, number> = {
  vaccination_administered: 1,
  death_recorded: 2, // example: disposition_method enum split bumped to v2
  // ...
};

type Upcaster = (payload: Record<string, unknown>) => Record<string, unknown>;

const upcasters: Partial<Record<EventType, Record<number, Upcaster>>> = {
  death_recorded: {
    1: (p) => ({
      ...p,
      payload_version: 2,
      disposition_method:
        p.disposition_method === "cremation"
          ? "cremation_collective"
          : p.disposition_method === "burial"
            ? "owner_burial"
            : p.disposition_method,
    }),
  },
};

export function loadPayload(eventType: EventType, raw: unknown) {
  let payload = (raw ?? {}) as Record<string, unknown>;
  let version = (payload.payload_version as number | undefined) ?? 1;
  const target = CURRENT_VERSION[eventType] ?? 1;
  while (version < target) {
    const upcaster = upcasters[eventType]?.[version];
    if (!upcaster) throw new Error(`Missing upcaster ${eventType} v${version}`);
    payload = upcaster(payload);
    version = (payload.payload_version as number) ?? version + 1;
  }
  return payload;
}
```

The Zod schemas (item 2) gate writes against the *current* version. Upcasters bring reads forward. Old code in `eventPayloadSummary` that branches on legacy values gets simplified to one branch per current version.

**Backfill migration.**

```sql
-- db/migrations/NNNN_payload_version_backfill.sql
-- Stamp payload_version=1 on every existing event whose payload doesn't carry one.
-- Idempotent — safe to re-run.
update public.pet_events
set payload = payload || jsonb_build_object('payload_version', 1)
where not (payload ? 'payload_version');
```

The `death_recorded` v1→v2 upcast is illustrative — only ship it if the disposition split has actually happened in the codebase. If it hasn't, ship the framework with every event at v1 and no upcasters, then add upcasters when the first schema change lands.

**Acceptance criteria.**
- Every Zod schema includes `payload_version` and validates the current version.
- `loadPayload` is called wherever payloads are read (`eventPayloadSummary`, the projection-rebuild script from item 1, future projectors).
- Vitest covers a synthetic v1→v2 upcast: insert a v1 payload, read via `loadPayload`, assert it comes out as v2 shape.
- The backfill migration is applied to the local dev DB and `select count(*) from pet_events where not (payload ? 'payload_version')` returns 0.

## Item 4 — Trigger-enforce append-only on `pet_events`

**Why.** RLS denies UPDATE and DELETE for `authenticated` and `anon`. Drizzle and `service_role` bypass RLS by design — that's how server actions and the `handle_new_user` trigger write events for users (RLS is defense in depth, not the only line). A trigger that raises an exception on UPDATE or DELETE for `pet_events` closes the loop: even a careless `db.update(petEvents)` in a future server action errors loudly at the database layer.

**Files to touch.**
- `db/triggers.sql` — add the trigger function and trigger
- Apply via Supabase Studio (consistent with existing `triggers.sql` workflow)

**What to build.**

```sql
-- db/triggers.sql (append to the existing file)

-- Enforce append-only on pet_events at the database layer. RLS already denies
-- UPDATE/DELETE for authenticated/anon roles; this trigger extends the rule to
-- service_role and direct Drizzle connections. AGENTS.md → Event sourcing
-- invariants: "No UPDATE or DELETE on pet_events from any role".
--
-- Escape hatch: set the session-local flag `app.allow_event_mutation = 'true'`
-- in the same transaction as the mutation. Used only by deliberate, audit-logged
-- corrections (none today). Default is to raise.

create or replace function public.enforce_pet_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_event_mutation', true) = 'true' then
    return coalesce(new, old);
  end if;
  raise exception 'pet_events is append-only (AGENTS.md). % blocked.', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists pet_events_no_update on public.pet_events;
create trigger pet_events_no_update
  before update on public.pet_events
  for each row execute function public.enforce_pet_events_append_only();

drop trigger if exists pet_events_no_delete on public.pet_events;
create trigger pet_events_no_delete
  before delete on public.pet_events
  for each row execute function public.enforce_pet_events_append_only();
```

**Acceptance criteria.**
- After applying the trigger via Studio, a manual `update public.pet_events set notes = 'x' where id = ...` from Studio errors with the trigger's message.
- A Vitest integration test (using a direct test DB connection) confirms `db.update(petEvents)...` rejects.
- The existing test suite still passes — the trigger should not affect any current code path because nothing currently does update/delete on `pet_events`.

## Item 5 — Switch `pet_events.id` from UUIDv4 to UUIDv7

**Why.** UUIDv4 is unordered. Once a projector or stream consumer reads `pet_events` (the foundation for the scaling-roadmap item 3 in AGENTS.md), it needs a monotonic cursor: "I have processed up to X, give me everything strictly after X." With v4 IDs the cursor has to be `(created_at, id)`, which is awkward and not strictly monotonic (two events recorded in the same millisecond have undefined order). UUIDv7 embeds a millisecond timestamp in the high bits, giving you a natural monotonic cursor on the `id` column alone. Cheap to change today; very expensive once the table is huge.

**Files to touch.**
- `db/schema.ts` — change `pets`, `pet_events`, `ownerships`, `attachments`, `reminders`, `notifications` ID defaults
- `db/migrations/NNNN_uuidv7_default.sql` — install the function and switch the column defaults
- Optionally backfill `pet_events.id` with UUIDv7 values **only** if the dev DB is throwaway. Production data is never UUIDv7-backfilled — going forward is fine.

**What to build.**

Postgres 17+ ships `uuidv7()` natively. For older Postgres (Supabase is currently on 15), install the standard `pg_uuidv7` extension or use this minimal SQL function:

```sql
-- db/migrations/NNNN_uuidv7_default.sql
create or replace function public.uuidv7()
returns uuid
language sql
volatile
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- Switch the default for new rows. Existing UUIDs are unchanged.
alter table public.pet_events alter column id set default public.uuidv7();
-- Apply the same to other event-stream-relevant tables if/when they go to projectors.
```

Update `db/schema.ts` to mirror the new defaults. Drizzle's `defaultRandom()` will not match `uuidv7()` — switch to `.default(sql\`public.uuidv7()\`)` for the relevant columns and document it in a comment.

**Important.** Switching the default is non-destructive. Existing rows keep their UUIDv4 IDs forever; new rows get UUIDv7. This is fine — projectors can use `created_at` as a tie-breaker for the v4 era and `id` alone for the v7 era. Document this in `AGENTS.md → Event sourcing → Invariants` ("`pet_events.id` is UUIDv7 for rows created after [migration date]; older rows are UUIDv4 — use `(created_at, id)` for cross-era ordering").

**Acceptance criteria.**
- After applying the migration, `insert into pet_events ... returning id` returns a UUID whose first byte sorts higher than rows inserted seconds before.
- `select id from pet_events order by id desc limit 5` and `select id from pet_events order by created_at desc limit 5` return the same rows in the same order for the v7-era rows.
- No existing test breaks.
- AGENTS.md updated with a one-line note in the invariants section.

## Item 6 — Filter `credential_scanned` self-scans server-side

**Why.** `app/(app)/mis-mascotas/[publicToken]/EventTimeline.tsx:52-58` filters self-scans in the browser. The server query loads every `credential_scanned` event for the pet, including self-scans, ships them to the client, and the client drops them. For a pet whose owner views their own credential daily, that's daily-growing payload waste. SQL-side filtering is one extra `where` clause and makes the data transfer match what's rendered.

**Files to touch.**
- `app/(app)/mis-mascotas/[publicToken]/page.tsx` — the timeline query
- `app/(app)/mis-mascotas/[publicToken]/historial/page.tsx` — same query if it duplicates the timeline fetch
- `EventTimeline.tsx` — keep the "Show my own scans" toggle as a UI affordance, but have it trigger a re-fetch via a Next.js search param rather than client-side filtering, OR (simpler) drop the toggle entirely until someone asks for it back

**What to build.**

Default the query to exclude self-scans:

```ts
const events = await db
  .select()
  .from(petEvents)
  .where(
    and(
      eq(petEvents.petId, pet.id),
      or(
        ne(petEvents.eventType, "credential_scanned"),
        sql`(${petEvents.payload}->>'is_self_scan')::boolean is distinct from true`,
      ),
    ),
  )
  .orderBy(desc(petEvents.occurredAt));
```

If keeping the "Show my own scans" affordance, accept a `?includeSelfScans=1` search param on the page and conditionally drop the second predicate. This keeps the URL shareable and makes self-scan inclusion a server-decided state rather than client-side post-filtering.

**Acceptance criteria.**
- The pet detail page's network response no longer contains `credential_scanned` events with `is_self_scan: true` in the default view.
- The "Mostrar mis propios escaneos" toggle either remains (with a search-param round-trip) or is removed; whichever is shipped, behavior is consistent between `page.tsx` and `historial/page.tsx`.
- No existing test breaks; add a small test that asserts self-scans don't reach the page component in the default code path.

## Final checklist before opening each PR

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` (or `pnpm tsc --noEmit`) clean
- [ ] `pnpm lint` (Biome) clean
- [ ] AGENTS.md updated if the change altered an invariant or completed a "Known gap"
- [ ] The PR description names the item number from this prompt
- [ ] Manual smoke test: create a pet, add a vaccination, mark it lost, mark it found, view the timeline — all of these should work end-to-end after each item

## What is NOT in scope

The four items below live in `AGENTS.md → Event sourcing → Scaling roadmap` with explicit trigger conditions. Do **not** start them as part of this hardening work:

- Monthly partitioning of `pet_events`
- PostGIS `geography(Point, 4326)` for event location
- Typed projection tables for analytical dashboards
- Per-aggregate `version` for optimistic concurrency

Each of those is justified by a specific future milestone (welfare officer dashboard, vet portal, refugio portal). Doing them now would be speculative work against load that doesn't exist yet.
