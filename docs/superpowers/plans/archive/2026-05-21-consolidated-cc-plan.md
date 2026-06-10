# Consolidated Claude Code execution plan

> **Date:** 2026-05-21
> **Supersedes:** the "what to do this week" section of `docs/unapplied-specs-audit-2026-05-20.md` and the sprint list of `docs/superpowers/plans/2026-05-20-master-execution-plan.md`.
> **Reason for refresh:** both prior docs were dated 2026-05-20 and the repo has shipped past them. This file re-anchors on the **actual** state of `C:\dev\dim` as of 2026-05-21 and chunks the remaining work into seven shippable batches.
>
> **Owner:** Ignacio Del Valle
> **Audiencia:** Claude Code (input directo)
> **Estimación restante:** ~18–22 días de CC, distribuidos en 7 chunks (vs. 28-35d que estimaba el master plan original)

---

## Reality check — what's already shipped

Verified by direct inspection of `C:\dev\dim` on 2026-05-21:

| Original task | Source | State on disk |
|---|---|---|
| Tier 0 — move tree to `C:\dev\dim` | Audit | ✅ Tree migrated, working repo |
| #2 — CONTRIBUTING.md, PR/issue templates, CODEOWNERS | Audit | ✅ All present in `.github/` |
| #3 — `pnpm test` step in CI | Audit | ✅ `test` job at `ci.yml:122-179` runs supabase local stack + `pnpm db:bootstrap` + `pnpm test` |
| #5 — Postgres-in-CI | Audit | ✅ via `supabase start --exclude studio,inbucket,...` |
| #6 — gate `claimStubProfileAction` | Audit (CRITICAL) | ✅ `STUB_CLAIM_ENABLED = false` in `app/actions/claim.ts:33` |
| #7 — notifications outside transactions | Audit | ✅ in `cross-org-transfer.ts`, `foster-proposals.ts`, `adoption-applications.ts`; ⚠️ one residual in `foster-volunteers.ts:370` (may be intentional self-notif — needs 15-min review) |
| #9 — sanitize `next` redirect | Audit | ✅ `lib/dni-next.ts` with `new URL()` + `%2f`/`%5c` guards |
| #25 — extract `inputClass`/`labelClass` | Audit | ✅ `lib/form-classes.ts` exists, used by 4+ components |
| #27 — rabies cron in `vercel.json` | Audit | ✅ `close-rabies-observations` registered |
| Sprint 1A — deprecate `/pro` | Master plan | ✅ no `app/pro` folder exists |
| Sprint 1B — microchip-replaced UI + lifecycle | Master plan | ✅ `app/actions/microchip.ts` + `lib/case-lifecycles/microchip-remediation.ts` |
| Sprint 2 — Foster volunteers pool | Master plan | ✅ `app/actions/foster-volunteers.ts` + `app/actions/foster-proposals.ts` + `lib/case-lifecycles/foster-placement.ts` |
| Sprint 3 — /adoptar listing público | Master plan | ✅ `app/adoptar/page.tsx` + filters + ficha + postular flow scaffolded (needs final-pass audit on cross-spec guards) |
| Cases system (Tier 6 #29) | Audit | ✅ `lib/case-lifecycles/` has 10 lifecycle files |

**Net effect:** ~60% of the original 28-35-day master plan is already on disk. What's left is mostly features that hadn't been started + a handful of stale audit infra items.

---

## What remains — chunked for Claude Code

Each chunk below is **independently shippable** (CI green, no in-flight refactors). Sequencing favours dependency order, then size (small unblockers before big-leverage features).

### Chunk A — Infra & convention hardening (~2 days)

**Goal:** close the last remaining audit Tier 1/3/4 items so every chunk after this lands on a CI that actually enforces what it claims to.

- **A1** — Coverage thresholds in `vitest.config.ts` (audit #4, ~1h). Add `coverage.thresholds` per-folder per testing PLAN.md D2. Branch coverage targets: `app/actions` 80%, `lib` 70%, root global 60%.
- **A2** — Audit `foster-volunteers.ts:370` notif insert (~15 min). Decide: self-notification (keep inside tx) or recipient notif (move out). Document the call in code comment.
- **A3** — Verify Tier 3 #12 (FK `ON DELETE` clauses, ~2h). Run `pnpm exec drizzle-kit introspect` or grep for `references(` without `onDelete`. Add `set null` / `cascade` for the gaps. 85 onDelete declarations exist for 82 FKs so coverage is high; this is verification.
- **A4** — Tier 4 #20 (`schemaVersion: z.literal(1)` on event payloads, ~½ day). Add to every Zod schema in `lib/event-payloads/`. Backfill SQL gated by `app.allow_event_mutation` GUC.
- **A5** — Tier 4 #19 (link `docs/event-design-checklist.md` from `CONTRIBUTING.md` + PR template, ~10 min).

**DoD:** `pnpm typecheck && pnpm lint && pnpm test && pnpm rls:smoke` green. Coverage CI step fails if a file regresses below threshold. New PRs trigger the event-design-checklist link in their checks.

---

### Chunk B — Cheap feature wins & cleanup (~1.5 days)

**Goal:** knock out the audit Tier 5 items that have been ready to run for weeks. Each is <½ day; bundle them so the PR overhead amortises.

- **B1** — Run CABA barrios import (audit #21, ~½ day). Script `scripts/import-caba-barrios.ts` exists. Execute against staging, verify combobox ranking, snapshot test, run against prod.
- **B2** — Apply `db/foster_rls.sql` in Supabase Studio (audit #26, ~15 min). Foster pool follow-up.
- **B3** — Validate canonical jurisdiction in remaining 5 server actions (audit #28, ~½ day): vet upgrade, org creation, service-offerings, welfare, events.
- **B4** — Verify service-dog 404 and vet portal routing (audit #22, #23). With `/pro` deleted these may be moot — grep for remaining refs, fix if any survive, otherwise close.
- **B5** — Quick `foster-volunteers.ts` follow-up if A2 surfaced something deeper.

**DoD:** Every audit Tier 5 item is either ✅ shipped or ❎ closed-as-moot with a one-line note in the audit file. CABA barrios visible in production combobox.

---

### Chunk C — Vaccine-due UX (Sprint 4 from master plan, ~3 days)

**Plan ejecutable:** ⚠️ write first as `docs/superpowers/plans/2026-05-2X-vaccine-due-ux.md`.
**Design spec:** `docs/design/06-vaccine-due.md`.

Sprint 4 from the master plan, **unchanged**. Independent of every other chunk. Can run in parallel with Chunk D if a second CC session is available.

- **C0** — Pre-work (~0.25d): write the executable plan with throttling rules + `lib/vaccine-reminder-state.ts` helper + anti-spam keys.
- **C1** — Componente core (~0.5d): `components/poncho/ReminderCard.tsx` with 5 variants + shared `<Badge>`.
- **C2** — Cron logic (~0.75d): extend `app/api/cron/vaccine-due/route.ts` with per-variant throttling. Tag notifs as `category='health'`.
- **C3** — Surfaces (~1d): `<RemindersSection>` on `/inicio`, `<PetReminders>` on pet detail, badge on `<PetCard>` of `/mis-mascotas`.
- **C4** — Libreta (~0.5d): `<VacunasTimeline>` + `<VacunaTimelineDot>` + tabbed `/notificaciones`.

**DoD:** Race tests pass (owner registers vacuna while cron creates notif → both succeed, legacy resolved). Anti-spam thresholds verified. Reduced-motion respected. Inventory entry 7.4 → ✅.

---

### Chunk D — Sprint 3 /adoptar — final-pass audit (~1 day)

**Goal:** Sprint 3 scaffolding exists. Verify the cross-spec guards from the spec are wired and close the loop.

- **D1** — Grep `app/adoptar` for usage of `adoption_eligible`, `in_custody_dispute`, `rabies_observation_status`, `status='lost'` filters. Add any missing guard in `lib/adoption-listing-query.ts`.
- **D2** — Confirm `apply_intent` token round-trip on the post-auth wizard. Test: anon visitor → postular → login redirect → wizard resumes.
- **D3** — Confirm D22 consent persistence in `profile_sharing_consent_at`.
- **D4** — SEO check: `<title>`, `og:image`, JSON-LD `Animal` schema, sitemap presence on `/adoptar/[petToken]`.
- **D5** — Update `docs/feature-inventory-2026-05-20.md`: 3.7.1, 3.7.2 → ✅.

**DoD:** All cross-spec guards verified by tests with synthetic pets in each disqualifying state. Inventory updated. Plan moved to `archive/`.

---

### Chunk E — Govt dashboards (Sprint 5, ~6–7 days)

**Plan ejecutable:** ⚠️ write first.
**Design spec:** `docs/design/04-govt-dashboards.md`.

Biggest remaining single sprint. `/gob` skeleton already exists (`vigilancia`, `perdidas`, `maltrato`, `casos`, `disputas`, etc.) but the shared dashboard primitives and `/gob/analytics` are missing.

- **E0** — Pre-work (~1d): write `docs/superpowers/plans/2026-05-2X-govt-dashboards.md` covering 5 shared components + 3 enriched dashboards + 1 new `/gob/analytics` + async export endpoint.
- **E1** — Shared components (~1.5d): `<MetricCard>`, `<MapChoropleth>`, `<TimeSeriesChart>`, `<JurisdictionSwitcher>`, `<PeriodPicker>` + showcase at `/design/dashboards`.
- **E2** — `/gob/vigilancia` enriched (~1d).
- **E3** — `/gob/perdidas` enriched (~0.75d).
- **E4** — `/gob/maltrato` enriched (~1d).
- **E5** — `/gob/analytics` net-new (~1d).
- **E6** — Async export endpoint (~0.75d).

**DoD:** RLS scope-bound by `govt_assignments` verified (CABA govt sees only CABA cases). Charts have `<details><summary>Ver datos</summary>` accessibility fallback. Export emits signed URL via email, 24h TTL. Period picker persists in searchParams. Inventory 11.7, 11.13 + new entries → ✅.

---

### Chunk F — Welfare + PPP exports (Sprints 6 + 7 bundled, ~5 days)

**Reason to bundle:** both are export-pipeline work (`@react-pdf/renderer`), both gated by capability, both depend on E1's shared components if any UI is needed. Bundling halves the pipeline setup cost.

- **F1** — Welfare fiscalía MPF (Sprint 6, ~4d):
  - **F1a** Spec + plan write-up (~0.5d). Investigate MPF format, denouncer attribution, field list.
  - **F1b** PDF template + server action + UI button on `/gob/maltrato/[id]` + audit log + notif (~3.5d).
- **F2** — PPP export provincial (Sprint 7, ~3d, mostly parallel to F1 once F1a defines the pipeline):
  - **F2a** Channel investigation (~0.5d): API existence check for CABA registro + Prov BA registro.
  - **F2b** Implementation (~2.5d). PDF export firmado by DIM if no API; auto-push with queue+retry if API exists.

**DoD:** Owner with PPP pet generates signed export PDF. Welfare officer generates fiscalía-ready PDF with publicCode + chronology + photos + geocoded location + Ley 14.346 citation. Inventory 6.9 → ✅, 13.2 → ✅. Audit log row per export.

---

### Chunk G — Bulk operations refugios (Sprint 8, ~5 days)

**Plan ejecutable:** ⚠️ write first.

Last sprint of the original master plan. Depends on Chunk B (foster_rls applied) and Chunk E (shared components) only loosely — runs anytime after them.

- **G0** — Pre-work (~1d): spec + plan. Decide API surface (CSV upload vs. multi-row selector vs. form repeater). Probable answer: multi-row selector + bulk action menu on the existing `/org/[orgToken]/mascotas` table.
- **G1** — Selector multi-row + bulk action menu (~1d).
- **G2** — Bulk vaccinate server action with tx + dry-run preview + per-row audit (~1d).
- **G3** — Bulk listing publish/pause/edit (~1d).
- **G4** — Stress test 200 pets in <5s + transaction-safety verification (~1d).

**DoD:** 200-pet bulk vaccinate completes inside a single tx under 5s on staging. Dry-run preview shown before commit. Inventory 14.4 → ✅.

---

## Sequencing summary

```
A (infra hardening, 2d)
  ↓
B (cheap wins, 1.5d) ────→ D (/adoptar audit, 1d)
  ↓                        ↓
C (vaccine-due, 3d) ───────→ E (govt dashboards, 6-7d)
                              ↓
                              F (welfare + PPP exports, 5d)
                              ↓
                              G (bulk ops, 5d)
```

- **A** is the only chunk that must run first.
- **B, C, D** are independent of each other; do them in any order after A.
- **C** can run in parallel with B+D if a second CC session is available.
- **E** is the big one and depends on nothing critical (skeleton exists, shared components are new).
- **F** depends on E's `<MetricCard>` etc.
- **G** depends on B (foster_rls) and benefits from E's components.

**Critical path:** A → C → E → F → G ≈ 21 days of CC.
**Parallel-optimised:** A → (B+C+D in parallel) → E → F → G ≈ 18 days.

---

## Diferidos (re-confirmed from master plan)

Carry over from `2026-05-20-master-execution-plan.md`:

- ❎ Adoption handshake unificado (28-question wizard) — owner decided 4 fields suffice. Plan in `2026-05-20-adoption-handshake-unified.md` stays for reference.
- ⚪ Mi Argentina OAuth — depends on Argentina.gob.ar SSO.
- ⚪ DNI verification real (RENAPER) — depends on provider choice.
- ⚪ 3 case_kinds: `custody_episode`, `foster_proposal`, `outbreak_investigation` — wait for operational demand.
- ⚪ Lost-pet broadcast distribution — after D + foster-pool coverage zones.
- ⚪ Native mobile (React Native) — when PWA hits iOS push limits.

---

## Doctrine reminders

Every chunk PR respects:

- **DP1–DP13** (Poncho design principles, copy-pasted from master plan; see that file's §"Reminder de las decisiones doctrinales").
- **Events are forever** — correction = new event, never mutation.
- **Spanish UI, English code.**
- **Tests per server action**: unit + integration, happy path + 2 typical failures.
- **Audit log row** per institutional action.
- **RLS verified** via `pnpm rls:smoke` before merge.
- **Coverage thresholds** (added in Chunk A1) must hold; CI fails on regression.

---

## Closing the loop

After each chunk:
1. Update `docs/feature-inventory-2026-05-20.md` entries to ✅.
2. Move the chunk's executable plan to `docs/superpowers/plans/archive/`.
3. Append a one-line summary to this file's "Reality check" table so the next CC session sees an honest baseline.
