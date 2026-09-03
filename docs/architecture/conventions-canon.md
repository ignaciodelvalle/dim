# Conventions canon

> Snapshot: `d7dbf25f7` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-03
> Verified against code on 2026-09-03 by canon v4 + blind calibration · Status: reviewed
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

Every convention this repository states about itself, with the answer to the only
question that matters about a convention: **what fails when you break it?**

## How this canon was built
The rows were harvested from the prose the project already writes about itself:
`AGENTS.md`, `CLAUDE.md`, the fence headers under `scripts/`, the `docs/agents/`
briefs, `docs/architecture/`, `e2e/README.md`, `CONTRIBUTING.md`, and the comment
blocks at the top of the tests. Anything stated as a rule became a candidate row.
Four stages turned candidates into verdicts:

1. **Extraction** — every rule-shaped sentence became a row with its source quote,
   its scope, and whatever enforcer the text itself pointed at. Near-duplicates were
   merged only when one row's requirement was fully contained in another's.

2. **Refutation** — each row's cited enforcer was OPENED and read. The question is
   never "does a fence with a matching name exist" but "can this predicate FAIL on a
   violation of this rule, over this rule's own files". Rows whose enforcer turned out
   to be a configuration line, a vacuous assertion, or a corpus that excludes the
   rule's own subject were demoted here.

3. **Judgment** — a blind reader re-derived a stratified sample of rows from the
   enforcer alone, without seeing the previous verdict. Bands whose residual error
   exceeded 1 in 6 were sent back whole.

4. **Band re-refutation** — the ENFORCED and PARTIAL bands were re-derived row by row
   under the rulebook below, drafting a verdict before reading the previous basis and
   reconciling only against evidence actually opened.

**Calibration.** A final blind pass re-derived 18 sampled rows
(6 per status band) and disagreed on
1 of 18.
The single dissent is `CANON-479`: this canon says **UNENFORCED**, the blind reader said **PARTIAL (adoption-unfenced)**. v4's verdict kept; the dissent is recorded on the row and produced the adoption convention above.

**The JSON is the source of truth.** `docs/architecture/conventions-canon.json`
carries every field; this file and its per-scope pages are a rendered view produced
by `pnpm canon:render` (`scripts/conventions-canon-render.ts`) and pinned to the JSON
by `__tests__/conventions-canon-parity.test.ts` — one table row per JSON row, same
status, same enforcer set. Hand-editing the markdown turns that fence red. Fix the
JSON and re-render instead.

**What a verdict is not.** `ENFORCED` means something in the tree fails when the rule
is broken. It does not mean the rule is a good rule, that its wording is current, or
that the enforcer covers the rule's intent beyond its literal predicate. `UNENFORCED`
means nothing fails — the rule may still be true today and may still be worth keeping.

## Status rulebook

How a row earned its verdict, in the order the rules apply:

