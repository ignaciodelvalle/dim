# Event-sourcing / data-integrity audit

## Ground truth

| Field | Value |
|---|---|
| Branch | `integration/all-20260703` |
| HEAD | `558f7882` |
| Scope | Canonical checkout `C:/dev/dim` only (read-only) |
| Prior work | Projection-writes audit (`docs/design/handoffs/2026-07-03-projection-cron-notifications-audit.md` @ `12cf68e4`); idempotency guards (`__tests__/idempotency-guards.test.ts`) |

---

## Executive verdict

The three AGENTS.md invariants are **real for the pet medical spine**, not purely aspirational — but they are **not yet comprehensive enough** to defend without caveats to a government auditor who expects a single, closed event log with uniform enforcement.

**What genuinely holds:** `pet_events` append-only at the DB trigger layer; corrections via `event_amended`; dual-write drift detection via `rederivePetCache` + CI fitness sweep + detect-only cron + admin drift card; most high-trust writers validate payloads and pair event + projection in transactions.

**What an auditor would challenge:** no single validated insert boundary; `case_events` and `cases` are hybrid/mutable; several vet/govt read paths still use raw payloads where amendments apply; idempotency is opt-in per writer; cache can diverge on deliberately excluded columns without automated alarm.

---

## Per-invariant assessment

### Invariant #1 — “The pet is the credential”

| Status | **ENFORCED** (identity) / **PARTIAL** (pure event derivation) |
|---|---|
| Mechanism | Stable `pets.public_token` (`DIM-XXXX-XXXX`); public routes resolve via `pets` row; `pet_registered` event emitted at creation (`src/modules/pets/infrastructure/pets-repository.ts:186-197`) |
| Credit | Token is globally unique, QR-verifiable, separate from Tier-2 libreta share tokens |

Credential **identity** is anchored on `pets`, not replayed from events. That matches product design (the row is the document handle; registration is event-paired). Not a integrity bug, but worth stating explicitly to an auditor.

---

### Invariant #2 — “Events are append-only; corrections are new events”

| Status | **ENFORCED** for `pet_events` / **PARTIAL** for other event-like tables |
|---|---|

**Mechanisms (CONFIRMED):**

```101:181:db/triggers.sql
create or replace function public.enforce_pet_events_append_only()
...
  raise exception 'pet_events is append-only (AGENTS.md). % blocked.', tg_op
...
create trigger pet_events_no_update before update on public.pet_events ...
create trigger pet_events_no_delete before delete on public.pet_events ...
```

- **RLS backstop:** `db/rls.sql:215-217` — no UPDATE/DELETE policies on `pet_events`.
- **Integration proof:** `__tests__/pet-events-append-only.test.ts:85-99` blocks Drizzle UPDATE/DELETE; escape hatch requires both GUCs + audit row (`db/triggers.sql:117-135`).
- **Narrow DELETE exception:** scan retention only (`lib/infra/scan-retention.ts:77-84`, `app.allow_scan_purge='true'`, scanner + `credential_scanned` + >90d, audit `scan_event_purged`).
- **Corrections:** `event_amended` writer (`src/modules/events/application/amendment/amend-event.ts:111-127`); chains flattened to original target (`amend-event.ts:80-89`).

**Gaps:**

| Gap | Severity | Status |
|---|---|---|
| `case_events` has **no append-only trigger** — “append-only by convention” only (`db/migrations/0069_case_events.sql:17`) | Medium | CONFIRMED |
| `app.allow_event_mutation` escape hatch exists (audited, but mutable) | Low–Med | CONFIRMED |
| Production app code: no UPDATE/DELETE on `pet_events` outside scan purge | — | CONFIRMED (grep; only `lib/infra/scan-retention.ts` in prod) |

---

### Invariant #3 — “Every view is a projection; no view is source of truth”

| Status | **PARTIAL** — strong for medical cache columns; hybrid elsewhere |
|---|---|

**Mechanisms (CONFIRMED):**

- **Rederive harness:** `lib/infra/rederive-pet-cache.ts` — 21 checked columns; shared by CI (`__tests__/pet-cache-rederivation.test.ts`) and ops (`scripts/detect-pet-cache-drift.ts`).
- **Detect-only cron:** `app/api/cron/reconcile-pet-status/route.ts:16-23,136-150` — no auto-repair; human gate via `scripts/rebuild-projections.ts --apply`.
- **Admin visibility:** `components/admin/PetStatusDriftCard.tsx:1-8`, `lib/analytics/admin-metrics.ts:350-405`.
- **Event-first dual-write pattern:** e.g. `record-movement.ts:38-58` (event INSERT before cache UPDATE in one tx).

