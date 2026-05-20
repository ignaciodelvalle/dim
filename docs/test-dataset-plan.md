# Plan: Make the Test Suite and Storyline Dataset Pull Their Weight

> Audit + roadmap for the `__tests__/` suite and the `scripts/seed-storylines-*` dataset, written for the MiMAR/DIM revival. Goal: turn two parallel-but-disconnected investments into one coherent thing.

## TL;DR (the single most important finding)

**The dataset and the test suite live in different universes.**

- `__tests__/` has 85 test files, ~21,000 lines of code, hitting Postgres via Drizzle.
- `scripts/seed-storylines-*.ts` plus the two narrative docs total ~9,500 lines describing 34 pets, 4 batches, hundreds of richly-typed events, and an explicit "Cross-pet workflow stressors" matrix listing 15 named edge cases the dataset was designed to exercise.
- A grep across all 85 test files for `seed-storylines`, `DIM-SCDO`, `DIM-LAIK`, `DIM-HACH`, `DIM-BRGR`, or any storyline `public_token` returns **zero hits**. Only one test imports anything from `scripts/` at all (`import-indec-localities.test.ts`).

So the dataset is currently a demo asset — it lights up `pnpm tsx scripts/seed-storylines-*.ts` for screenshots and dev. The tests, meanwhile, each rebuild their own ad-hoc pets, users, and events inline. `return-to-owner.test.ts` spends 228 lines on boilerplate before its first `describe`; `lost-pet-broadcast.test.ts` spends 291; `chip-match.test.ts` spends 207; `admin-decisions.test.ts` 141. That setup is duplicated across files with subtle drift.

Closing this gap is the single biggest lever to make the set "as useful as possible." Everything below either supports that, or addresses problems that fall out of it.

## What's actually there

### The test suite (`__tests__/`)

- 85 `*.test.ts` files, 20,929 LOC total.
- Vitest, `fileParallelism: false` (serial — required because tests share a single Postgres).
- One setup file (`setup.ts`) loading env, one mock (`server-only.ts`). **No shared factories, builders, or fixtures.**
- Domain spread by filename prefix: case (5), admin (5), foster (4), event (4), adoption (4), lost (3), disease (3), business (3), ar (3), welfare (2), species (2), rate (2), pregnancy (2), dni (2), plus singletons (symptom, scheduling, role, etc.).
- Heaviest files: `admin-institutional.test.ts` (1,188 LOC, 29 describes), `admin-revocations.test.ts` (1,028), `return-to-owner.test.ts` (877), `lost-pet-broadcast.test.ts` (813).

### The dataset (`scripts/seed-storylines-*` + docs)

Four batches:

- **original10** (2,074 LOC) — 11 pets (Scooby-Doo, Brian/Vinny, SLH, Snoopy, Odie, Bolt, Puss, Tom, Courage, Blue), pinned to Ignacio / Noelí / Graciela, all in CABA Comunas 1/2/14, with closed death cycles and the Brian → Vinny replacement.
- **iconic** (2,482 LOC) — 7 pets (Laika, Hachikō + Hachiko Ni Sei, Pal/Lassie, Terry/Toto, Kabosu + Hanako), relocated to real Argentine localities, no-microchip-pre-2005 rule, full disposition cycles per Ley CABA 5470.
- **supporting** (1,351 LOC) — 14 generic-name pets (Firulais, Luna, Toby, Coco, Lola, Pepito, Pampita, Romeo, Hércules, Bichita, Cielo, Pelusa, Michi, Negro).
- **dangerous** (606 LOC) — 2 pets (Cujo, Roco) covering PPP-flag / dangerous-breed flows.

Two narrative docs:

- `docs/test-storylines.md` (663 lines) — original cartoon cohort + a "Cross-pet workflow stressors" section listing **15 named scenarios** the dataset uniquely exercises (resurrection, retroactive chip implant, orphaned ownership chain, 3-handler overlap, foreign-jurisdiction reentry, 9-scan QR burst, 4-owner cat, custom counter "lives remaining," anaphylaxis, heartworm 3-injection protocol, etc.).
- `docs/test-storylines-iconic.md` (504 lines) — Argentina-relocated iconic cohort with its own coverage matrix.

