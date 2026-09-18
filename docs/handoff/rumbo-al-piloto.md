# Handoff — Rumbo al piloto

**For the agent that runs the implementation loop. It was planned by a different
model; you execute it. Nothing here is a suggestion.**

Written 2026-09-18 against `main` at `ea286a735` (one commit ahead of
`origin/main`, deliberately unpushed — see Tanda 0). Every claim below was measured
against the tree on that date by seven read-only verifiers; their full evidence,
file by file and line by line, is in engram under the topics listed in §9. Where
this document and the code disagree, the code wins and you say so in your report.

The PO-facing version of this plan is the page "Rumbo al piloto"
(https://claude.ai/artifact/6LMQn7Zi2j4MyX5cK2J2KG). It is a mirror, not the
contract. This file is the contract.

---

## 0. The one-paragraph brief

miMAR is waiting for a municipal pilot. The PO asked for everything that can be
done **from our side** to be done before it starts. Five queues carried ~180 open
rows; one in five described code that had already changed. This document keeps
only what survived verification, adds the 22 gaps no queue had, orders the work
into five batches ("tandas") by who it hurts, and defines eight exit gates that
say what "pilot-ready from our side" means. You run the tandas in order, one small
change per iteration, each change gated, reviewed, committed and pushed on its own.

---

## 1. Decisions already taken — do not reopen any of them

Dated, with the default that applies. If you think one is wrong, write it in your
report and keep going.

| # | Decision | Taken | What it means for you |
|---|---|---|---|
| D1 | A licensed vet may NOT close a rabies observation as `negative` before `observation_until`. Admin and govt keep that power. | PO 2026-09-18 | Tanda 0. The refusal names the date in es-AR. The payload of `rabies_observation_started` already carries `observation_until`; no extra I/O. |
| D2 | Email confirmations stay OFF. | PO 2026-09-18 (reaffirms 2026-07-10) | Do not flip the Supabase switch. `src/modules/auth/application/signup.ts:146-166` lists the two prerequisites for the day it turns on; leave them in place. |
| D3 | The pilot runs in the current single environment ("ensayo": Vercel `dim-staging`, Supabase `DIM-staging`, `www.mimar.com.ar`). No production project for now. | PO 2026-09-18 | No provisioning work. Instead: synthetic data must not reach a municipal user (Tanda 1, item T1-P1); the "cutover debts" list stays a list. |
| D4 | HEIC/HEIF uploads are rejected, not transcoded. Metadata stripping on the formats we do accept must fail closed. | PO 2026-09-18 | Tanda 1, item T1-P2. Video metadata is a sub-decision with a default, see D4b. |
| D4b | Video evidence (`video/mp4`, `video/quicktime`) carries GPS on iPhone recordings. Default: neutralise `udta`/`meta` boxes under `moov` in place (rename the box type to `free`), fail closed; until that lands, keep accepting video as today. | Default, not yet ratified | Tanda 2, item T2-P3. If the PO says "reject video instead", do that and drop the neutraliser. |
| D5 | Remote migrations to the ensayo database are agent work: `pnpm db:doctor --allow-remote` BEFORE, apply, doctor AFTER, and confirm against the database, never against the ledger. | PO 2026-09-17 | Applies to Tanda 3 migrations. There is no production database. |
| D6 | `delivery_strategy: single-pr` with `size:exception`; `main` is the working branch; work-unit commits. | PO, standing | Commit to `main`, push per work unit. No PR dance. |
| D7 | Repo is public; no secret ever enters the tree or a commit message. | PO, standing | Also: never paste a password into chat. |
| D8 | Questions are batched, never asked mid-loop; a reasoned default is applied and reported. Stop only for an irreversible outward action not pre-approved here, or for a red that reproduces inside your own change. | PO, standing (2026-08-17) | See §6. |
| D9 | Demo accounts (`*@dim.test`, password in `scripts/seed-test-users.ts`) stay in ensayo until a real cutover. | PO 2026-09-16 | Do not delete or reseed them. The PO will change the superadmin's password from the dashboard (§7). |

Defaults for the open PO items you will meet in the backlog (apply, report, move on):

| Item | Default applied |
|---|---|
| MFA (TOTP) for institutional accounts | Build it, Tanda 2 (T2-S6). |
| `/gob` first-run checklist (`docs/plans/gob-onboarding-scoping.md` G1–G5) | Build as written, Tanda 4 (T4-O3). |
| A09-4 dispute SLA | Notify the assigned arbiter at 30 and 60 days; no automatic consequence. |
| A05-6 professional-name retention after erasure | Retain; record the decision in the ERRATA block of `erase-subject-data.ts`. |
| A06-4 owner free text on `/p` | Warning at write time in the two forms; no render-time scrub. |
| A07-6 storage garbage | Report-only reconciliation cron first; nothing deletes. |
| C04-7 `CRON_ALERT_WEBHOOK` | Add `alertingConfigured` to `cron-health` details and `/admin/sistema`; the PO verifies the variable. |
| A01-8 authz-scoping ratchet | Make it fail on the SUM as well as per file; the loop owns the burn-down. |
| A04-3 recovery OTP | Leave `supabase/config.toml` alone (dev-only); the hosted setting is the PO's (§7). |
| Public "demostración — datos sintéticos" banner on `www.mimar.com.ar` | Unchanged. It is true of the environment. Report it as a consequence of D3; do not reword it. |
| Municipal padrón import, #756 vet write-access by share link, a dedicated queue for escalated cases, the six audit-log gaps | Not in scope. |

---

## 2. What "pilot-ready from our side" means — the eight gates

The loop ends when every gate is green or depends only on the PO or the
municipality. Each gate is measurable; "feels done" is not a state.

| Gate | Green when | Closed by |
|---|---|---|
| **G1 · nothing broken or lying for a user** | A10-1 closed; the public-surface cluster closed; every L row in Tanda 1 closed; rule fields computed (T1-G1); form-reset class closed (Tanda 4). | T1, T2, T4 |
| **G2 · CI is credible** | The E2E job on `main` green on three consecutive pushes; `e2e-nightly` and `panorama-qa-nightly` green on three consecutive nights; `deploy:staging` runs `test:verified`. | T0, T1 |
| **G3 · a municipality onboards without SQL** | First admin recipe is one and correct; institutional first login sets a password from an emailed link; vet and org approval work for a govt of the pilot jurisdiction (already true — re-verify by driving the flow); `national` role has a UI writer; synthetic rows invisible to govt. | T1 |
| **G4 · we find out before they do** | Health poll hits `www.mimar.com.ar`; `cron-health` reports `alertingConfigured`; backups verified on the Pro plan and one restore drill done locally; a support link exists and `privacidad@` has a named reader; the incident runbook is true. | T1, T5 |
| **G5 · clean enough environment** | No synthetic pet, event, case or report visible to a govt viewer; the flagship demo still works for admin. | T1 |
| **G6 · legal and privacy** | HEIC rejected and strips fail closed; video default applied; erasure items of Tanda 2 closed; retention policy decided and its first sweep implemented; rectification served minimally; legal pages name the data controller once the PO provides it. | T1, T2, T5 |
| **G7 · mobile** | Picker hang, hardware back, keep-awake closed (JS, OTA-shippable); production build profile and OTA channel separation ready for the PO's Play step. | T4, T5 |
| **G8 · no queue lies** | The 20 stale rows struck in Tanda 0; from then on every commit that closes a row strikes it in the same commit. `docs/plans/PENDIENTES.md`, `docs/reviews/2026-09-fresh/BACKLOG.md`, `docs/agents/open-work.md`, `docs/ops/cutover-debts.md`, `docs/ops/cutover-playbook.md`. | T0, every commit |

---

## 3. The tandas

Sizes are the verifiers' measurements: **XS** under an hour, **S** half a day,
**M** one or two days, **L** needs its own design pass. Item ids are stable —
cite them in commits and in engram. Backlog ids (`A03-G1`, `L-5`…) are the ones the
source documents use, so the row you strike is easy to find.

### Tanda 0 · Unblock (1–2 loop days) — closes G8

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T0-1 | Apply D1 in the vet close of a rabies observation, plus the five fixes the adversarial review found on `ea286a735`: (1) port the phase-aware parser from `scripts/check-authz-guards.ts:319-334` into `scripts/check-atender-owner-alerts.ts` so an inline return type no longer hides the body, and make the new action satisfy that fence honestly; (2) the mutation resolves the pet from `access.pet.publicToken`, never the raw string; (3) the owner alert names the clinic (`access.organizationName`) and reaches every active owner, not `limit(1)`; (4) notifications go through `createNotificationsBulk` (dead-letter + drain), not `flushNotifications`; (5) action-level tests for the licence gate, next to `actions.signing.test.ts`. | `src/modules/surveillance/application/professional-close-observation.ts`, `app/org/[orgToken]/atender/actions.ts`, `atender-access.ts`, `scripts/check-atender-owner-alerts.ts` | A vet closing `negative` before `observation_until` is refused with a message naming the date; admin/govt still can; the fence sees the new writer; gate green; then **push** (first push of the loop). | S |
| T0-2 | PR #790 (vitest 4.1.6 → 4.1.11). | branch `dependabot/npm_and_yarn/vitest-4.1.11` | Full gate ON THAT BRANCH (vitest is the instrument), then merge. Closes two of the seven medium advisories. | S |
| T0-3 | Strike the stale rows. BACKLOG.md: A05-1, A01-1, drain-outbox (unnumbered), A10-G1, A04-8, A07-2, C04-2, A09-6, C04-5 → CLOSED with the commit each verifier cited; A07-1, A03-G8, A07-3 → PARTIAL. open-work.md: rows 8, 9, 10, 11, 12 gone; row 6 reads "three of five (mudanza, devolución, re-hogar) — tránsito and org memberships remain"; the `DEPLOY_REF` follow-up section deleted (`DEPLOY_REF = "main"` since `196c8a278`); debts "tester crash unreadable", "two-clock rule fence" and "maplibre 6 blank map" struck. PENDIENTES.md: #41's "falta escalar a mano" struck (done 2026-09-17, `19a327c78`). Close GitHub #758 and #141 with a comment citing the code. cutover-playbook.md: mark §0 inventory and Phase 0 obsolete in a dated note, keep the golden rule and D1–D5. cutover-debts.md: add "backups verified + restore drill" and "superadmin demo password changed in dashboard" as rows; correct any row that says the org is on the Free plan (it is **Pro**, verified against the Supabase API 2026-09-18). AGENTS.md: the first-admin recipe (~line 275) must not `insert into profiles` (it collides with `on_auth_user_created`, `db/triggers.sql:88-91`; the correct recipe is `production-deploy-plan.md` §1.9); the sentence that says govt can write business rules (~line 243) is false — writers are admin-only (`app/actions/business-rules.ts:106,147,182`). | the five docs + `gh issue close` | Every struck row cites a commit or file:line. No count written in prose anywhere. | S |
| T0-4 | L-10: does `ar_localities` hold rows for Almirante Brown (`department_code = '06028'`)? One read-only query against ensayo. If none, the fix is the INDEC import, not code; record the answer in PENDIENTES.md. | `scripts/import-indec-localities.ts` for context | Row closed either way with the query output. | XS |
| T0-5 | C06-1: `deploy:staging` runs `pnpm test:verified` after `verify`. Leave `--archive=tgz` but document it as the hotfix shape. | `package.json:97` | Chain updated; `scripts/check-ci-parity.ts` (if it pins the chain) updated in the same commit. | XS |

### Tanda 1 · What hurts today or embarrasses us on day 1 (6–7 loop days) — closes G1 G2 G3 G5, starts G6

**Public surface and the leak**

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T1-A1 | A10-1: bind the historial tab of `/org/[orgToken]/transitos` to the viewing org exactly as the activos tab is bound (`innerJoin fosterProposals … eq(organizationId, organization.id)`). | `app/org/[orgToken]/transitos/page.tsx:83-110` | A test with two orgs proves org B's rows never render for org A. Security reviewer before push. | S |
| T1-A2 | The public-surface cluster, one SDD-sized change: A03-G1 (`"/r/"`, `"/t/"` in `app/robots.ts:81-83` + a test cross-checking every sitemap URL shape against the disallow list); A03-G7 (per-IP bucket on `app/(public)/perdidas/page.tsx` with a soft-fail notice); A03-3 (own bucket on `app/(public)/refugios/[orgToken]/page.tsx` before the first read, and widen `__tests__/public-token-throttle-coverage.test.ts` beyond DIM-token resolvers); A03-G3/G8/G2/G4 (`app/sitemap.ts`: fourth argument to `queryLostListing`, `loadWithTimeout`, `.limit()` on organizations, real `revalidate`, listed in `scripts/check-db-budget.ts` `DASHBOARD_PAGES`); A03-2 (token-only bucket beside the per-(ip,token) one in `report-pet-sighting.ts:145`, `report-dispute-tip.ts:83`, `notify-owner-of-found-pet.ts:100`, copying `submit-org-contact.ts:99-100`); A03-1 (`lib/infra/public-cache-policy.ts` derived from the tree with an explicit exemption map; `/t/` and `/refugios` in `NO_STORE_PREFIXES`). Rate-limit values: `tag_resolve` 100/min is the precedent; crawlers are wanted on `/perdidas`. | listed | Each sub-item has its own test; the throttle-coverage fence sees org-token routes. | M |

**CI**

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T1-C1 | `setPetFoundAction` / `setPetLostAction` revalidate `/mis-mascotas/{token}` (and `/p/{token}` where siblings do). This is the most probable cause of the two flaky specs (`crisis-owner-lost-flow.spec.ts:50`, `owner-ia-p6.spec.ts:639`), which fail in `ensurePetFound` cleanup, after the stranger-facing assertions passed. | `src/modules/events/actions.ts:856-934, 1010-1053`; compare `src/modules/pets/application/lost-mode/*` | Both specs green on three consecutive CI runs. If they still flake, the next lead is the docblock at `e2e/demo/_helpers.ts:398-455`. | S |
| T1-C2 | `degraded-states.spec.ts:124` is the deterministic red ("Next's AUTO prefetch must land before the click", `expect(received).not.toBeNull()` at :179). Reproduce locally first; then decide spec budget vs product `<Link>` prefetch in the mobile `AppShellDrawer` "Aprobaciones" entry. Do not loosen the assertion to make it pass. | `e2e/degraded-states.spec.ts`, `components/layout/AppShellDrawer.tsx` | Green on three consecutive CI runs with the cause written in the commit. | M |
| T1-C3 | `e2e-nightly.yml` red ×41: three specs consume the seeded refugio's live shelter custody and nothing reopens it (`.github/workflows/e2e-nightly.yml:54-68`). Each affected spec provisions its own custody, as one already does. Do NOT reseed from the job. | `e2e/*.spec.ts` named in the workflow comment | Nightly green three nights; issue #780 self-closes. | S–M |
| T1-C4 | `panorama-qa-nightly.yml` red ×20: `scripts/report-panorama-a11y.ts:96` waits 20 s for `panorama-dock` and an uncaught timeout exits 1; the chaos step also exits 1 on a failed recovery check. Make both scripts write failures as report rows and exit 0 (the workflow declares itself report-only — make that true). Separately measure whether the dock genuinely needs >20 s under `SCALE=0.0004`; if so, that is a performance finding to record, not a timeout to raise. | `scripts/report-panorama-a11y.ts`, `scripts/qa-panorama-chaos.ts` | Nightly green three nights; issue #781 self-closes; PENDIENTES L-20's "report-only" sentence becomes true. | S |

**The L rows someone suffers**

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T1-L5 | Attend and no-show notify the owner, as cancel already does in the same module. Extend `scripts/check-atender-owner-alerts.ts` (or a sibling fence) so both paths are covered. | `mark-appointment-attended.ts`, `mark-appointment-no-show.ts`, `app/actions/attendance.ts`; model: `cancel-appointment-by-org.ts` | Notification rows asserted in tests for both paths. | S |
| T1-L13 | `SuccessScreen` for accept custody transfer, decide adoption application, accept return, create decomiso (the `publicCode` is the receipt itself). | see `AGENTS.md` "trámites end in SuccessScreen" | No mute redirect after the final submit in the four flows. | S |
| T1-L16 | Deleting an agenda rule ends its materialised slots (or `bookSlotWriter` re-checks the rule and `effectiveUntil`). | `src/modules/events/application/booking/*` | Booking a slot of a deleted rule is refused; test by mutation. | S |
| T1-L15 | CSV intake: a throwing batch no longer hangs the wizard; the screen says the same `fileHash` resumes idempotently; `validateIntakeCsvAction` runs under a budget. | `app/org/[orgToken]/intake/importar/*` | A batch that throws shows the report of rows already written and how to resume. | S–M |
| T1-L11 | `generatePppExportAction` gets its button for a CABA PPP owner; correct `AGENTS.md` "placeholder por ahora". | owner pet page; `AGENTS.md:~1201` | The PDF is reachable by an eligible owner. | S |
| T1-L12 | `decideCapabilityAction` resolves the org from the request like `requestCapabilityAction` does since 2026-08-10. | `app/actions/*capabilit*` | A multi-org admin decides on the non-default org; audit and notification bound to it. | XS |
| T1-L4 | `reassignDecomisoInTx` must not leave a second `custody_transfer_proposed` that the acceptance validator reads as corruption. Write the reassign→accept test first. | `src/modules/decomiso/*` | Test proves accept works after reassign. | S |
| T1-L6 | Budget wrapper + degraded branch for `app/admin/casos`, `app/admin/historial/ActividadScreen`, `app/gob/historial`; make `check-degraded-chrome` count a page without a wrapper as an offender. | listed | Fence non-vacuity: removing a wrapper goes red. | S |
| T1-L18 | The three DB awaits in `app/org/[orgToken]/layout.tsx` before the bounded block get a deadline. | `layout.tsx:121-127` | `loadWithTimeout` or `withDbBudget` around them. | XS |
| T1-L14 | Five gender agreements (WhatsApp share of the lost wizard, "Marcar como encontrada" ×4, two intake match twins, Pampa `alt`). | grep the strings | Copy uses the pet's sex. | XS |

**The government pitch**

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T1-G1 | Rule fields are computed, not just displayed: a signed rabies dose without `next_due_at` derives currency from `occurred_at + frequency_months` through the resolver cascade (`next_due_at` stays the override); `rabies_vaccination.min_age_months`, `sterilization.min_age_months`, `sterilization.mandatory_from_months` gate or warn where they claim to. | `lib/projections/pet-compliance.ts:469-506`, `lib/domain/rule-types-registry.ts:380-392` | A test where the same dose flips Vigente→Vencida by changing only the jurisdiction's rule. | S–M |
| T1-G2 | Bites count where they occurred in the panorama loaders (read `jurisdiction_province/locality` from the `incident_reported` payload instead of joining `pets`; `490b3f0ee` did this for lost pets only); both bite writers use `locality: "soft"` and the map capture stops blanking the INDEC id; the two false comments corrected. (Localidad plan L2·3, L2·1, L0·2.) Numbers move; say so in the commit; no delta report (PO 2026-09-08). | `lib/analytics/panorama/repository-points.ts:59-61`, `repository-by-unit.ts:425-427`, `app/gob/vigilancia/actions.ts:249-252,421-424`, `components/.../LocationFields.tsx:120-121` | Panorama and case routing agree for a bite; comments true. | S |

**Day 1 of the municipality**

| Id | What | Where | Done when | Size |
|---|---|---|---|---|
| T1-P1 | **Synthetic data invisible to a govt viewer (D3).** Every `/gob` read path (queues, KPIs, panorama folds, exports, ENO outbox) excludes rows whose pet or report carries `seed_tag` when the viewer's scope is govt; admin keeps seeing everything so demos keep working. Prefer one clause in the shared scope helper over N edits. Suppression may appear where cells drop under k=5 — that is honest. | `lib/metrics/scope.ts`, `ProjectionContext`, `pets.seed_tag` (`db/schema.ts:552,705`), `welfare_reports.seed_tag` (`0155`) | A govt account of any jurisdiction sees zero synthetic rows across `/gob`; a fence or test proves the exclusion is applied on every govt fetcher. | M |
| T1-P2 | **HEIC rejected, strips fail closed (D4).** Remove `image/heic`/`image/heif` from `ALLOWED_MIME` in `lib/infra/welfare-uploads.ts:24-34` with an es-AR message asking for JPG/PNG; the EXIF strip at `:164-179` and the opt-in strip at `lib/infra/uploads.ts:110-113` refuse instead of "uploading original" (copy the fail-closed shape of `lib/infra/staged-event-attachment.ts:202-230`); verify the other upload doors already reject HEIC (`detectRasterMime` does). | listed | Tests: HEIC bytes refused; a strip failure refuses; PENDIENTES D4 row rewritten (server transcode is off the table). | XS+XS |
| T1-P3 | **Institutional first login.** After `createInstitutionalAccountForAuthority`, the person receives the link by email and lands on a "set your password" step; the copy-and-send-by-hand panel stays as fallback. | `src/modules/auth/application/create-institutional-account.ts:124-137,240-260`, `MagicLinkResultPanel.tsx` | A new govt user signs in from the email and sets a password without `/recuperar`. | S |
| T1-P4 | First admin: one recipe (see T0-3) and a remote guard in `scripts/seed-genesis-admin.ts` mirroring `seed-test-users.ts:83-95`. | listed | Script refuses a non-local `DATABASE_URL`. | XS |
| T1-P5 | Support channel: a link in the operator shell (`/gob`, `/org`, `/admin`); `CronsDownBanner` names a real channel; `/sugerencias` either works or is removed; a named reader for `privacidad@mimar.com.ar` is recorded in `docs/ops/incident-runbook.md`. | `components/ui/dashboard/*`, `CronsDownBanner.tsx`, `lib/ui/contact.ts` | Every operator surface has a way to report a problem that reaches a person. | XS–S |
| T1-P6 | `staging-health.yml` polls `https://www.mimar.com.ar`, not `dim-staging.vercel.app`. | `.github/workflows/staging-health.yml:75` | The scheduled fence refs check still passes. | XS |
| T1-P7 | UI entry for the SENASA export route. | `app/gob/senasa/export/route.ts` has no caller in `app/`/`components/` | A govt user reaches the download from `/gob`. | XS–S |
| T1-P8 | Pilot onboarding runbook (our side: accounts, assignments, rules, support, what to say on day 1) in `docs/pilotos/`, and `docs/onboarding/correo-funcionario.md:20-22` stops giving the staging URL and a test account. | `docs/pilotos/`, `docs/onboarding/` | A newcomer can onboard a municipality from the runbook alone. | S |
| T1-P9 | `national` read-only role gets a UI writer (today the enum at `create-institutional-account.ts:42` is govt/admin only). | listed + `/admin/govts/new` | An admin can create a national observer from the screen. | XS–S |

### Tanda 2 · Security, session, erasure (5–6 loop days) — closes G1 G4 G6 items

| Id | What | Where | Size |
|---|---|---|---|
| T2-H1 | A05-2: `scripts/check-subject-rights-coverage.ts` classifies per table `{export, erase}` as `covered | exempt(reason) | gap(reason)`, fails on any unclassified side; `attachments` out of EXEMPT. | `:185-257` | M |
| T2-H2 | C04-1: `expire-decomiso-handoffs` gets a `batchSize` (keyset), or `runCaseCron`'s unbatched branch honours `budgetHeaders`; `READS_THE_BUDGET` in the dispatcher fence stops classifying it `honoursBudget:true`. | `app/api/cron/expire-decomiso-handoffs/route.ts:32-44`, `lib/infra/case-cron.ts:130-143`, `lib/infra/cron-dispatcher.ts:257-260` | S |
| T2-J1 | A10-2 + A10-7: `admin-proposals/helpers.ts:48-54` loads the actor's active `govt_assignments` (mirror `admin-decisions/helpers.ts`); `propose-vet-upgrade.ts` and `propose-org-verification.ts` reject outside `jurisdictionScopeContains`; comments corrected. | listed | S |
| T2-J2 | A10-G2: `lib/metrics/alert-evaluation.ts:124-139` intersects a non-admin subscription's pair with the caller's own jurisdictions; govt-actor test. | listed | S |
| T2-J3 | A10-G3: `record-firings.ts:98-109` owner sweep joins `profiles` and requires `role='admin' AND deactivated_at IS NULL AND deleted_at IS NULL` (or erase/deactivate sets `is_active=false`). Update the `KNOWN_GAP` entry. | listed | S |
| T2-J4 | A11-G1: `lib/infra/jurisdiction-from-text.ts:196-203` no longer trusts a client-echoed province to set `unverified:false`; cross-check against lat/lng, fall back to `unverified:true`. | listed | M |
| T2-E1 | A06-G2 + A06-G1: dead-letter rows of an erased subject resolved/nulled in the `erase_subject_data` transaction; replay skips a recipient with `deleted_at`; resolved notifications null their payload (or a retention sweep in `data-lifecycle`). | `erase-subject-data.ts`, `drain-notification-dead-letter/route.ts:110-140`, `notification-service.ts:253-275` | S |
| T2-E2 | A07-3 rest + A07-1 rest: classify `welfare-evidence` and `revocations` as retention or gap with a bucket inventory in the coverage fence; a migration creates/limits `org-logos` (`lib/infra/storage-gc.ts:75-76,266` says no migration creates it). | listed | S |
| T2-E3 | A04-10: best-effort GoTrue admin session invalidation keyed by user id in the five revocation/deactivation writers. | `revoke-vet-role.ts` and siblings | M |
| T2-S1 | A04-1: `update-password.ts` requires proof of the recovery flow (AAL/amr) or the current password; `secure_password_change` documented as a hosted setting for the PO (§7). | `src/modules/auth/application/password-reset/update-password.ts:29-32` | M |
| T2-S2 | A04-2 + A04-6: `logout.ts` binds `signOut`'s result and does not redirect on failure; `update-password.ts:53` returns one generic sentence. | listed | XS |
| T2-S3 | A01-4: `__reset*ForTests` out of `"use server"` modules; a fence rule bans the class. | `app/actions/localities.ts:51-53`, `scripts/check-server-action-exports.ts` | S |
| T2-S4 | A06-G5: the negative test per anon-callable action (dispute → `DISPUTE_TIP_NOTICE`, no `createNotificationsBulk`). | `__tests__/notify-owner-found-pet-action.test.ts` | XS |
| T2-S5 | Authority resolver ignores `deactivatedAt` (18 call sites, one change, verified together); rate-limiter key length bounded; L-24 secret-scanning fence in `verify` (gitleaks-shaped patterns: connection strings, bare passwords), with a non-vacuity floor. | `findAuthoritiesForJurisdiction`, `lib/infra/rate-limit*.ts`, `scripts/check-*.ts` | S · S · XS–S |
| T2-S6 | MFA (TOTP) for institutional accounts (default, see §1): enrolment in `/cuenta`, enforced at login for `account_type='institutional'`, recovery codes, documented in the pilot runbook. | `src/modules/auth/*`, `app/(auth)/*` | M |
| T2-C1 | C04-4: `refresh-cube` inside `withCronRun` with `failed` flag; C04-3: `cron-health` excludes its own just-inserted row; C06-5: checksum drift fatal by default (`--allow-drift` for the recorded exception), `deploy:staging` passes `--strict`. | listed | XS · S · S |
| T2-U1 | A07-4: decomiso uploads go through `uploadAttachmentIfPresent` or a document whitelist validated by magic bytes; extension from the validated type. | `app/actions/decomiso.ts:151-174` | S |
| T2-P3 | D4b video: in-place neutralisation of `udta` and `meta` boxes under `moov` (box type → `free`, offsets untouched), fail closed; test corpus with a real iPhone `.mov` and an Android `.mp4` (ask the PO for two files — that is not a decision, it is a fixture). WebM passes through (no standard location tag). | `lib/infra/welfare-uploads.ts` | S–M |
| T2-F1 | L-21: the three families via `next/font/local` with versioned `.woff2`; one visual pass on the landing and the credential. | `app/layout.tsx` | S |
| T2-N1 | Daily email digest to operators with pending queue items (Resend is configured: `smtp.resend.com`, `noreply@mimar.com.ar`); opt-out per user; no PII in the mail body beyond counts and codes. | `lib/infra/notification-service.ts`, a new cron in the daily dispatcher | S–M |

### Tanda 3 · Data integrity, jurisdiction, fences (7 loop days) — closes G1 G8 items

| Id | What | Size |
|---|---|---|
| T3-A1 | Amendment overlay: `events-repository.ts:388-393` and `rederive-pregnancy-status.ts:30-42` fetch `event_amended` and run `overlayAmendments` before replay (A08-G1, A08-G2); `repair-pet-cache-drift.ts:129` too (A08-G4); brand the input type (A05-7); new `scripts/check-amendment-overlay.ts` enumerating every `replayPet*` / `petEvents.payload` reader of an amendable type (A08-G3). | M |
| T3-A2 | Cache/spine: `reconcile-pet-status` covers every status family or `detect-pet-cache-drift.ts` is scheduled (A08-3); offline fitness test `getTableColumns(pets)` vs `replay*` / `EXCLUDED_CACHE_COLUMNS` (A08-4); audit trigger captures old/new `payload`/`notes`/`occurred_at`/`event_type` excluding PII keys, new migration + `db/triggers.sql` (A08-2); system-cron actor uuid for the scan purge (A08-6); `validatedEventValues` inside the shared helper and the three raw surveillance inserts through it (A08-7); missing-actor `23001` + override audit-row cases in `pet-events-append-only.test.ts` (A08-1); owner-role drift in `detect-pet-cache-drift.ts` (A09-5); `'escalated'` in `custody_disputes_status_valid` (A09-3). | M–L |
| T3-A3 | A09-2: `accept-pet-transfer.ts` captures `endedCaretakerGrants` and calls `notifyCaretakersOfHandoff` after commit exactly as `finalize-adoption.ts:361`; update `use-cases.test.ts:485`. | S |
| T3-J1 | Localidad plan remainder: L0·1 `normalizeLocationForWrite` mode mandatory (`location-normalize.ts:43,99`, only a test file has bare calls); L1·1 `/gob` fold renders `sinUbicacionCount` ("N sin ubicar"); L1·2 hurt-case tests (locality outside catalog, `Núñez` vs `Nunez`, null locality, whole-province sentinel) — NOT a fold-parity test; L3·0 province-first cascade in `apps/mobile/src/pets/LocalityPicker.tsx` with the 14-line header REWRITTEN with the decision and its date (2026-09-08), not deleted; L3·1 `LocalityPickerAcross` warns on deselection; L3·2 `JurisdictionFilterBar` and `OrgMascotasFilterBar` on the shared base; L4·1 `seed-panorama.ts:4297-4322` writes `localityId` on welfare reports, then backfill; L4·2 `govt_assignments` authority as an explicit unit (forward migration + re-resolution of assignments; the display name is never a join or authorization key); L4·3 inventory of the ~21 `jurisdiction_locality =` matches in SQL/RLS (two inside `SECURITY DEFINER` functions) → a doc + a fence before any promise of "one fold". Migrations applied to ensayo under D5. | L |
| T3-J2 | A10-3 `normalizeJurisdiction` through `resolveCanonicalJurisdiction` (`app/actions/business-rules.ts:56-69`); A10-4 db test that every active pet's (province, locality) resolves against `ar_localities` + repair migration mirroring `0117`; A10-6 `foster-repository.ts:442-449` uses the canonical province on UPDATE. | S |
| T3-F1 | RLS machinery: A02-3 views enumerated for `security_invoker`; A02-4 `pg_proc` search_path probe; A02-5 `OPERATIONS_UNDER_TEST` includes insert/update + column-scope probe (the owner inserting `author_role='govt'` must be denied); A02-7 lint over migrations for `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY`; A02-2 strip "paste into Studio" from the five `db/*_rls.sql` headers and `AGENTS.md:~1621`. | M |
| T3-F2 | Authz fences: A01-3 drop `"auth.getUser"` from `AUTH_GUARDS`, widen `findDeletionUnawareMutations`; A01-7 `lib/**` in `ACTION_SOURCE_GLOBS`; A01-6 required scope in `admin-search.ts:97`; A01-5 predicate into SQL in `owner-dashboard.ts:1595,1925`, delete dead `fetchVaccinationHistory`; A01-8 ratchet fails on the sum. | S |
| T3-F3 | API v1: A11-1 per-user budget on `adoptions/[petToken]/route.ts`; A11-3 `__tests__/api-v1-pet-detail-route.test.ts` (four refusals + 503 on budget); A11-2 per-user call-site → family mapping in the rate-limit families test; A11-G2 `TransferDetailScreen.tsx:288` through `buildAcceptTransfer`/`buildRejectTransfer`/`buildCancelTransfer`. | M |
| T3-F4 | A05-4 zod string-leaf classification fence (`swept | structural | retained-with-reason`); A06-1 `fetchCasesPerLocality` returns the branded suppressed type; A06-G4 `"success"` in the dead-letter severity union; A03-G5/G10/G11 (Set, projected keys, validated `province` + canonical on `/perdidas` and `/adoptar`). | S |
| T3-F5 | B10: `PanoramaConsole.tsx` is at 88 % of its size-fence slack. Land the two small Lote E steps already designed (`MapLegends` and `MapDataTable` to `next/dynamic`, boundary inside `PanoramaDockRegistros`), with the route-weight fence as the instrument. Do not open the big split. | S |

### Tanda 4 · Forms and mobile (6 loop days) — closes G1 G7 items

| Id | What | Size |
|---|---|---|
| T4-F1 | L-23: the ~66 `useActionState` forms without `useKeptFields`, in batches by control type and in damage order — `PregnancyEndedForm`, `WelfareReportForm` (its hand `kept()` misses selects), `FinalizeAdoptionForm`, `CrearConsultorioForm` (a step-3 error wipes steps 1–2), `LegalMetadataFieldset` (mounted by ~11 `/gob/reglas` screens: one fix covers all), then the long tail. Inventory: engram `forms/react19-reset-data-loss-inventory`. Each batch proven by mutation. | L, batched |
| T4-M1 | Android `getPendingResultAsync`: bootstrap-time recovery read in `apps/mobile/src/native/expo-image-picker-adapter.ts` so a destroyed activity does not hang `PetPhotoScreen` / the tatuaje branch on "Abriendo tus fotos…". Design decision: the port's shape changes; write the decision in the adapter's header. | M |
| T4-M2 | Hardware back on the pet document turns the card back while `face !== initialFace` (focus-scoped `BackHandler`); do not touch `anchor: "index"` or the gate's `<Redirect>`. | S |
| T4-M3 | `useKeepAwake` replaced by `activateKeepAwakeAsync`/`deactivateKeepAwake` inside the same focus window `useQrSpotlight` already uses. | S |
| T4-M4 | Caretaker invitations visible to the invitee in the `/transferencias` hub (web) and its native counterpart, from `GET /api/v1/me/caretaker-grants`. | M |
| T4-M5 | Row 6 remainder: tránsito (foster) and org memberships from the phone. | M–L |
| T4-M6 | Five small fences: `claimDisputeUrl` via `deepLinkUrl`; reservar button `disabled` asserted; booking refusal fence catches `throw new BookingError(msg)`; positive assertion on `body.serviceKind`; `read-return-state.test.ts` stub compiled through `PgDialect().sqlToQuery()` instead of `return self`. Plus the two band tints into `@dim/contract/tokens`. | XS–S each |
| T4-I1 | #753 `dangerous_breed_attested` provenance (who may emit it, evidence required); #757 hint to the professional channel; #759 a writer for `disease_reported`. | S–M · XS · S |
| T4-O3 | `/gob` first-run checklist G1–G5 as written in `docs/plans/gob-onboarding-scoping.md`. | M |

### Tanda 5 · The pilot environment (3 loop days + PO waits) — closes G4 G6 G7

Ours:

| Id | What | Size |
|---|---|---|
| T5-D1 | Rewrite `docs/ops/cutover-playbook.md` as state-aware for TODAY (ensayo is the pilot environment; production is a later phase); rewrite `docs/ops/incident-runbook.md` (only two Vercel crons exist; `daily` runs at 04:00 UTC; `/admin/programa` is a link-out; the channel from T1-P5). | S |
| T5-D2 | Backups: verify daily backups are enabled on `DIM-staging` (org plan is Pro, verified 2026-09-18); download one and restore it into the local Docker stack as the drill; write the recipe in the runbook. PITR is a paid add-on — recommend it to the PO in the report, do not buy. | S |
| T5-O1 | `alertingConfigured` in `cron-health` details + `/admin/sistema` (C04-7); report-only storage reconciliation cron (A07-6). | XS + S |
| T5-M1 | Mobile: OTA channel separation between the tester build and production; `eas.json` production profile already points at `www.mimar.com.ar`; the EAS build that carries the native modules (pet photo picker, camera chip scan) and the `decode-uri-component` bump, tested on a device. | M |
| T5-L1 | Retention policy: decide per `docs/architecture/retention-policy-pending-decision.md` with the defaults it recommends, implement the first sweep in `data-lifecycle`. Rectification (ARCO R): one more member of the `my-profile` input union, served on web and `/api/v1`. | M |
| T5-L2 | Legal pages name the data controller and address and the registry inscription, once the PO supplies them (§7). Until then: nothing changes. | XS |
| T5-X1 | Mi Argentina: a real OIDC code-flow callback against a mock issuer so "four variables" becomes true (`app/auth/miarg/callback/route.ts:42-56` answers 501 today). Only if every other gate is green. | M |

The PO's (prepare, never press — §7): superadmin demo password, leaked-password toggle, OTP length/expiry, `secure_password_change`, `CRON_ALERT_WEBHOOK`, Play production access (~2026-09-26) and the stray release-12 draft, the convenio / data controller / registry, PITR.

---

## 4. Out of scope, deliberately

esbuild 0.18, `blob:` in the CSP, csv-parse major, uuid in the iOS tooling, Sentry for the web (needs a DSN and an art. 12 legal read), the "any licensed vet may close" scope, L-8 panorama temporal differencing, the big Lote E split, D4's server-side HEIC transcode (replaced by D4), #751/#752/#754, municipal padrón import, #756, a dedicated queue for escalated cases, the six audit-log gaps. Each has its reason on the PO page; do not pick them up.

---

## 5. How an iteration runs

1. **Read state**: engram topic `pilot/plan-2026-09-18/state` (create it on the first iteration from §3, one row per item: `id | tanda | status | commit | note`). Take the next `todo` item of the current tanda; two if they share files and fence.
2. **Implement**: XS yourself. S/M through ONE writer subagent with an explicit `model`: mechanical → `sonnet`; authorization, PII, RLS, event spine, migrations → the strongest model you have. A second writer only in its own git worktree with disjoint files, landing through a serial merge gate. A fresh worktree has no `.env.local`: write one from `npx supabase status -o env` before trusting any red there.
3. **Preflight (under 10 minutes, mandatory)** with the pinned Node on PATH:
   `export PATH="$HOME/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"` then `pnpm biome check --write <touched> && pnpm typecheck && pnpm -C apps/mobile typecheck && npx tsx scripts/check-ui-invariants.ts && npx tsx scripts/check-design-tokens.ts`, then ALL `lint:*` scripts in one pass (skip `csp-prerender` and `route-weight`, they need the build), then `pnpm facts:write` + the hand-edited `<!-- fact:key -->` markers + `pnpm canon:render` whenever a `*.test.ts(x)`, a fence or a cron was added or removed, then `pnpm seed:panorama` if the previous suite run touched panorama data. A preflight run on Node 24 is not a preflight.
4. **Gate**: `pnpm verify` then `pnpm test:verified` (never `pnpm test`), through a detached `.cmd` runner in the scratchpad (`powershell Start-Process -FilePath cmd.exe -ArgumentList "/c","<runner.cmd>" -WindowStyle Hidden -PassThru`), each step to its own log with an `.exit` marker written as `(echo %ERRORLEVEL%)> step.exit`, launched only when commit free ≥ 14 GB (`Get-CimInstance Win32_OperatingSystem`, commit, not RAM) and no stray `grep|rg|tail|node` orphan is burning CPU. Freeze the tree while it runs — not even a doc edit. Poll the markers with `ScheduleWakeup` (a detached process sends no notification). Paste the verdict line: `reported N file(s); N discovered; 0 failing test(s); 0 broken file(s)`.
5. **Read the red by its signature** (`/CLAUDE.md` has the full text): broken file with a mock/collection/import error → yours, never commit; worker died mid-file with an unrelated victim → re-run ONCE, different victim each run means the run, same victim twice means the file; clean verdict + `Worker exited unexpectedly` + exit 1 → the open teardown defect, may be committed with both lines quoted; a suite that answers differently twice with no crash → a test defect (usually a host clock vs `defaultNow()`), never commit; credential-shaped reds in `__tests__/rls/*` → the environment. A killed `test:verified` leaves `admin@dim.test` deactivated in the local DB — run the diagnose query in the memory index before believing the next red.
6. **Fresh-context review before every push**: a read-only `code-reviewer` subagent over the commit range; `security-reviewer` when the range touches authorization, PII, RLS, DNI or the event spine. Its findings land as their own `fix(...)` commit citing the review. A green gate proves the code matches the author's belief, not that the belief was right.
7. **Commit and push**: conventional commits, subject and body in Spanish as the repo does, explaining why; no AI attribution of any kind. Push to `main`; staging redeploys itself; note the 7-char SHA in the state row.
8. **Bookkeeping in the same commit**: strike the row in the queue that carried it (§2 G8), update the state topic, `mem_save` any decision, root cause or gotcha. At the end of a tanda: update the PO page with the tanda's verdict lines (republish the artifact by `url`), and `mem_session_summary`.
9. **Schedule the next wakeup** with `ScheduleWakeup`: ~1500 s while a gate runs, 60–120 s between iterations, 1200 s as the fallback.

Territory rule: one file has one writer at a time. `git add <pathspec>` explicitly — a bare `git commit -a` sweeps another agent's staged files. Never `git checkout -- <file>` to undo a mutation test; restore from a `cp` backup.

---

## 6. When you stop, and when you do not

You do NOT stop for a product question: apply the default from §1, write it in the report under "decided without the PO", continue.

You STOP, write the report and end the loop when one of these is true:

- The current tanda is done and the next one is Tanda 5's PO half only.
- An action is irreversible and outward-facing and not pre-approved here: a production secret, DNS, billing, wiping data, a change to a public legal claim, a push while the PO said not to.
- A red reproduces on a frozen tree and the victim is inside your change's blast radius, and two honest attempts did not explain it.
- The PO wrote something in chat that changes §1.

The PO may report things he sees while testing. Those go to the state topic as new rows with a tanda assignment and a one-line acknowledgement; they do not interrupt the current item unless real users are losing data or a leak is live.

---

## 7. PO-gated — recognise and hand over, never attempt

| What | Why it is his |
|---|---|
| Change `admin@dim.test`'s password from the Supabase dashboard before day 1 (the repo publishes the current one, on a superadmin, on a reachable domain). | A secret. Recommend it in every tanda report until done. |
| Enable leaked-password protection (Pro plan — already Pro), set `minimum_password_length = 8` + complexity, `otp_length = 8`, `otp_expiry = 600`, `secure_password_change = true` (dashboard: Authentication → "Secure password change") on the hosted project. The last one closes what app code cannot (T2-S1): a stolen access token calling GoTrue's `/auth/v1/user` directly. The app's own doors already work with it ON — `/cuenta/contrasena` updates through a seconds-old proof session, the recovery form through a fresh recovery session. | Hosted Auth settings. |
| Confirm TOTP MFA is enabled (enroll + verify) on the hosted project (dashboard: Authentication → Multi-Factor). Institutional accounts cannot enter any portal without it since T2-S6; the runbook is `docs/pilotos/onboarding-municipio.md` §3.1. | Hosted Auth setting. |
| Confirm `CRON_ALERT_WEBHOOK` is set in Vercel; decide PITR. | Env var and billing. |
| Play: production access after the 14-day closed test (~2026-09-26); discard the stray draft of release 12; Data Safety form. | Store account. |
| Convenio with the municipality; who is data controller and who is processor (Ley 25.326 art. 25); registry inscription (art. 21); the controller's name and address for `/privacidad` and `/terminos`. | Legal; needs a lawyer. |
| Two fixture files for T2-P3: one iPhone `.mov` and one Android `.mp4`, recorded with location on. | Real-device material. |
| Email confirmations ON, when he decides (D2). | Product posture. |
| Any production project, secret or DNS. | Not in this plan. |

---

## 8. The report you write at every stop

1. Tanda and item ids done, each with its commit SHA and the pasted verdict line.
2. Items skipped or reordered, and why.
3. What you decided that nobody decided for you (§1 defaults you applied, plus anything new).
4. What you found broken and did NOT fix — one line each, with the row you added to the state topic.
5. Where this document is wrong about the code, said plainly.
6. The PO-gated items still open (§7), so he sees them in one place.

---

## 9. Evidence and traps

Verification evidence (engram, project `dim`): `backlog-2026-09/verification-high-med-a`, `backlog-2026-09/verification-med-b`, `backlog-2026-09/verification-low`, `open-work/verification-2026-09-18-issues-board`, `open-work/verification-2026-09-18-debts-localidad`, `ci/e2e-red-diagnosis-2026-09-18`, `pilot/readiness-gaps-2026-09-18`, and the plan itself `pilot/plan-2026-09-18`. Read a topic with `mem_search` then `mem_get_observation` (search results are truncated).

Traps this repo has already paid for, all written up in the machine's auto-memory index (`~/.claude/projects/C--dev-dim/memory/MEMORY.md`) — read it before the first gate: the Bash shell resolves Node 24; a `cd` into a worktree persists for every later command; `pnpm test`'s exit code lies; editing during a gate poisons repo-scanning fences; a killed pipeline leaves `grep.exe` orphans pinning a core; the gate launch threshold is commit, not RAM; background gates die at turn end unless detached; `git commit` sweeps the shared index; `git checkout -- <file>` wipes mutation-test work; `node -e` breaks on quotes (write a `.mjs`); regex-bearing files go through the Write tool, never a heredoc; `rg`'s match highlighting mangles the matched text; a fence that enumerates spellings misses one; a sweep in one language misses the other; a finding from a sweep is a hypothesis until checked against the live system; applying a branch's migration poisons the shared local DB for the other branches; `cube-parity` fails on stale local data, not code; the Definition of Done is `verify` AND `test:verified`, both green, and committed.