**Legitimate exclusions** (documented in `rederive-pet-cache.ts:24-37`):

- Adoption **listing shelf** metadata (`adoptionListedAt`, story, requirements…) — no event by design (`adoption-repository.ts:331-334`).
- UI disclosure / Tier-2 prefs — no event by design.
- `potentiallyDangerousBreed` — breed heuristic, not event-derived.
- `inCustodyDispute` — sourced from `custody_disputes` table, not events (`rederive-pet-cache.ts:20-22,105-106`).

**Projection tables & event pairing:**

| Table / cache | Event-paired in tx? | Notes |
|---|---|---|
| `pets.status`, weight, pregnancy, rabies obs, adoption eligibility | Yes (dual-write + rederive) | Checked by harness |
| `pet_identifications` (chip/tattoo) | Yes (event + ident row) | Harness reads canonical ident, not legacy `pets.*` chip cols |
| `ownerships` | Yes in major flows | e.g. adoption finalize (`adoption-repository.ts:836-879`), chip-match (`confirm-chip-match-refugio.ts:113-159`) |
| `cases` | **Hybrid** | Mutable workflow state; closes via `closeCase()` UPDATE; some closes emit `note_added` (`close-stale-lost-episodes.ts:91-107`), not all lifecycle facts |
| Adoption listing columns on `pets` | **No event** | Documented exclusion |
| `reminders`, `notifications` | Mutable messaging | Not claimed as event projections |

**Risk:** Exclusions are honest and documented, but an auditor may read “projection purity” literally and ask why listing metadata and case status are writable without events.

---

## Amendment integrity (#2 corrections)

| Status | **PARTIAL** — core machinery solid; read-boundary coverage incomplete |
|---|---|

**Credit (CONFIRMED):**

- `overlayAmendments()` / `applyAmendments()` — `lib/infra/amendment.ts:105-187`
- SQL twin for aggregates — `lib/infra/amendment-sql.ts:42+`; used in rabies KPIs (`lib/analytics/govt-home-kpis.ts:127`, `lib/metrics/trends.ts:244`, `lib/infra/outreach-pipelines.ts:157`)
- Owner surfaces wired since prior audit:
  - Libreta face — `get-libreta-face-data.ts:169-179`
  - Profile compliance — `fetchPetEventsForProfileV2` → `overlayAmendments` (`owner-dashboard.ts:1549-1552`)
  - Event detail — `eventos/[eventId]/page.tsx:47-58`
  - Nudges / owner dashboard — `owner-nudges.ts:367`, `owner-dashboard.ts:1146`

**Remaining fix-A class gaps (SUSPECTED → CONFIRMED where cited):**

| Surface | Issue | Severity |
|---|---|---|
| Tier-2 libreta share `/libreta/compartir/[shareToken]` | Fetches raw events, no `overlayAmendments` (`page.tsx:105-115`) | **High** — vet-presentable clinical surface |
| `fetchSterilizationVetRanking` | Raw `payload->>'performed_by'`; `sterilization_performed` is amendable (`outreach-pipelines.ts:284-307`) | Medium |
| `recentFive` timeline preview on profile | Metadata from raw payload (`owner-dashboard.ts:1536-1547`) | Low |
| `EventTimeline.tsx:93-95` | Renders caller-supplied payload; safe when caller overlays (libreta face), unsafe when not (share route) | Medium (downstream) |

**Amendment chain:** Latest wins; amendments-of-amendments resolve to **original** target (`amend-event.ts:80-89`). Deterministic ordering by `occurredAt` in `overlayAmendments` (`amendment.ts:166-171`). **CONFIRMED.**

---

## Event schema integrity (#4)

| Status | **PARTIAL** — strong CI gate; porous insert boundary |
|---|---|

**Credit (CONFIRMED):**

- Per-type Zod registry — `lib/events/event-schemas.ts:1643-1659`
- CI: every implemented type has schema (`__tests__/event-schemas.test.ts:27-31`; `UNIMPLEMENTED` empty)
- Most domain writers call `validateEventPayload` before insert (e.g. intake, foster, transfers, welfare, scans)

**Gaps (CONFIRMED):**