The seed code is well-engineered: shared `Storyline` and `PetBio` types, `EventType` checked against `EVENT_TYPES` from `db/schema.ts` so typos won't compile, owner pinning via author roles, photo references, jurisdiction normalization. It's the most expressive expression of the domain model in the repo.

## The five real problems

### 1. The dataset is orphaned from the tests

Covered above. The "Cross-pet workflow stressors" list in `docs/test-storylines.md` reads like a test plan — 15 numbered edge cases. None of them have a corresponding `*.test.ts` named after the storyline pet that proves the case. The dataset is the spec; the tests don't reference the spec.

### 2. Each test file is its own miniature seed script

There are no shared builders. Pull any of the top-10-biggest test files and the first 100–300 lines are essentially the same shape: insert org → insert user → insert pet → insert events. With 85 files doing this independently, you get:

- Subtle drift (different files use slightly different defaults for jurisdiction, microchip format, owner role).
- A change in `db/schema.ts` requires updates in dozens of test files instead of one factory.
- High cognitive cost to read any single test (the "what's being tested" is buried under setup).
- ~5–10k of those 21k LOC are probably duplicated setup.

### 3. The dataset's "stressor list" isn't a coverage matrix

`docs/test-storylines.md` lists 15 cross-pet stressors, but it doesn't say which `*.test.ts` covers each one, or which ones are uncovered. Without that mapping, the dataset can't tell you what's still untested, and the test suite can't tell you which scenarios it actually exercises. The doc ends with `## Quick stats` followed by an empty section — that's the gap where the matrix should live.

### 4. The serial test run will bite as the suite grows

`fileParallelism: false` is the right call given shared Postgres, but at 85 files it's already a real wall-clock cost, and the suite is still adding files (the May-20 timestamps show several recent ones). Without per-test isolation (transactional rollback or per-worker schemas), this only gets worse.

### 5. No coverage signal, no contract tests

