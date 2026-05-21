# Action plan — Claude Code execution

**Date:** 2026-05-20
**Owner:** Ignacio
**Focus this cycle:** working-tree recovery → security & DB hygiene (§2 and §3 of `docs/project-review-2026-05-19.md`) → formalized conventions in lint + tests
**Branching:** feature branches from `develop`, conventional commits (`feat(scope): …` / `fix(scope): …` / etc.), one PR per logical chunk, reference GitHub issue `#N` in PR title when applicable.
**Reading order for Claude Code on first run:** `AGENTS.md` → `docs/project-review-2026-05-19.md` → this file → spec for the specific phase being executed.

---

## Phase 0 — Recover the working tree (do this once, do nothing else first)

**Why:** the current working tree at `C:\Users\ignac\DIM\DIM` is corrupted (116 files truncated vs HEAD, `.git/index` unreadable, 28k TypeScript errors). The cause is almost certainly cloud sync. No fix to any file is durable until the repo lives somewhere sync can't reach.

**Steps (you run these by hand, not Claude Code):**

1. In Windows: pause / quit OneDrive (or Dropbox / iCloud — whatever's running). Don't just exclude the folder; stop the process.
2. Open PowerShell, NOT inside the synced folder:
   ```powershell
   mkdir C:\dev
   cd C:\dev
   git clone https://github.com/ignaciodelvalle/dim.git
   cd dim
   git checkout develop          # or main, whichever you build off
   ```
3. Copy over any **uncommitted** local work you want to keep. The realistic list, given what I saw on disk that's not on `HEAD`:
   - `lib/form-classes.ts` (you wrote this, it's not on the remote yet) — copy from the corrupted tree
   - `docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md` (47KB)
   - `docs/superpowers/plans/2026-05-20-adoption-templates-alignment.md`
   - `docs/superpowers/plans/2026-05-19-adoption-handshake.md`
   - `docs/project-review-2026-05-19.md` (the review I wrote)
   - `docs/action-plan-2026-05-20.md` (this file)
   - Anything else under `docs/superpowers/specs/` dated 2026-05-19 or later that isn't in the clone
   - Anything under `app/(app)/inicio/_components/` — looked freshly worked-on
4. From inside the fresh clone:
   ```powershell
   pnpm install
   pnpm typecheck      # should be 0 errors, or only errors from the new files you copied in
   pnpm test
   pnpm db:start       # Docker must be running
   pnpm db:push
   pnpm dev            # smoke-test the dev server at localhost:3000
   ```
5. Once that's clean, commit the salvaged files as `chore: salvage uncommitted local work` on a recovery branch, push, open a PR to `develop`. From here forward, work only in `C:\dev\dim`.

**Acceptance:** `pnpm typecheck` reports 0 errors, `pnpm test` is green, `git status` is clean and works without "unknown index entry format" errors.

**Do not move on to any other phase until this is done.**

---

## Phase 1 — Convention scaffolding (small PR, ~2 hours)

**Branch:** `chore/contributor-scaffolding`
**Goal:** make the repo legible for shared development, set the rails for everything Claude Code does after this.
**Suggested skill:** `doc-coauthoring` for the prose-heavy files (CONTRIBUTING.md, PR template); it'll keep the tone consistent.

### 1.1 `CONTRIBUTING.md` at repo root

Sections:

- Quickstart (`pnpm install && pnpm db:start && pnpm db:push && pnpm seed:test && pnpm dev`)
- Reading order for new contributors (point at `AGENTS.md`, then `docs/superpowers/README.md`)
- Branching model (`main` = released, `develop` = integration, feature branches off `develop`)
- Commit convention: conventional commits with the existing scopes (`auth`, `cases`, `events`, `org`, `admin`, `welfare`, `foster`, `adoption`, `db`, `docs`, `infra`)
- Pre-PR checklist: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- How to write an event (one-line link to the event design checklist from Phase 4.3)
- Spec-first culture: any new event type or table change → a doc under `docs/superpowers/specs/` *before* code

### 1.2 `.github/PULL_REQUEST_TEMPLATE.md`

Five questions, kept short:
- What does this change, in one sentence?
- Which event types, cases, or tables does it touch?
- New or modified RLS policies — list them
- New tests, and what they cover
- Linked spec under `docs/superpowers/`?

### 1.3 `.github/ISSUE_TEMPLATE/`

Two templates: `bug_report.yml`, `feature_request.yml`. The feature template asks "is there a spec under `docs/superpowers/` for this? if not, draft one first".

### 1.4 `CODEOWNERS` at repo root

Initial content:

```
*                       @ignaciodelvalle
/db/                    @ignaciodelvalle
/app/admin/             @ignaciodelvalle
/docs/superpowers/      @ignaciodelvalle
```

When you add collaborators, route domains to them by appending lines.

### 1.5 Update `.github/workflows/ci.yml`

Add a `test` step:

```yaml
- name: Test (vitest)
  run: pnpm test
```

Also add a `db-check` job that spins up Postgres in services, runs `pnpm db:push`, and confirms `drizzle-kit` reports zero pending changes. This catches schema-vs-migration drift in CI.

### 1.6 Branch protection (manual, you do this in GitHub UI)

- Settings → Branches → add rule for `main` and `develop`
- Require PR review
- Require status checks: `Lint, typecheck, build` (rename to `check` after Phase 1.5 if needed) and the new `test` job
- Require linear history
- Restrict who can push to these branches

**Acceptance:** CI passes on the PR. Branch protection visible in repo settings.

---

## Phase 2 — Security batch (one branch per finding, ~1 week)

**Branch prefix:** `fix/sec-`
**Source of truth:** `docs/project-review-2026-05-19.md` §2.
**Each item below = one PR.** Order matters; do them in this sequence.

### 2.1 Gate the stub-profile claim (`fix(auth): gate stub-profile claim until mi-argentina lands`)

**File:** `app/actions/claim.ts`
**Spec:** the new adoption handshake plan already notes `STUB_CLAIM_ENABLED = false`; formalize that.

- Add a module-level constant `STUB_CLAIM_ENABLED = false`.
- At the top of `claimStubProfileAction`, return early with a friendly error if the flag is off.
- Keep the function and its tests in place — when Mi Argentina lands, flipping the flag re-enables it.
- Add a test that the action returns the friendly error and does not touch the DB while the flag is off.
- Add a UI surface: the page that currently calls this action should render an "estamos integrando con Mi Argentina, recuperá tu cuenta contactándonos" message instead of the claim form when the flag is off.

**Acceptance:** new test green, manual smoke test confirms the claim form is hidden.

### 2.2 Move notifications out of transactions (`fix(notifications): defer inserts until after tx commit`)

**Files:** `app/actions/cross-org-transfer.ts`, `app/actions/foster-proposals.ts`, `app/actions/foster-volunteers.ts`, `app/actions/adoption-applications.ts`, and any other action with an `await tx.insert(notifications)` inside `db.transaction`.

The fix has two viable shapes; pick one and apply consistently:

**Shape A (cheap, recommended for v1):** inside the transaction, return the notification rows you would have inserted. After the transaction commits, do the insert via `db.insert(notifications)` (no `tx`). On insert failure, log + alert but don't fail the action — the user's intent already succeeded.

**Shape B (proper, more code):** add a `pending_notifications` table written inside the transaction. A short-interval worker (or post-commit hook via `revalidatePath` trigger pattern) drains it.

Apply Shape A first; revisit Shape B if you ever miss a notification visibly in production.

**Acceptance:** add a test for one of the action files that simulates a notification-insert failure and confirms the core mutation persists. Existing tests still green.

### 2.3 Restrict libreta-share revocation (`fix(libreta): restrict share revocation to creator + admin`)

**File:** `app/actions/libreta-share.ts:73-101`

- Remove the "current owner of the pet can also revoke" path.
- Keep: original creator can revoke. Add: platform admin (`role='admin'`) can revoke. That's it.
- Update the spec note in `AGENTS.md` if it documents the old behavior.
- Update or add a test asserting that a new owner of the pet cannot revoke a share created by a previous owner.

**Acceptance:** test green, UI no longer shows "revocar" on shares the current user didn't create.

### 2.4 Sanitize redirect parameter in DNI verify (`fix(auth): tighten next-url validation in dni-verification`)

**File:** `app/actions/dni-verification.ts:125-131`

Replace the `includes`-based check with explicit URL parsing:

```ts
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/cuenta";
  try {
    // Parse against a dummy base; if the parsed `origin` is anything other
    // than the base, it's a cross-origin redirect and we reject.
    const base = "http://internal.local";
    const url = new URL(raw, base);
    if (url.origin !== base) return "/cuenta";
    return url.pathname + url.search;
  } catch {
    return "/cuenta";
  }
}
```

Add a unit test for `sanitizeNext` covering: empty, `/foo`, `//attacker.com`, `/\\attacker.com`, `http://attacker.com`, `/foo?x=1`.

**Acceptance:** new unit test green.

### 2.5 Cross-org-transfer receiver re-derivation (`fix(cases): re-derive cross-org transfer receiver from case row`)

**File:** `app/actions/cross-org-transfer.ts:299`

- In `acceptCrossOrgTransferAction`, do not trust `proposalPayload.to_organization_id`. Instead, find the most recent open `custody_transfer_proposed` event for the case and use its trusted server-side fields (or query the `cases` table's `receiver_organization_id` if you have one).
- Add a test that asserts: a proposal whose payload has a forged `to_organization_id` cannot be accepted by the org named in the payload if it's not the actual receiver according to the case.

**Acceptance:** new test green.

### 2.6 Tighten public-token generator (`fix(tokens): add collision retry + fix modulo bias`)

**File:** `lib/publicToken.ts`

- Fix modulo bias: use rejection sampling. Drop bytes ≥ 248 (largest multiple of 31 below 256) before `% 31`.
- Add a generator wrapper `generateUniqueToken(table, column, generator)` that retries up to 5 times if `INSERT` fails on unique constraint. Use it from every callsite that inserts a row with one of these tokens.
- Add a test that exercises the retry path with a mocked `db` that throws unique-constraint once then succeeds.

**Acceptance:** new test green, no functional change at low volume.

---

## Phase 3 — DB schema & RLS hygiene (one branch, ~3 days)

**Branch:** `feat/db-fk-and-index-hygiene`
**Migration:** `db/migrations/0039_fk_index_hygiene.sql` (single migration covering 3.1 and 3.2)

### 3.1 Add `ON DELETE` clauses where they're missing

**Source list:** review §3.1. About 42 FKs; most should be `set null` (audit fields), a handful are product decisions.

For Claude Code: read every `references()` call in `db/schema.ts`. If `onDelete` is missing:
- Audit/decision fields (`*ByUserId`, `*AtUserId`, `decidedByUserId`, etc.) → `onDelete: "set null"` and make the column nullable if it isn't already
- Children that don't make sense without their parent (e.g., `petEvents.petId`) → `onDelete: "cascade"` (most are already correct)
- The grey zone — `adoptionApplications.resolvedOwnershipId`, etc. — ask before deciding. Default to `set null` if no strong product reason.

Mirror every Drizzle change in the migration SQL file.

### 3.2 Add missing FK indexes

Per review §3.2, add indexes on:

```
auditLog.approvalRequestId
auditLog.targetUserId
auditLog.targetOrganizationId
auditLog.targetGovtAssignmentId
adoptionApplications.proposedByUserId
adoptionApplications.cancelledByUserId
adoptionApplications.resolvedOwnershipId
approvalRequests.initiatedByUserId
approvalRequests.decidedByUserId
pets.adoptionEligibilitySetByUserId
govtAssignments.grantedByUserId
govtAssignments.revokedByUserId
custodyDisputes.revokedByUserId
```

(There are more — sweep `schema.ts` for any FK without a corresponding `index(...)`.)

### 3.3 Mirror migration CHECK constraints into Drizzle

**File:** `db/schema.ts`, table `pets`
**Source:** `db/migrations/0023_pets_adoption_eligibility.sql`

- Mark `adoptionEligibilitySetAt` as `.notNull()` if every row has it (migration says yes).
- Add `.check()` calls expressing the four constraints from 0023 (eligibility-requires-set-at, ineligible-requires-reason, other-requires-notes, etc.).
- Run `pnpm db:push --dry-run` to confirm zero drift.

### 3.4 Audit-log the event-mutation escape hatch

**File:** `db/triggers.sql`
- When `app.allow_event_mutation` is set and an UPDATE or DELETE fires on `pet_events`, write a row to `audit_log` capturing the actor, old payload, and new payload (or DELETE marker).
- Add a unit test that runs `SET LOCAL app.allow_event_mutation = 'true'; UPDATE pet_events …` and asserts an audit row appeared.

### 3.5 Make projection rebuild atomic per pet

**File:** `scripts/rebuild-projections.ts`
- Wrap the read-events / compute / update-pet sequence in a per-pet advisory lock:
  ```ts
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${petId}))`);
  ```
- Move the entire per-pet sequence inside one `db.transaction(...)`.
- Add a comment explaining why.

**Acceptance for whole phase:** migration applies cleanly on a fresh `pnpm db:reset`, `pnpm test` green, `pnpm rls:smoke` green.

---

## Phase 4 — Convention enforcement (one branch, ~1 day)

**Branch:** `chore/enforce-conventions`
**Goal:** make it mechanically hard to forget the patterns we just established.

### 4.1 Server-action auth-call enforcement

The cheapest reliable form is a unit test, not a Biome rule:

- New file: `__tests__/server-actions-auth-coverage.test.ts`
- Glob every `.ts` in `app/actions/`
- For each file, parse it (use `typescript` to read the AST, or a regex for "exports an async function whose body contains `requireUser`/`requireCapability`/`requireOrgAccess`/`requireAlivePetAccess`/`requirePetAccess`/`requireVetProviderOrRedirect`")
- Fail with a clear message listing any exported `async function` that doesn't call one of those guards
- Allow opt-out by a magic comment `// @no-auth-required` on the export, for genuinely public actions (there should be very few — public scan logging, maybe)

### 4.2 RLS smoke widening

`scripts/rls-smoke.ts` already exists. Widen it to cover, for each major table, four cases: anon read, anon write, wrong-org read, wrong-org write. Add a CI step that runs it against a freshly-reset DB.

### 4.3 `docs/event-design-checklist.md`

Short doc (one page) with the questions every new event type should answer:

- Which cross-cutting pattern (started/ended, signal, proposed/executed, umbrella)?
- Status column on which entity?
- Auto-close cron, idempotency strategy?
- Payload Zod schema, with `schemaVersion`?
- Libreta or non-libreta?
- Which projections / dashboard queries does it feed?
- Tests covering: write happy path, write rejection paths, projection drift detection

Add a link to it from `CONTRIBUTING.md` and the PR template.

### 4.4 Event payload versioning

Touch `lib/event-schemas.ts` (or wherever the Zod registry lives):

- Add a required `schemaVersion: z.literal(1)` field to every existing event payload schema. Migration: backfill `schemaVersion = 1` on existing `pet_events.payload` rows in a single SQL statement, gated by the GUC from 3.4 with an audit-log row.
- Document the upgrade path (v1 → v2 = write a transformer, not a rewrite).

**Acceptance:** all four sub-tasks green, new CI step running rls-smoke, CONTRIBUTING.md links to the checklist.

---

## Skill recommendations (soft)

- **`doc-coauthoring`** — for Phase 1.1, 1.2, 1.3, 4.3 (CONTRIBUTING.md, PR template, issue templates, event-design checklist). Keeps voice consistent and gets the doc structure right on the first pass.
- **`design:design-handoff`** — *later*, when Claude Code is ready to start the adoption-handshake UI work (Phase 5 of the unified plan). Useful for codifying the 28-question wizard's component contract.
- **`finance:audit-support` / `finance:sox-testing`** — not directly applicable, but skim the "control testing" structure if you ever need to model "every server action has an auth check" as a formal control with sampled evidence.
- **`skill-creator`** — if you find yourself wanting a "MiMAR event-design" skill that automates the questions in §4.3 above, that's the tool that builds it.

For the bulk of the Phase 2 and Phase 3 work, no skill is needed — it's straightforward code that Claude Code handles directly.

---

## What's deliberately *not* in this plan

- **Adoption handshake execution.** Your unified plan (`docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md`) is the source of truth for that. Once Phases 1-3 here are done, that plan picks up. The two interact at exactly one point: Phase 2.1 (stub claim gating) is a prerequisite for the handshake's "no stubs, applicant must be authenticated DIM user" decision (D1 in the unified plan).
- **Refugio→org rename.** Documented, planned, not blocking; bundle it into a single PR after Phase 3.
- **UI consistency push** (capability-request UX, case stepper, owner-side IA cleanup). Worthwhile but lower stakes than security/DB. Slot after Phase 4.
- **Projection-as-API layer.** Bigger architecture move; do after the security/DB foundation is solid.

---

## How Claude Code should pick this up

Open Claude Code, point it at `C:\dev\dim` after Phase 0. The first prompt is literally:

> Read AGENTS.md, then docs/project-review-2026-05-19.md, then docs/action-plan-2026-05-20.md. We're starting at Phase 1. Open a PR for it against develop. Commit messages should follow conventional-commits like the existing history.

After Phase 1 merges, the next prompt is the same template with `Phase 2.1` (then `2.2`, etc.). One phase, one PR, one review cycle, repeat.

---

## Addendum — 2026-05-20 afternoon session

> **Update 2026-05-21:** Findings 1 and 2 below are RESOLVED. `C:\dev\dim/db/schema.ts` is now fully restored (2505 lines; `cases` table defined at L2398-2502, exports `Case` and `NewCase` at L2504-2505). The "stricter Phase 0 acceptance" checklist no longer applies — the tree migration completed cleanly. Treat this addendum as historical context, not active direction. The component-level notes (EventCatcher, CasesWidget, lost-mode cockpit, denuncia wizard) ARE still relevant — those landed as preview routes and are tracked in `docs/superpowers/plans/2026-05-21-consolidated-cc-plan.md`.

Notes from a follow-up Cowork session that drilled into the `/gob` portal redesign. Two findings + three new component files. Read this before starting Phase 0 because it changes Phase 0's acceptance criteria.

### Finding 1 — `C:\dev\dim` is damaged too, not only `C:\Users\ignac\DIM\DIM`

The Phase 0 premise was "the working tree at `C:\Users\ignac\DIM\DIM` is corrupted; the clean tree lives at `C:\dev\dim`." That premise is **partially wrong**. Spot-checks on `C:\dev\dim` find:

- `db/schema.ts` ends mid-statement at line 2220, last visible token `partyOrganizationI` (no closing quote, paren, or brace). Anything past `custodyDisputeParties` is missing — including the `cases` table definition that Drizzle should expose.
- `lib/case-kinds.ts` ends mid-string at `case "ou` — the `outbreak_investigation` label is cut.
- `.git/packed-refs` ends mid-line at `refs/remotes/or` — `git log`, `git status`, `git fetch` all fail with `fatal: unterminated line in .git/packed-refs`.
- A coarse heuristic scan flags dozens of `app/actions/*.ts`, `app/(app)/*.tsx`, and `app/(auth)/*.tsx` files as not ending in a valid TS closing token. Null bytes are present in some TS sources.

Conclusion: the corruption pattern (mid-line truncation, null bytes, packed-refs damage) is the same one diagnosed in the original `DIM\DIM` tree. Either the clone-to-`C:\dev\dim` step was never completed cleanly, or the sync issue followed to `C:\dev`.

**Action**: re-do Phase 0 with stricter acceptance, ideally onto a path that no cloud service touches. Updated checklist for Phase 0:

1. Disable any sync agent (OneDrive, Dropbox, iCloud, GoodSync, etc.) **process-level**, not folder-exclude.
2. Pick a clearly unsynced root. `C:\src\` is conventional; `C:\dev` may also be fine if no agent watches it. Confirm with `Get-Process onedrive` / your sync agent's tray.
3. `git clone https://github.com/ignaciodelvalle/dim.git` fresh into the chosen root.
4. Run the integrity check before declaring Phase 0 done:
   ```powershell
   # No truncation: schema.ts should end with `}));` or similar
   Get-Content db\schema.ts -Tail 3
   # Cases table must be Drizzle-exposed (a non-empty line is enough)
   Select-String "export const cases" db\schema.ts
   # Git must work
   git log --oneline -5
   git fsck
   # No null bytes anywhere in source
   Get-ChildItem -Recurse -Include *.ts,*.tsx -Path .\app,.\lib,.\components,.\db |
     ForEach-Object { if ((Get-Content $_ -Raw -Encoding Byte) -contains 0) { $_.FullName } }
   ```
   That last command should print nothing.