- **R1** — Open the enforcer. It counts only if its predicate checks THIS rule's subject and predicate over THIS rule's scope; the deciding line is named in the basis.
- **R2** — Configuration is not an enforcer. A workflow trigger list, a timeout, a vercel.json/tsconfig/eas.json setting, a package.json script string — the declaration IS the mechanism and nothing fails when it is edited, so the rule is UNENFORCED. Exceptions: a CI step whose own command exits non-zero on the condition, a biome rule at level error, and a TypeScript type that makes the violation uncompilable.
- **R3** — Vacuity. An enforcer that cannot fail is no enforcer: an empty allow-list, a floor where the rule states an exact value, an anchor on text the code no longer contains, a glob matching zero files, a corpus filter that excludes the rule's own subject files, or a value assertion where the rule needs an absence or a closed set.
- **R4** — Scope subset. The enforcer covers a named PART of the rule's scope (one config of two, web but not mobile) — PARTIAL with shape "subset", and the basis names the uncovered part by path.
- **R5** — Declared limit. The fence's own header says what it does not cover and that gap is inside the rule's scope — capped at PARTIAL with shape "declared-limit", citing the header line.
- **R6** — Ratchet vs absolute. If the rule TEXT says "no new" or "must not grow", a baseline ratchet ENFORCES it. If the rule is absolute and the baseline count is 0, the ratchet is at its strictest state and the rule holds — ENFORCED. If the rule is absolute and the baseline count is above 0, PARTIAL with shape "ratchet", naming the baseline file and its live count.
- **R7** — Adoption. A helper pinned by a real test whose callers are not forced through it: if the rule's predicate is the helper's BEHAVIOUR, PARTIAL with shape "adoption-unfenced"; if the rule's predicate IS adoption ("every route must use Y"), the helper's own test proves nothing about callers — UNENFORCED, unless a fence mandates the single door, which makes it ENFORCED (structural).
- **R8** — Wiring. `wired` names the command that actually reads the enforcer: `verify` (its lint:* key is in the verify string, or it is a biome error rule or a TS type), `test:verified` (vitest discovers the file, or a mobile jest file run inside verify), `db` (a live constraint, trigger or policy), `ci` (a workflow-only step), `manual` (reachable only through a key outside verify — PARTIAL with shape "manual-wiring"), or `none`.
- **R9** — Status. ENFORCED = a non-vacuous enforcer matching subject, predicate and scope, wired into verify, test:verified, db or ci. PARTIAL = R4, R5, R6 (ratchet above 0), R7 (behaviour) or R8 (manual wiring), always with a partialShape. UNENFORCED = nothing non-vacuous can fail. The basis states evidence; the verdict lives in `status`, never in the last sentence of the prose.
- **R10** — Numbers. When a rule carries a number, the enforcer's LIVE value wins over the doc; a differing doc figure is recorded in notes as `docSays`. A header census of past incidents is a note, never the number.
- **R11** — Database rows. A CHECK, trigger, policy, FK or NOT NULL declared in db/schema.ts or a migration is an enforcer (`wired: db`) on the declaration, with a note that it was not verified against the live catalog; a later migration that DROPs the object retires it.
- **R12** — A fence's NAME is not its subject. An enforcer whose name merely resembles the rule proves nothing — the deciding line must check the rule's own predicate.

Adoption convention (from the blind calibration on CANON-479): a tested helper whose adoption is not fenced counts as PARTIAL only when at least one production path is FORCED through it. Otherwise it is UNENFORCED — a helper nobody must call is not an enforcer of a rule about callers.

## Totals

<!-- fact:canon_rows -->513<!-- /fact --> rules, of which <!-- fact:canon_enforced -->175<!-- /fact --> are ENFORCED, <!-- fact:canon_partial -->93<!-- /fact --> PARTIAL and <!-- fact:canon_unenforced -->245<!-- /fact --> UNENFORCED.

| Scope | Rules | ENFORCED | PARTIAL | UNENFORCED | Page |
| --- | --- | --- | --- | --- | --- |
| Contract (`packages/contract`) | 22 | 7 | 5 | 10 | [`contract.md`](./conventions-canon/contract.md) |
| Database, RLS and the event spine | 97 | 47 | 22 | 28 | [`db.md`](./conventions-canon/db.md) |
| Documentation | 12 | 0 | 3 | 9 | [`docs.md`](./conventions-canon/docs.md) |
| End-to-end (Playwright) | 29 | 3 | 2 | 24 | [`e2e.md`](./conventions-canon/e2e.md) |
| Mobile (`apps/mobile`) | 35 | 11 | 4 | 20 | [`mobile.md`](./conventions-canon/mobile.md) |
| Process, CI and the gate chain | 151 | 19 | 19 | 113 | [`process.md`](./conventions-canon/process.md) |
| Web application | 167 | 88 | 38 | 41 | [`web.md`](./conventions-canon/web.md) |

## Recommendations

Rows that are a review's open proposal rather than a rule the tree follows.

### CANON-118