Nothing in `package.json` runs Vitest with `--coverage`. No coverage gate in CI (`.github/` exists — worth checking what's wired). And because each test inlines its own version of the world, there's nothing acting as a contract test against `db/schema.ts` — schema drift can land green.

## What "as useful as possible" looks like

A test set is useful in three ways: it tells the truth about correctness, it tells the truth about coverage, and it doesn't get in the way. The current set is partially good at the first, weak on the second, and actively in the way on the third. The plan below targets all three.

## The plan, in priority order

### Phase 1 — Connect the dataset to the tests (the highest-leverage move)

**1.1. Extract a `__tests__/fixtures/` module that re-exports the storyline data.**
The seed scripts already export typed arrays. Lift the type definitions (`Storyline`, `PetBio`, `EventEntry`) out of `seed-storylines-iconic.ts` into `__tests__/fixtures/types.ts` (or into a new `lib/fixtures/`), then have each seed script *and* the tests import them. Add a small `loadStoryline(token: string)` helper that returns the parsed in-memory storyline without touching the DB.

**1.2. Build a `seedStoryline(db, story)` helper.**
One function that inserts a `Storyline` and its events into the DB inside a transaction, returns the inserted IDs, and is the single source of truth for "how do storyline fixtures land in Postgres." Tests that need Scooby use `await seedStoryline(db, scooby)`; they stop hand-rolling pets.

**1.3. Rewrite the top 5 setup-heavy tests against the helpers first.**
Pick `return-to-owner.test.ts` (228 lines of setup), `lost-pet-broadcast.test.ts` (291), `chip-match.test.ts` (207), `admin-decisions.test.ts` (141), `adoption-review.test.ts`. Each of these has an obvious storyline analogue (return-to-owner ↔ lost/found cycles in Scooby/Bolt; chip-match ↔ Bolt's 9-scan burst; admin-decisions ↔ Brian's resurrection and posthumous flows). Measure the LOC reduction; if it's substantial, roll the pattern out to the rest of the suite incrementally.

### Phase 2 — Make the dataset self-documenting as a coverage matrix

**2.1. Fill in the empty `## Quick stats` section of `docs/test-storylines.md`.**
Turn the existing "Cross-pet workflow stressors" list into a table with three columns: stressor / storyline source / test file. Generate the third column with a tiny script — for each stressor's primary `public_token`, grep tests for that token. As tests adopt storylines (Phase 1), this matrix populates automatically.

**2.2. Add the symmetric matrix to `docs/test-storylines-iconic.md`.**
The doc already has a "Cross-pet coverage matrix" header — flesh it out the same way.

**2.3. Add a `pnpm test:coverage-matrix` script.**
A `tsx` script that prints which `EVENT_TYPES`, which `jurisdiction` combinations, and which life-cycle transitions are exercised by either (a) the storyline data or (b) the tests. The interesting cell is "in data, not in tests" — that's the to-do list.

### Phase 3 — Pay down the boilerplate debt with proper factories

**3.1. Build a minimal factory layer in `__tests__/factories/`.**
- `makeUser({ role?, jurisdiction? })`
- `makeOrg({ kind?, locality? })`
- `makePet({ owner, species?, status?, ...overrides })`
- `makeEvent({ pet, type, ...overrides })`

Each factory returns the inserted row and uses sensible Argentina-flavored defaults (CABA Palermo, microchip-implanted today, etc.). Crucially, factories are for *tests that don't need a full storyline* — for full biographies, Phase 1's `seedStoryline` is the right tool. The split matters: factories give you a green-field row to mutate, storylines give you a realistic timeline to query against.

**3.2. Kill the inline `createTestUser` / `makePet` helpers in `achievements.test.ts`, `admin-decisions.test.ts`, `create-pet-custody.test.ts`.**
These three already have local-only versions. Migrate them first to validate the API.

**3.3. Add a `__tests__/db.ts` that exposes a `withTx(fn)` helper.**
Wraps a Drizzle transaction and rolls back at the end. Tests opt in by calling `await withTx(async (tx) => { ... })`. This removes the need for per-test cleanup and is the prerequisite for Phase 4.

### Phase 4 — Make the suite faster (and parallelizable)

**4.1. Switch tests onto `withTx` and flip `fileParallelism: true`.**
Once every test runs inside a rolled-back transaction, files no longer interfere and can run in parallel. Expect a 3–5× wall-clock improvement on the existing suite at zero correctness cost.

**4.2. For the handful of tests that can't be transactional** (anything testing triggers that fire on `COMMIT`, or RLS that needs separate connections), give them their own schema-per-worker. Vitest's `pool: 'forks'` plus a `CREATE SCHEMA test_${workerId}` setup hook is the standard pattern.

**4.3. Add `pnpm test:fast` (Phase 1 storyline tests only) and `pnpm test:full`.**
A two-tier test command — useful in pre-commit hooks.

### Phase 5 — Close the truth-telling gap with coverage + contract tests

**5.1. Wire `vitest run --coverage` and add a CI gate.**
The repo has `.github/` — check whether a workflow already runs `pnpm test`. Add `--coverage` and report to summary. Start with no enforced threshold; once it's visible, set the floor at the current level so it can only go up.

**5.2. Add a contract test against `EVENT_TYPES`.**
A test that imports `EVENT_TYPES` from `db/schema.ts`, walks every storyline's events, and asserts every event type is in the constant. The seed scripts already type-check this at compile time, but a runtime test catches the case where the dataset and schema drift.

**5.3. Add a contract test against jurisdictions.**
For every storyline pet, assert that `jurisdiction_province` / `jurisdiction_locality` exist in the imported INDEC dataset (the CSV in `scripts/__fixtures__/indec-localidades-sample.csv` is the right starting point, or the full import). This catches storyline data referencing places that don't resolve.

### Phase 6 — Round out the dataset itself

The dataset is rich but has visible gaps relative to its own ambitions. From the stressor list and the schema:

- **Status diversity in `supporting`**: all 14 supporting pets are `status: "active"` — no deaths, no losses, no disputes. That batch was built as a "filler crowd," which is useful, but adding 2–3 currently-lost pets and 1–2 in-dispute would let it stand in for steady-state queue depth.
- **PPP / dangerous-breed**: only 2 pets in `dangerous`. The schema almost certainly cares about more PPP flows than that exercises (revocations, licensing, bite reports of varying severity). Worth at least one dangerous-breed pet with a clean record (to test "PPP flag set, no incidents") and one with an escalation pattern.
- **Non-dog species**: Tom is a cat; Puss is a cat. No rabbits, ferrets, guinea pigs, or `other`, even though the schema's `Species` union includes all five. Adding one of each gives the species-resolver tests a real fixture target.
- **Foreign-jurisdiction reentry** is in the stressor list (Puss to Far Far Away) — but the test for it (`cross-org-transfer.test.ts`) doesn't reference Puss. Either rewrite the test against the storyline (Phase 1.3) or note in the matrix that the stressor is currently uncovered.

These are dataset additions, not rewrites — the batches as designed are coherent, and adding a fifth small batch (`seed-storylines-coverage-fillers.ts`) keeps that coherence intact.

## Suggested deliverable order (concrete commits)

1. `__tests__/fixtures/types.ts` — lift shared types out of `seed-storylines-iconic.ts`.
2. `__tests__/fixtures/index.ts` + per-pet imports.
3. `__tests__/helpers/seed-storyline.ts` — the `seedStoryline(db, story)` function.
4. Rewrite `return-to-owner.test.ts` against the helpers. **Measure LOC delta.** Decide whether to continue or rethink.
5. `__tests__/factories/{user,org,pet,event}.ts` + migrate the 3 files with local helpers.
6. `__tests__/helpers/with-tx.ts` and start porting tests onto it.
7. Coverage matrix script + filled-in `## Quick stats` sections.
8. CI coverage gate.
9. Contract tests against `EVENT_TYPES` and jurisdictions.
10. Dataset gap-fillers (species, lost supporting pets, PPP variants).

Each of these is independently shippable, so the work can pause at any point and still leave the suite better than it was.

## What works well today (worth preserving)

- **The narrative docs are excellent.** `test-storylines.md` and `test-storylines-iconic.md` read like proper fiction — they will keep institutional knowledge alive when this project sits idle again. Don't reduce them to data files; let them stay narrative and let code reference the canonical IDs they assign.
- **The `EventType` compile-time check in the seed scripts** is exactly the right pattern and the rest of the dataset should keep that discipline.
- **Owner pinning by author role** (Lilian / Lucas / Alejo / Ignacio / Noelí / Graciela) gives the suite stable, named human actors. Don't dissolve them into anonymous UUIDs.
- **The CSV fixture pattern** (`scripts/__fixtures__/indec-localidades-sample.csv` used by `import-indec-localities.test.ts`) is the one place test ↔ fixture is wired correctly. That's the template to copy.

## Stop-energy items (things not to do)

- **Don't rewrite all 85 tests at once.** Phase 1.3 proves the pattern on five files first. If `seedStoryline` doesn't pay for itself in LOC reduction and clarity, the helper API is wrong and needs another pass before any large migration.
- **Don't try to make every test storyline-based.** Schema/unit tests for validators, parsers, and resolvers (`business-rules-validators`, `species-resolver`, `dni-verification`, `geocoding`) are correctly synthetic. Storylines are for workflow tests.
- **Don't delete the seed scripts and inline everything in tests.** The seed scripts have a separate purpose — populating a dev DB for the UI / demos. Keep them as the canonical authoring location; the test helpers should read from them, not duplicate them.

---

*Author: Claude. Generated 2026-05-20 from a static audit of `__tests__/`, `scripts/seed-storylines-*`, and `docs/test-storylines*.md`.*