### Finding 2 — the `cases` table mystery is resolved

The mystery: `lib/case-queries.ts` and `lib/case-helpers.ts` import `{ cases, type Case, type NewCase }` from `@/db`, but those names do not appear in the current `db/schema.ts`.

Resolution: the table is real and lives in the database — created by `db/migrations/0033_cases.sql` (with RLS expansion in `0034_cases_rls_expanded.sql`). The Drizzle TS definition for it was once present in `db/schema.ts` but is gone now, because `schema.ts` is one of the files truncated by the issue in Finding 1.

**Action**: after Phase 0 produces a clean tree, verify `db/schema.ts` contains an `export const cases = pgTable("cases", …)` block after `custodyDisputeParties`. If `git checkout develop` doesn't restore it, regenerate from the live DB with `pnpm drizzle-kit pull`. Either way, this is **not new schema work** — it's purely restoring what was lost.

### `/inicio` owner home plan + EventCatcher

Companion plan: [`docs/owner-home-plan-2026-05-20.md`](./owner-home-plan-2026-05-20.md). It reverses the old "punt the textarea to /anotar" call and pulls the event catcher onto the home itself. Two new files in this pass:

| File | Role | Imports `@/db`? |
|---|---|---|
| `components/EventCatcher.tsx` | Client component. Pet chip row (72px avatars) + textarea + quick-action chips + Poncho `success` submit. Tap-once selects, tap-twice (or long-press) opens pet profile. Ctrl/⌘ + Enter shortcut. Routes to `/mis-mascotas/{token}/anotar?text=…` or `?kind=…`. | No |
| `components/CasesWidget.tsx` | Server component. Owner-visible "Mis casos" list — maps from the existing `WorkflowItem[]` shape, no new query. | No |
| `app/(app)/inicio-v2/page.tsx` | Preview route. Header → EventCatcher → CasesWidget → próximos turnos. Hardcoded sample data. | No |

