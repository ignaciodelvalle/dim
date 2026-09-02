# 2026-09 fresh audit — coverage matrix

> Snapshot: `b975f3e9d` (`main`; `11c0ffc57` pushed 2026-09-02 plus `lenses/A01.md`) · Audited SHA: `d7dbf25f7` (lenses ran before WU-0 merged) · Facts: `docs/architecture/facts.json`
> Status: draft — finalized 2026-09-02 by the synthesis writer; fresh review fixes applied 2026-09-02

Lens × area. Each cell is the number of files that lens listed in its **`filesRead`** block for that area; `·` means zero. Rows and columns with zero reads are shown honestly rather than dropped.

Every number below is a parse of what the lenses recorded at `d7dbf25f7` and is **not** re-derived at the snapshot SHA — coverage is a property of the audit, not of the tree, so it does not move when the tree does. Closing the CRITICAL (migration 0211) added files to the repo and read none, so no cell changes.

## How these numbers were derived, and what they exclude

- Every one of the 15 executed lenses ships an explicit `filesRead` list in a collapsed `<details>` block at the end of its Coverage section. The cells below are a mechanical parse of those lists. **No lens reported a bare count without a list**, so no cell is marked "count only".
- Three parsed totals differ by one from the prose count in the lens's own header, in every case because of an appendix or parenthetical line rather than a real file: **B02** parses 13 against a stated 12 (the checker pass's `biome.json` line), **C06** parses 35 against 34 (`app/api/cron/daily/route.ts`, appended after the header count), **D05** parses 44 against 45. Neither number is wrong enough to matter; use the lens file when precision matters.
- **Gap-round reads are NOT in these tables.** Five lenses ran gap rounds (A03 ×2, A06, A08, A10, A11) whose files are listed as prose in a separate `Coverage (gap round)` sub-section, not merged into the base `filesRead` block. That is roughly 130 additional file reads, and it changes the honest answer for several zero cells — see "Zero cells that a gap round actually covered" below before concluding anything from a `·`.
- **B02's column is not comparable to the others.** Its 13 files were read directly; ~145 of the 154 db-touching `app/` files it reasons about were classified **by multiline regex and spot-checked on a stratified sample of about 12**. Its numbers are a census, not a reading.
- A file read by two lenses counts once per lens. The row totals are therefore reader-effort totals, not distinct-file counts.

## The matrix

### `src/modules/*` — the 22 modules

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `src/modules/adoption` | · | · | · | · | · | 2 | · | 2 | 1 | 1 | · | · | · | · | · | **6** |
| `src/modules/alerts` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `src/modules/auth` | 3 | · | 1 | 10 | 1 | · | 1 | 1 | · | 1 | · | · | · | 1 | · | **19** |
| `src/modules/caretakers` | 1 | · | · | · | · | · | · | · | 4 | · | · | · | · | · | · | **5** |
| `src/modules/cases` | · | · | 1 | · | · | · | · | · | 2 | · | · | · | · | · | 1 | **4** |
| `src/modules/custody-disputes` | · | · | · | · | · | · | · | · | 6 | 1 | · | · | · | · | · | **7** |
| `src/modules/decomiso` | · | · | · | · | · | · | 2 | · | 2 | 2 | · | · | · | · | · | **6** |
| `src/modules/events` | · | · | · | · | 1 | · | · | 1 | · | · | · | · | · | · | · | **2** |
| `src/modules/foster` | 1 | · | · | · | · | · | · | · | 1 | 2 | · | · | · | · | · | **4** |
| `src/modules/localities` | · | · | 1 | · | · | · | · | · | · | · | · | · | · | · | · | **1** |
| `src/modules/lost` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `src/modules/notifications` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `src/modules/organizations` | 3 | · | · | · | 1 | 1 | · | · | · | 8 | · | · | · | · | · | **13** |
| `src/modules/panorama` | · | · | · | · | · | 1 | · | 1 | · | 3 | · | · | 1 | · | · | **6** |
| `src/modules/pets` | 3 | · | 4 | 1 | · | 1 | 2 | 4 | 2 | 5 | 1 | 1 | · | · | · | **24** |
| `src/modules/rehome` | 1 | · | · | · | · | · | · | · | 1 | · | · | · | · | · | · | **2** |
| `src/modules/return-to-owner` | · | · | · | · | · | · | · | · | 3 | · | · | · | · | · | · | **3** |
| `src/modules/search` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `src/modules/service-offerings` | · | · | · | · | · | · | · | · | · | 1 | · | · | · | · | · | **1** |
| `src/modules/surveillance` | · | · | · | · | · | · | · | 3 | · | · | · | · | · | · | · | **3** |
| `src/modules/transfers` | 1 | · | · | · | 2 | · | · | · | 10 | 1 | · | · | · | · | · | **14** |
| `src/modules/welfare` | 1 | · | 1 | · | · | 1 | 1 | · | · | 1 | · | · | · | · | 1 | **6** |