| Gap | file:line | Severity |
|---|---|---|
| **No mandatory validation at insert boundary** — `EventsRepository.insertEvent()` inserts raw values | `events-repository.ts:79-82` | **High** |
| `WelfareRepository.insertPetEvent()` — no validation in repo | `welfare-repository.ts:499-503` | Medium (callers validate) |
| Many direct `tx.insert(petEvents)` sites — discipline per writer, not enforced | e.g. `foster-repository.ts:507+` (validates payloads inline) | Medium |
| **No DB CHECK** on `event_type` or payload shape | schema only | Low (app-layer by design) |
| Comment claims “every insert site” validates — overstated | `event-schemas.ts:1641` | Documentation drift |

Bypass requires service-role / Drizzle (`BYPASSRLS`); not PostgREST-writable for arbitrary payloads from owners (INSERT policy is owner-self, `author_organization_id IS NULL`).

---

## Idempotency / dedupe (#5)

| Status | **PARTIAL** — infrastructure exists; not universal |
|---|---|

**Credit (CONFIRMED):**

- Partial unique index — `db/schema.ts:1158-1160`
- `insertEventIdempotent()` — ON CONFLICT DO NOTHING + last-stable-wins (`lib/events/event-idempotency.ts:92-134`)
- Documented plain-insert paths for cascades/system events (`events-repository.ts:6-8`)
- Integration tests: intake, tattoo, microchip replace, foster assign, disclosure prefs (`__tests__/idempotency-guards.test.ts`)

**Gaps (CONFIRMED / SUSPECTED):**

| Path | Idempotency | Severity |
|---|---|---|
| Owner medical use-cases (vaccination, deworming, weight, death…) | `insertEventIdempotent` when key provided | Covered |
| Scans, symptom/outbreak cascades, cron closers, many custody handoffs | Plain insert | Medium — double-submit can duplicate |
| `clientIdempotencyKey` null → always plain insert | By design (`event-idempotency.ts:98-103`) | Accepted for admin/system |
| Foster/adoption/decomiso bulk paths | Mixed; some advisory locks, not all keys | Medium |

**Not a log corruption issue** (append-only preserves duplicates), but **correctness** for KPIs and owner UX.

---

## Cache reconciliation (#6)

| Status | **ENFORCED detect-only** / repair human-gated |
|---|---|

**Credit (CONFIRMED):**

- Nightly cron — `vercel.json:81`, `reconcile-pet-status/route.ts`
- Ops script — `scripts/detect-pet-cache-drift.ts:13-19` (exit 1 on drift)
- CI fitness sweep — `__tests__/pet-cache-rederivation.test.ts:5-17`
- Repair — `scripts/rebuild-projections.ts:14-15` requires `--apply`

**Gaps:**

| Gap | Severity |
|---|---|
| Cron caps at 2000 pets / 45s per run — full registry not scanned each night | Low–Med |
| Excluded columns (listing metadata, prefs) can drift with **no** harness | Low (documented) |
| `rebuild-projections.ts` only replays status/weight subset — not full `CHECKED_COLUMN_NAMES` | Medium |
| Silent divergence possible until cron/CI catches checked columns | Low for checked cols |

**Cannot silently diverge on checked medical cache columns without eventual detection** — **CONFIRMED** for CI + cron path, **SUSPECTED** lag up to 24h for unchecked pets in large registries.

---

## Cross-aggregate consistency (#7)

| Status | **PARTIAL** — good patterns in critical paths; not proven globally |
|---|---|

**Credit (CONFIRMED):**

- Adoption finalize: ownership end + insert + event + case close in one tx (`adoption-repository.ts:782-879`)
- Transfers: shared `insertPetEvent` validates + tx-scoped (`transfers-repository.ts:357-379`)
- Chip-match custody: advisory lock + ownership + event in tx (`confirm-chip-match-refugio.ts:113-159`)
- Movement writer: event-first (`record-movement.ts:38-58`)
- Macro invariant tests lock idempotency + append-only (`__tests__/macro-invariants/macro-invariants.test.ts`)

**Gaps (SUSPECTED):**

- `cases.status` updates without always emitting a `pet_events` fact (workflow projection)
- `custody_disputes` drives `inCustodyDispute` cache separately from events
- Not all writers audited for single-tx pairing; partial tx failure could leave ownership changed without event (standard DB risk; mitigated where `db.transaction` wraps both)

No systematic test proves **every** projection write is event-paired — only representative flows + fitness sweep for `pets` cache columns.

---

## Severity-ranked findings