Migration once Phase 0 is clean: swap the body of `app/(app)/inicio/page.tsx` for the v2 structure, wire to `fetchPetsForOwner`, retire `QuickCaptureWidget`, and move displaced widgets (notifications → top-bar bell, workflows → `/cuenta/workflows`, medications → per-pet profile). The `/anotar` matcher needs to read `?text=` and `?kind=` query params on landing — that's the only thing that changes outside `/inicio` itself.

### Denuncia anónima — public intake redesign (plan only)

Companion plan: [`docs/denuncia-anonima-plan-2026-05-20.md`](./denuncia-anonima-plan-2026-05-20.md). **Plan only — no components yet**. The redesign converts the current single-page `WelfareReportForm.tsx` into a seven-step mobile-first wizard whose payload still hits the existing `createWelfareReportAction` server action and the existing `welfareReports` table. No schema change.

Key shape: steps 1–5 collect kind / severity / dónde-y-cuándo / subject / evidence; step 6 is the close screen with the explicit choice between **anónima** and **anónima + contacto** (the midway path that converts more denuncias into actionable cases); step 7 is the reference-code receipt. `/denuncias/codigo/[code]` follow-up is refreshed alongside.

Why anónima first, vinculante later: anónima is the volume path, the moderation queue exists to handle its spam risk, and it has zero dependency on the security work in Phase 2.1 (`claimStubProfileAction` gating). Vinculante extends the same wizard with an identity step after Phase 2 lands. Detailed in the plan.