### `lib/*` — top-level directories

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `lib/analytics` | 5 | · | · | · | 1 | 7 | · | · | · | 2 | · | · | · | · | 3 | **18** |
| `lib/case-closers` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `lib/domain` | 1 | · | · | · | · | 1 | 1 | 1 | · | 2 | · | · | 1 | · | · | **7** |
| `lib/events` | · | 1 | · | · | 1 | · | · | 1 | · | · | · | · | · | · | · | **3** |
| `lib/hooks` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `lib/infra` | 8 | · | 8 | 7 | 4 | 8 | 4 | 2 | 4 | 6 | 4 | · | 5 | 2 | 2 | **64** |
| `lib/media` | · | · | · | · | · | · | 1 | · | · | · | · | · | · | · | · | **1** |
| `lib/metrics` | 1 | · | · | · | 1 | 4 | · | 1 | · | 1 | · | · | · | · | 1 | **9** |
| `lib/observability` | · | · | · | · | · | 3 | · | · | · | · | · | · | · | · | · | **3** |
| `lib/open-data` | · | · | · | · | · | 2 | · | · | · | · | · | · | · | · | 1 | **3** |
| `lib/panorama` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `lib/projections` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `lib/reference` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `lib/supabase` | · | · | · | 3 | · | · | · | · | · | · | 1 | · | · | · | · | **4** |
| `lib/ui` | · | · | · | · | · | · | 1 | · | · | · | · | · | · | · | · | **1** |
| `lib/utils` | · | · | · | · | · | 1 | · | · | · | · | · | · | · | · | 1 | **2** |

### `app/` — route groups and top-level directories

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `app/(public)` | 1 | · | 11 | · | · | 5 | · | · | 1 | · | · | 1 | · | · | 6 | **25** |
| `app/(app)` | 2 | · | · | 1 | · | 1 | · | · | · | · | · | · | · | · | 1 | **5** |
| `app/(auth)` | · | · | · | 2 | · | · | · | · | · | · | · | · | · | · | · | **2** |
| `app/org` | 1 | · | · | · | · | · | · | · | · | 6 | · | 2 | · | · | · | **9** |
| `app/gob` | 3 | · | · | · | · | 1 | · | · | · | 9 | · | 1 | · | · | 10 | **24** |
| `app/admin` | 1 | · | · | · | · | · | · | · | · | · | · | · | · | · | 2 | **3** |
| `app/api` | 5 | · | 7 | 2 | 1 | 1 | 2 | 1 | 3 | 7 | 13 | 1 | 8 | 1 | · | **52** |
| `app/actions` | 12 | · | 2 | 1 | 2 | · | 3 | · | 2 | 4 | · | · | · | · | · | **26** |
| `app/auth` | · | · | · | 2 | · | · | · | · | · | · | · | · | · | · | · | **2** |
| `app/libreta` | · | · | 1 | · | · | 1 | · | · | · | · | · | · | · | · | · | **2** |
| `app/r` | · | · | 2 | · | · | · | · | · | · | · | · | · | · | · | · | **2** |
| `app/ (root files)` | · | · | · | · | · | · | · | · | · | · | · | · | · | 1 | · | **1** |

`app/mantenimiento`, `app/acceso-denegado`, `app/_components` and `app/_composition` exist and appear in no lens's `filesRead` list at all.