| Severity | Invariant | file:line | Gap | Fix |
|---|---|---|---|---|
| **High** | #3 / amendments | `app/libreta/compartir/[shareToken]/page.tsx:105-115` | Tier-2 libreta share renders **raw** payloads — corrections invisible to vets | Apply `overlayAmendments` before `groupLibretaEvents` |
| **High** | #4 | `src/modules/events/infrastructure/events-repository.ts:79-82` | `insertEvent()` bypasses validation | Validate inside repo or make private; single public insert API |
| **Medium** | #2 | `db/migrations/0069_case_events.sql:17` | `case_events` append-only by convention only | Add `enforce_case_events_append_only` trigger mirroring `pet_events` |
| **Medium** | #2 / amendments | `lib/infra/outreach-pipelines.ts:306-307` | Sterilization ranking reads raw `performed_by` / `clinic` | Route amendable fields through `amendedPayloadText` or TS overlay |
| **Medium** | #5 | Multiple custody/foster/cron writers | Plain inserts without `clientIdempotencyKey` | Extend idempotency to double-submit-prone owner/org forms |
| **Medium** | #3 | `scripts/rebuild-projections.ts:36-37` | Repair script subset ≠ full rederive harness | Align repair with `rederivePetCache` column set or document scope |
| **Medium** | #3 | `src/modules/adoption/infrastructure/adoption-repository.ts:331-346` | Listing metadata is SoT on `pets`, no event | Accept with legal/docs citation, or emit listing events |
| **Low** | #2 | `db/triggers.sql:117-135` | Audited mutation escape hatch | Restrict to migration role; periodic audit of `pet_events_mutation_override` rows |
| **Low** | #3 / amendments | `lib/analytics/owner-dashboard.ts:1536-1547` | `recentFive` preview ignores amendments | Overlay before summary extraction |
| **Low** | #6 | `reconcile-pet-status/route.ts:54-59` | Partial nightly scan | Persist cursor or document coverage SLA |

---

## What to tell a government auditor (honest framing)

**Defensible today:**

1. The **authoritative medical fact log** (`pet_events`) is **append-only at the database**, with audited, narrow exceptions (scan TTL purge).
2. **Corrections are new events**, not mutations — `event_amended` with allowlist and admin audit path.
3. **Cache drift on medical columns is mechanically detectable** (CI + cron + ops script) and **repair is intentionally human-gated**.
4. **High-risk lifecycle writes** (adoption, custody transfer, movement) follow event-first or same-transaction pairing in reviewed paths.

**Do not overclaim:**

1. Not all tables are event-sourced — `cases`, adoption listing shelf, UI prefs, and reminders are **intentional mutable projections**.
2. Validation and idempotency are **writer discipline**, not a single enforced gateway.
3. Amendment projection is **not universal** on every clinical read path (Tier-2 share is the standout gap).
4. `case_events` lacks the same hard append-only guarantee as `pet_events`.

---

## Progress since 2026-07-03 projection audit

At `12cf68e4`, finding **A** (`applyAmendments` unwired) was **open**. At `558f7882`, substantial remediation landed:

- `overlayAmendments` on libreta face, profile v2 events, owner nudges/dashboard, travel export
- `amendedPayloadText` on key govt rabies KPIs
- Drift card + reconcile cron instrumentation (finding **B** partially closed)

**Still open from that audit:** Tier-2 share amendment parity; full cron fleet telemetry (9/21 crons without `cron_runs` per handoff); vaccine notification dedupe (**C**) — out of scope here but affects log-adjacent correctness.

---

## Top integrity risks (priority order)

1. **Tier-2 libreta share showing pre-correction clinical data** — undermines “corrections are the truth” for the vet handoff surface.
2. **No single validated event insert boundary** — any new writer can skip Zod until CI catches missing schema, not bad payloads.
3. **`case_events` without append-only trigger** — secondary log can be mutated if service credentials leak or a bug calls UPDATE.
4. **Incomplete idempotency** — duplicate events on double-submit (logically consistent but wrong counts/compliance).
5. **Hybrid case/listing state** — architecturally intentional but needs explicit boundary in auditor-facing docs (“workflow state ≠ medical record”).

The append-only trigger, rederive sweep, and amendment overlay (where wired) are **genuine enforcement**, not marketing — they are the strongest evidence that DIM’s event-sourcing claims are substantive for the pet medical spine. Closing the high-severity gaps above would move the posture from **“defensible with documented boundaries”** to **“comprehensive for clinical audit.”**