Components proposed (build follows in the next session): `DenunciaWizardShell` + 7 step components + `DenunciaFollowUpStatus`, all under `components/denuncia/`.

### Modo perdido — owner cockpit + public lost view

Companion plan: [`docs/lost-mode-plan-2026-05-20.md`](./lost-mode-plan-2026-05-20.md). The activation form, server actions, case lifecycle, public credential, and scan logger all already ship; this pass adds the **active-state owner cockpit** and the **lost-mode public layout**, both presentation-only.

Six new components under `components/pet-profile/`, two preview routes:

| File | Role |
|---|---|
| `LostModeBanner.tsx` | Red top-of-page strip with photo, "Roma está perdida — hace 3 h 42 min", case ref, "Marcar encontrada" button. |
| `LostShareCard.tsx` | Client. WhatsApp / Twitter / Facebook / Afiche + copy-link. `navigator.share` fallback. |
| `LostLastSeenCard.tsx` | Static map preview + place + locality + owner note + edit + add-sighting. |
| `LostDisclosureCard.tsx` | Five toggle rows mapped 1:1 to `pets.disclose_*_when_lost`. Server-action forms. |
| `LostScanFeed.tsx` | Counts + unified scan-and-finder-message feed. |
| `LostPublicCredential.tsx` | The view a stranger sees at `/p/{token}` when the pet is lost. |
| `app/(app)/mis-mascotas/[publicToken]/perdida-v2/page.tsx` | Owner cockpit preview. |
| `app/p/[publicToken]/v2/page.tsx` | Public lost view preview. |