### `apps/mobile/src/*`

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `apps/mobile/src/account` | · | · | · | · | 1 | · | · | · | · | · | · | · | · | · | · | **1** |
| `apps/mobile/src/adoption` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/api` | · | · | · | 2 | · | 2 | 1 | · | · | · | 4 | · | · | · | · | **9** |
| `apps/mobile/src/auth` | · | · | · | 3 | 1 | · | · | · | · | · | 1 | · | · | · | · | **5** |
| `apps/mobile/src/caretakers` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/claims` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/config` | · | · | · | 2 | · | · | · | · | · | · | 1 | · | · | 1 | · | **4** |
| `apps/mobile/src/credential` | · | · | · | · | 1 | 2 | · | · | · | · | · | · | · | · | · | **3** |
| `apps/mobile/src/custody` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/denuncias` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/lost` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/native` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/notifications` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/observability` | · | · | · | · | 1 | 2 | · | · | · | · | 1 | · | · | · | · | **4** |
| `apps/mobile/src/pets` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/release` | · | · | · | · | · | · | · | · | · | · | · | · | · | 1 | · | **1** |
| `apps/mobile/src/shares` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/transfers` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/turnos` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/src/ui` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `apps/mobile/ (root)` | · | · | · | 2 | · | 2 | · | · | · | · | · | · | · | 2 | 1 | **7** |

### `packages/contract/src/*`

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `packages/contract/src/api` | · | · | · | · | · | 4 | · | · | · | · | 1 | · | · | · | · | **5** |
| `packages/contract/src/events` | · | · | · | · | · | · | · | 1 | · | · | · | · | · | · | 1 | **2** |
| `packages/contract/src/icons` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `packages/contract/src/input` | · | · | · | · | · | 2 | 1 | · | · | · | · | · | · | · | · | **3** |
| `packages/contract/src/links` | · | · | · | 1 | · | · | · | · | · | · | · | · | · | · | · | **1** |
| `packages/contract/src/notifications` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `packages/contract/src/reference` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `packages/contract/src/tokens` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `packages/contract/src/viz` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |
| `packages/contract/ (root)` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | **0** |

### Other trees

| area | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `db/` | 1 | 31 | · | · | 5 | 3 | 5 | 10 | 1 | 3 | · | · | · | · | 2 | **61** |
| `scripts/` | 3 | 3 | · | · | 2 | · | 2 | 7 | 2 | 7 | 3 | 3 | 1 | 12 | 3 | **48** |
| `.github/` | · | · | · | · | · | · | · | 1 | · | 1 | · | · | · | 7 | · | **9** |
| `docs/` | 3 | 2 | 3 | 4 | 3 | 2 | 2 | 2 | 4 | 7 | 1 | 1 | 2 | · | 1 | **37** |
| `__tests__/` | · | 6 | 3 | 2 | 3 | · | 2 | 5 | 1 | 3 | 3 | · | 2 | 3 | · | **33** |
| `e2e/` | · | · | · | · | · | · | · | · | · | 1 | · | · | · | · | · | **1** |
| `components/` | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 2 | **2** |
| `supabase/` | · | · | · | 1 | · | · | · | · | 1 | · | · | · | · | · | · | **2** |
| repo-root files (`package.json`, `AGENTS.md`, `vercel.json`, `middleware.ts`, …) | 1 | 2 | 2 | 1 | · | · | 2 | 2 | · | 1 | 2 | 3 | 2 | 4 | 5 | **27** |

### Column totals — files in each lens's base `filesRead` list

| A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | B02 | C04 | C06 | D05 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 62 | 45 | 47 | 47 | 32 | 60 | 33 | 46 | 51 | 86 | 36 | 13 | 22 | 35 | 44 |

**659 file-reads across 15 lenses.** The spread is 13 (B02, a census by design) to 86 (A10), and it tracks prior-triage load: A10 carried 54 prior findings from three merged 2026-07 briefs and read the most; A05 carried 16 and read the fewest of the batch-A lenses at 32.

**Reading effort did not predict severity.** A01 read 62 files and produced the audit's only CRITICAL — but not from any of them: the CRITICAL came from a refuter opening `db/rls.sql` to *disprove* a claim the base pass had already filed as healthy. `db/` shows 1 read in A01's column. The finding is in nobody's `filesRead` count, which is itself the point: coverage measures where a finder looked, and this audit's worst result came from where a refuter looked.

## Zero cells that a gap round actually covered

These rows read `0` above **only because gap-round files are listed in prose rather than in the base `filesRead` block**. They are covered; the matrix simply cannot see it.