- **Proposal:** A floor pinned with `toBeGreaterThanOrEqual` (e.g. `MIN_V1_ROUTE_FILES`, `MIN_IP_BUCKETS`) should be converted to exact equality with a recount, the way the CGNAT ceiling's `toBe` already works, since a floor loosens in silence.
- **Source:** docs/agents/recommendations-2026-08-30.md:77-96
- **State on this tree:** The recommendation is NOT implemented in either file it names: check-api-v1-envelope.ts:246 MIN_V1_ROUTE_FILES = 33 is still used as a floor (`files.length < MIN_V1_ROUTE_FILES`, :340) and api-v1-rate-limit-families.test.ts:336 still asserts toBeGreaterThanOrEqual(MIN_IP_BUCKETS = 38), with :161-163 explicitly noting it is a floor while the CGNAT aggregate (:754) is a toBe.
- **Note:** This row is an open RECOMMENDATION (a review's proposal), not a rule the tree follows.

## Live violations

Rules whose text is FALSE on the tree at this snapshot — not merely unenforced.

### CANON-010

- **Rule:** The panorama QA nightly report-only scripts must never turn the run red on a finding; only the surrounding setup steps (bootstrap, seed, build, start) may fail the job.
- **Scope:** process
- **Status:** UNENFORCED
- **Evidence:** No enforcer, and the rule is FALSE on the live tree: scripts/qa-panorama-chaos.ts:848 exits `summary.passed ? 0 : 1`, and panorama-qa-nightly.yml:228-231 runs it with no `\|\| true` and no continue-on-error — a failed chaos round turns the nightly red.

### CANON-260

- **Rule:** `packages/contract` must have zero runtime dependencies and zero framework coupling — no `next`, `react`, `drizzle-orm`, `@/*` app aliases, nothing in `dependencies`, no `@/` app-alias import anywhere in the package, and no relative import escaping the package directory.
- **Scope:** contract
- **Status:** PARTIAL
- **Evidence:** Refuter verdict reused and re-verified: the rule's 'nothing in dependencies' clause is FALSE on the live tree — packages/contract/package.json:25-27 declares zod ^4.4.3, approved at check-contract-purity.ts:130-131. Rules 1-4 and 6 (no framework, no @/ alias, no escaping relative, no undeclared bare, no by-path import) ARE enforced.

## Contradictions

Places where two documents, or a document and the code, say different things.

### Event catalog: type count and declaration site

- **The doc says:** AGENTS.md:34 says the EVENT_TYPES const IS the count ('48 at last read') and names db/schema.ts as its home; AGENTS.md:684 repeats the db/schema.ts location.
- **The tree says:** 55 entries, declared at packages/contract/src/events/event-types.ts:20 and only re-exported by db/schema.ts:277,289 (which is what the fence imports). AGENTS.md:82 and :680 already say 'Event catalog — 55 types' elsewhere in the same file.
- **Evidence:** db/schema.ts:277,289; packages/contract/src/events/event-types.ts:20; __tests__/event-catalog-count.test.ts:26,36,43 (the fence pins 'Event catalog — N types' phrasing only, so AGENTS.md:34's '(48 at last read)' phrasing escapes it)

### Definition of Done: pnpm test vs pnpm test:verified

- **The doc says:** CONTRIBUTING.md:78,90 names plain `pnpm test` twice as the pre-PR gate and never mentions test:verified.
- **The tree says:** CLAUDE.md makes `pnpm verify` + `pnpm test:verified` the DoD and forbids `pnpm test` as evidence; ci.yml:893-905 runs test:verified.
- **Evidence:** CONTRIBUTING.md:78,90 vs .github/workflows/ci.yml:893-905

### Invariant #3 wording: 'no view is source of truth' vs the honest-hybrid cache rule

- **The doc says:** AGENTS.md:22 still reads 'Projections are first-class ... No view is source of truth.'
- **The tree says:** Superseded 2026-07-24: CLAUDE.md invariant #3 and AGENTS.md:146 both say operational caches ARE dual-written by design with declared boundaries; the old slogan still lives verbatim at AGENTS.md:22 at this SHA.
- **Evidence:** AGENTS.md:22 vs AGENTS.md:146 and CLAUDE.md invariant #3

### Application-fence exemption-list count and target

- **The doc says:** AGENTS.md:1580 says 'the goal is 0' exemptions; a separate header note in the fence cites a closed 2026-08-20 historical incident (46-vs-44) as the reason the ratchet exists.
- **The tree says:** 34 exemptions today, pinned by EQUALITY (not a floor heading toward 0) — scripts/application-fence-baseline.json:2 = {"exemptions":34}; check-application-fence.ts:36-39,308 fails any count other than exactly 34. Neither 46/44 nor the stated goal of 0 is the live number.
- **Evidence:** scripts/application-fence-baseline.json:2; scripts/check-application-fence.ts:36-39,308 (affects CANON-283)

### Commit-message language

- **The doc says:** CLAUDE.md invariant #4 groups docs (commit messages by omission) as English.
- **The tree says:** docs/agents/collaborating-writer.md:50-52 declares commit messages es-AR (decided 2026-08-29); the last 8 commit subjects on the live tree are all Spanish.
- **Evidence:** docs/agents/collaborating-writer.md:50-52; git log --oneline -8 (refuter-confirmed)

### CI <-> verify gate-set parity is stated as equality

- **The doc says:** The rule (CANON-028) states the gate set in `verify` must EQUAL the set CI runs.
- **The tree says:** The fence enforces containment in one direction only (verify subset of CI); its own test declares that deliberate.
- **Evidence:** scripts/check-ci-lint-parity.ts:79-82 vs __tests__/check-ci-lint-parity.test.ts:109

### Public brand spelling: MiMAR vs miMAR

- **The doc says:** CLAUDE.md and CANON-024 spell the user-facing brand 'MiMAR'.
- **The tree says:** The live fence BANS 'MiMAR' as wrong-cased and pins 'miMAR' (lowercase m) as canonical, per the PO decision of 2026-07-18; the fence's scope excludes .md so the docs are never scanned.
- **Evidence:** scripts/check-brand-casing.ts:69-72,140 (WRONG_CASE_BRAND regex bans MiMAR/Mimar/MIMAR), :143 REMEDY

### Panorama QA nightly is 'report, not gate'

- **The doc says:** panorama-qa-nightly.yml:9-13 — 'The scripts' own headers say nothing here can turn a run red.'
- **The tree says:** scripts/qa-panorama-chaos.ts:848 exits `summary.passed ? 0 : 1`, and the step running it carries no `\|\| true` and no continue-on-error — a failed chaos round turns the nightly red.
- **Evidence:** scripts/qa-panorama-chaos.ts:848 vs .github/workflows/panorama-qa-nightly.yml:228-231

### Panorama QA nightly checkout ref

- **The doc says:** panorama-qa-nightly.yml:27-31 — 'IT MUST NOT CHECK OUT main.'
- **The tree says:** Both build jobs pin `ref: main` (:58 and the chaos job's checkout), as does the alert job (:283); the prose is stale since DEPLOY_REF became main on 2026-09-01.
- **Evidence:** .github/workflows/panorama-qa-nightly.yml:27-31 vs :58,:283

### CI test-job timeout comment vs live value

- **The doc says:** ci.yml:665 comment says 'timeout-minutes raised from 15 -> 20 to account for v8 coverage instrumentation overhead.'
- **The tree says:** 30
- **Evidence:** .github/workflows/ci.yml:641 vs :665 (a stale comment about the current value, not a labelled historical incident)

### How many of the three payload-evolution rules lint:events actually enforces

- **The doc says:** AGENTS.md:893 — 'Three rules, enforced by pnpm lint:events (scripts/check-event-payload-parity.ts) in the verify pipeline.'
- **The tree says:** One. check-event-payload-parity.ts:10-11 enforces only rule 2 (reader keys must be writable); :13-21 declares it a FLAT key set with no per-event-type precision.
- **Evidence:** scripts/check-event-payload-parity.ts:10-21,448; AGENTS.md:893-897 (affects CANON-256, CANON-257, CANON-258)

### packages/contract 'The One Rule': nothing in dependencies

- **The doc says:** packages/contract/README.md#the-one-rule — 'Zero runtime dependencies ... and nothing in dependencies.'
- **The tree says:** packages/contract/package.json:25-27 declares zod ^4.4.3, approved at scripts/check-contract-purity.ts:130-131 with a written rationale.
- **Evidence:** packages/contract/package.json:25-27; scripts/check-contract-purity.ts:29-33,130-131 (affects CANON-260, CANON-261)

### data-lifecycle cron purge targets

- **The doc says:** docs/architecture/retention-policy-pending-decision.md#context — purges only targets with explicit, non-PII expiry semantics, naming three (notifications, rate-limit buckets, cron_runs).
- **The tree says:** FIVE targets (lib/infra/data-lifecycle.ts:3-14): purgeExpiredRateLimitBuckets, purgeExpiredNotifications, purgeRevokedPushSubscriptions, purgeOldOrgContactIps, purgeOldCronRuns — the fourth nulls org_contact_messages.submitter_ip, which the same file calls 'a personal datum' (:12-13), so the 'non-PII' qualifier no longer holds either.
- **Evidence:** lib/infra/data-lifecycle.ts:3-14,10-13,102 (affects CANON-233, CANON-186)

### Where the native-directory .easignore listing lives

- **The doc says:** docs/mobile/eas-build-profiles.md — 'apps/mobile/.easignore must list the same two paths.'
- **The tree says:** There is no apps/mobile/.easignore. The listing is in the ROOT .easignore:188-189 (apps/mobile/android/, apps/mobile/ios/); EAS reads .easignore only from the repository root.
- **Evidence:** apps/mobile/.gitignore:42-43; <repo root>/.easignore:188-189; apps/mobile/src/release/release-config.test.ts:661-666 (affects CANON-442)

### Hexagonal-lite coverage thresholds (CANON-357)

- **The doc says:** 90% branches on domain rules, 70-75% on the module/action layer.
- **The tree says:** business-rules 80, lib/** 55, app/actions 22, app/api 8, domain 88, src/modules 55 — and coverage runs only under `pnpm test:coverage`, which is not in verify.
- **Evidence:** vitest.config.ts:136-161

### Ratchet baselines whose DESCRIPTION prose outlived their counts

- **The doc says:** scripts/seed-ids-baseline.json, scripts/brand-casing-baseline.json and check-timezone-dates.ts:20 all describe a 'grandfathered / RATCHET' regime still tolerating violations.
- **The tree says:** All three baselines are EMPTY today — {"totalViolations":0,"files":{}} for all three — so all three rules are absolutely enforced, not merely ratcheted.
- **Evidence:** scripts/seed-ids-baseline.json:3-6; scripts/brand-casing-baseline.json:3-6; scripts/timezone-dates-baseline.json:3-6

### Mortalidad count dataset and the zero value (CANON-373)

- **The doc says:** docs/datos-abiertos/metodologia.md reads as a carve-out publishing an exact 0 for rates but suppressing small counts.
- **The tree says:** The count path suppresses 0 too: suppressSmallCells treats count < k uniformly regardless of path; the density path mirrors the locality tier exactly.
- **Evidence:** lib/open-data/__tests__/province-suppression.test.ts:92-100

### Dark mode's existence (cross-fence contradiction)

- **The doc says:** scripts/check-design-tokens.ts:7-9 — dark mode is disabled at the @variant level in app/globals.css, so `dark:` classes 'never apply'.
- **The tree says:** scripts/check-op-controls.mjs:13-14 explains a real bug in terms of what --color-ln-op-card IS in dark mode (#111a2b, rendering white-on-white) — implying dark mode does apply somewhere on the live tree.
- **Evidence:** scripts/check-design-tokens.ts:7-9 vs scripts/check-op-controls.mjs:12-14

## Merged rows

Ids folded into another row during extraction. Kept so an old citation still resolves.

### CANON-026

- **Merged into:** CANON-149

### CANON-078

- **Merged into:** CANON-056

### CANON-127

- **Merged into:** CANON-114

### CANON-130

- **Merged into:** CANON-082

### CANON-120

- **Merged into:** CANON-101

### CANON-492

- **Merged into:** CANON-101

### CANON-228

- **Merged into:** CANON-202

### CANON-356

- **Merged into:** CANON-376

### CANON-011

- **Merged into:** CANON-066
- **Rule:** A permanently-red scheduled workflow must alert on a red streak via an issue, not rely solely on GitHub's green-to-red transition email, since a never-run workflow's first run has no green to transition from.
- **Reason:** One rule stated twice: 'alert on a red streak via an issue' (011) IS 'wire the .github/actions/red-streak-alert composite action' (066) — same fence, same lines (check-scheduled-fence-refs.ts:506-524 alertFindings + the bidirectional ALERT_EXEMPT). CANON-066 states it plus the `audited:` job-output clause and cites the fence's own test, so folding loses no requirement. Both ENFORCED → ENFORCED.

### CANON-167

- **Merged into:** CANON-412
- **Rule:** No seed script may write a seed-marker literal into a renderable column (displayName/description/name).
- **Reason:** Identical rule, identical enforcer (scripts/check-seed-ids.ts + scripts/seed-ids-baseline.json), split only by scope label (db vs web). CANON-412's wording carries the fourth renderable column (legalName) that the fence actually checks, and its basis is the P14 empty-baseline reading. Kept status ENFORCED — which is also the Task 2 verdict for CANON-167, so the merge is not an average.

### CANON-419

- **Merged into:** CANON-196
- **Rule:** A caller holding an ownership row on a pet whose role is caretaker may not perform a titular-only database effect (declared spine event, restricted pet column update, or restricted insert table).
- **Reason:** One prohibition, two framings of the same deny-list: the six user-facing titular-only actions (196, sourced AGENTS.md:435) and the three DB effect classes the fence enumerates (419, sourced check-titular-gate.ts:8). Same enforcer lines (check-titular-gate.ts:51,79-82,91 + db/rls.sql + migration 0199) and same status. Kept 196 as the fuller doc statement; 419's quote and sources preserved in mergedFrom.

### CANON-299

- **Merged into:** CANON-266
- **Rule:** Every design token declared in `@dim/contract/tokens` must exactly match the corresponding `@theme` declaration in `app/globals.css`.
- **Reason:** Verbatim restatement across scopes ('@dim/contract/tokens must match app/globals.css @theme'), same fence scripts/check-design-token-parity.ts, same lint:token-parity wiring. CANON-266 states the both-directions property the fence implements; CANON-299's sibling-test citation folds into enforcer[]/sources.

## Unmapped enforcers

Enforcement machinery that exists in the tree and that NO canon row cites. Every
`lint:*` key in `package.json`, every `scripts/check-*.ts`, every
`__tests__/**/*{fence,parity,coverage}*.test.ts`, and every path listed in the parity
fence's `EXTRA_FENCES` (fences whose FILENAME hides them from that glob) is either
cited by a row's enforcer or listed here. The parity fence pins this list's length
EXACTLY: growing it and shrinking it are both hand edits, and both are reviewable.

3 unmapped.

| Kind | Item | Why it is unmapped |
| --- | --- | --- |
| fence-test | `__tests__/architecture-facts.test.ts` | Postdates the d7dbf25f7 snapshot; fences the facts markers, no canon row yet. Its filename carries none of fence/parity/coverage, so the census reaches it only through EXTRA_FENCES in __tests__/conventions-canon-parity.test.ts. |
| fence-test | `__tests__/check-function-parity.test.ts` | Pins scripts/check-function-parity.ts, which no canon row cites either: the rule it guards (a SQL function declared in a migration must match the one the app calls) was never written down in prose, so extraction had nothing to harvest. |
| fence-test | `__tests__/conventions-canon-parity.test.ts` | This canon's own fence. It postdates the d7dbf25f7 snapshot the rows were harvested from, so no row can cite it without describing a tree that did not exist when the canon was taken. |