State-color alignment carries through: `state: "urgent"` + `stateLabel: "Perdida"` in the chip row on the home, red ring + bottom badge on the hero, red banner at the top of the cockpit. One coordinated signal across three surfaces.

Open decisions captured in the plan: where finder messages live (event type vs. sibling table), append-only sightings vs. pin updates, day-150 confirmation before cron auto-close, poster generator choice, phone format, and the activation-form rule that at least one contact channel must stay on.

### Pet profile (owner view) plan + components

Companion plan: [`docs/pet-profile-owner-plan-2026-05-20.md`](./pet-profile-owner-plan-2026-05-20.md). Same pattern as `/inicio` and `/gob`: a tidy redesign of the most-used view, additive only, behind a preview route while Phase 0 is pending.

Eight new files added under `components/pet-profile/`, none import `@/db`:

| File | Role |
|---|---|
| `PetProfileHero.tsx` | Hero with 148px photo ring (state color), name/meta line, primary actions row. |
| `PetEmergencyCard.tsx` | Vet + emergency contact (tel: links) + medical alerts. |
| `PetHealthTimeline.tsx` | Client component. Filter chips + recent events. |
| `PetWeightChart.tsx` | SVG sparkline from `WeightSample[]`. No chart lib. |
| `PetVaccineReminders.tsx` | Overdue + upcoming vaccines with "Agendar". |
| `PetTrackingPlaceholder.tsx` | "Conectar dispositivo" CTA. |
| `PetCredentialCard.tsx` | QR + token + link to `/p/{token}`. |
| `PetTravelDocs.tsx` | Pasaporte + certificado internacional. |