| area | covered by | what was read |
|---|---|---|
| `src/modules/lost` | A03 gap round 2 | `lost-listing-read.ts` read end to end (437 lines) — the base pass had logged this area unread at a **stale path** (`lib/infra/lost-listing-read.ts`, since moved), which a naive follow-up would have read as "file removed". |
| `src/modules/alerts` | A10 gap round | all 7 non-test files across `application/firings/*` and `application/subscriptions/*` |
| `src/modules/notifications` | A06 gap round | `application/read/list-notifications-for-user.ts`, `application/notification-actions.ts` |
| `lib/projections` | A08 gap round | `pet-weight.ts`, `pet-jurisdiction.ts` (plus an enumeration of all 16 non-test files for the overlay sweep) |
| `lib/panorama` | A10 gap round | `build-panorama-board.ts` |
| `apps/mobile/src/{claims,custody,denuncias,shares,transfers}` | A11 gap round | all five previously-unread flow directories — screens and view models, ~7,600 lines |
| `apps/mobile/src/pets` | A08 gap round | `LibretaScreen.tsx`, `libreta-view-model.ts` |
| `components/` | A10 gap round | `components/panorama/{LayerPanel,FiltroPanel}.tsx`, and `components/admin/AlertSubscriptionForm.tsx` during the A10-G4 refutation |

That is 11 of the 28 zero rows recovered by gap rounds — which is the empirical case for the completeness critic. (`components/` above is not one of the 28 — it already carries a base-list read from D05, so its row in the table above is additional gap-round reads on top of that base count, not a recovered zero.) **A `·` in this matrix means "not in the base list", not "never read".** Check the lens's gap-round Coverage sub-section before treating a zero as a gap.

## Not covered in lote 1

Zero reads anywhere, in any lens, in any round.

**Application code**

- `src/modules/search` — the only area the batch-A critic named as expected-for-batch-A that still had zero reads after all six gap rounds. It is the single highest-confidence coverage hole in this audit.
- `lib/case-closers` — named in deferred brief C01's scope (`lib/case-closers/**`).
- `lib/hooks`, `lib/reference` — no lens's scope reached either.
- `app/mantenimiento`, `app/acceso-denegado`, `app/_components`, `app/_composition`.

**Mobile** — 7 of the 20 `apps/mobile/src/*` directories: `adoption`, `caretakers`, `lost`, `native`, `notifications`, `turnos`, `ui`. Deferred brief **B08** covers exactly this ground (20 top-level subdirectories at HEAD — the brief says 19; refresh it when lote 2 runs — plus the API client, the offline credential cache, deep links, EAS profiles and config handling).

**Contract** — 5 of the 9 `packages/contract/src/*` directories: `icons`, `notifications`, `reference`, `tokens`, `viz`, plus the package root. Deferred brief **B07** covers the contract boundary; `tokens` is additionally the subject of a live cross-fence contradiction recorded in the canon (`scripts/check-design-tokens.ts` says dark mode never applies; `scripts/check-op-controls.mjs` explains a real bug in terms of what a token IS in dark mode).

**Inside covered areas, the sub-areas each lens named as unreached** — 96 entries in total across the 15 lenses, each written in that lens's own "Areas not reached" section. The ones that most change how a verdict should be read:

- **The RLS test suite was never executed and the live catalog was never queried.** `__tests__/rls/*` needs a running database, which the audit contract forbade. Every RLS claim in A02, A05, A07 and A10 is read from repo source at one SHA. Six named `__tests__/rls/*` files had their existence confirmed by directory listing and their bodies never opened. This is also how `A02-5` was found and how `A01-R1` was missed for so long: a matrix that *declares* an answer for a write cell it never executes reads, from the source, exactly like one that tests it.
- **`app/api/cron/**`** — A01 confirmed the system guards exist and never opened the ~25 individual route bodies; C04 opened 8 of the 25 in full and inspected the rest by targeted search.
- **`app/libreta/**`** — named in A01's scope, never opened. `app/admin/**`'s 20 pages were assumed covered by the layout guard rather than verified page by page. 13 `/gob` sub-views were enumerated and never opened.
- **~30 fetchers in `lib/analytics/dashboards/*.ts`** were swept with a presence heuristic (does the file mention a scope helper) and no WHERE clause was read. `lib/analytics/dashboards/_scope.ts` — the consolidation home the scope fence derives from — was never opened at all.
- **`e2e/`** — one file, in one lens. Playwright is a separate gate from `pnpm verify`; deferred brief **C09** is the lens for it.
- **No timing analysis** anywhere, by construction: A11 verified status-code, error-code and body equality between the not-permitted and not-existing arms, which is as far as a read-only audit reaches.
- **Nothing was executed.** No `pnpm`, no test run, no build, no database query, in any lens, in either batch. Whether the gates are green at the audited SHA is not established here.