Preview route: `app/(app)/mis-mascotas/[publicToken]/v2/page.tsx`. Same `requirePetAccess` guard as the live profile, all sample data inline. Once Phase 0 is clean, swap sample blocks for the live queries section-by-section (most already exist in `lib/owner-dashboard.ts` and the live profile page).

The role-split intent is explicit: hero stays invariant across owner / vet / shelter / govt; sections below the hero change. Owner is shipped here; vet, shelter, govt follow as their own plans.

### `/gob` dashboard plan + Phase 1 starter components

Companion plan: [`docs/gob-dashboard-plan-2026-05-20.md`](./gob-dashboard-plan-2026-05-20.md). It maps the desktop-mockup vision for the government portal to what already ships, names gaps, and sequences six phases. It sits at Tier 5+ in the unapplied-specs audit — nothing in it is durable until at least Tiers 0–2 (Phase 0 here, security batch, DB hygiene) land.

Three new component files were added in the follow-up session. They are **additive only** — no edits to existing files, no imports from `@/db`, so they compile regardless of the schema truncation in Finding 1.

| File | Role | Imports `@/db`? |
|---|---|---|
| `components/KpiTile.tsx` | Metric tile + `KpiTileGrid` container. Variants: plain, target bar, delta arrow. Tones: neutral / info / success / warning / danger. | No |
| `components/JurisdictionFilterBar.tsx` | Client component. Time-range chips + provincia / localidad / tipo dropdowns. URL search params as state (matches `/gob/vigilancia` pattern). Exports `readFilterParams()` server helper. | No |
| `components/GobDashboardShell.tsx` | Three-zone layout (header + filters + kpi strip + main/aside). Pure prop-driven. Exports a small `DashboardCard` companion. | No |

A preview page is wired up at `app/gob/dashboard-v2/page.tsx`. It uses the same `requireAdminOrGovtOrRedirect` guard as `/gob`, composes the three new components with **hardcoded sample data**, and links out to existing routes (`/gob/cola`, `/gob/maltrato`, etc.). The map zone is a placeholder until Phase 2 (MapLibre), and the casos kanban references `listCasesForGovt()` but is stubbed because of the schema gap in Finding 2.

Once Phase 0 is re-done and Finding 2's restoration confirmed, the wiring is straightforward:

1. Replace `SAMPLE_KPIS` in `app/gob/dashboard-v2/page.tsx` with real queries — most are already in `lib/govt-dashboards.ts` (`fetchSurveillanceSignals`, `fetchDiseaseSummary`). Population-rate KPIs (vaccination coverage %, bites / 10k hab.) wait for Phase 3 of the gob-dashboard plan.
2. Replace the map placeholder with the `ChoroplethMap` component (Phase 2 of the gob-dashboard plan).
3. Replace the casos card stub with a kanban driven by `listCasesForGovt()`.
4. When the preview reaches parity, retire `app/gob/dashboard-v2/page.tsx` by moving its body into `app/gob/page.tsx`.

### Order of operations for the next Claude Code session

1. **Phase 0 redux** with the stricter checklist above. Acceptance: `db/schema.ts` ends cleanly + `cases` table is exported + `git log` works + zero null bytes in `app/`, `lib/`, `components/`, `db/`.
2. **Finding 2 confirmation**: verify `cases` table is back in `schema.ts`. If not, `pnpm drizzle-kit pull`.
3. **Sanity build**: `pnpm typecheck && pnpm test`. The three new components must compile clean. The dashboard-v2 preview route must serve.
4. From here, the existing action plan resumes at Phase 1 (Convention scaffolding). The `/gob` dashboard plan slots in as a parallel track once Tier 2 security work lands.
