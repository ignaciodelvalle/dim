# Reviews & hardening handoff — post-owner-slice

> Date: 2026-07-01 · Audience: Claude Code, autonomous. Six independent workstreams (WS-A … WS-F) covering the next review/hardening backlog after the owner compliance-first slice.
> Grounded in a read-only pass of the repo at commit `a5544625` (H1–H4 landed). Each WS is scoped so it can be picked up alone, in the order given (leverage-first).

## Timing & safety (read first)

- **Do not start until the current owner batch is committed.** At write time the working tree still had uncommitted edits in `EventTimeline.tsx`, `ComplianceObligationsPanel.tsx`, `nav-presets.ts`, `lib/events.ts`, `pet-compliance.ts`. These six WS touch *different* files, but land them on a clean tree.
- **Auto-fix vs escalate.** Each WS marks what CC may fix directly vs what must come back to the owner (Ignacio) for a decision. Security posture and anything touching RLS/migrations is **audit-first**: propose, prove with a test, don't silently broaden access.
- **Global gate.** `pnpm verify` green after every WS (typecheck + all lints + build). Never weaken an existing gate or test to make it pass.
- **Out of CC scope (human-owned):** the demo/thesis narrative review (which 3 screens tell the story) — that's Ignacio's call, not a code task. Noted here only so it isn't lost.

Priority order: **A → B → C** (highest leverage / demo + gov credibility), then **D → E → F**.

---

## WS-A · Security & privacy review (🔴 highest leverage toward "gov-grade")

**Goal.** Turn single-layer authorization into a proven double layer, and confirm no PII leaks through event payloads.

**Current state (verified).** 6 RLS policy files exist (`db/rls.sql`, `cases_rls.sql`, `foster_rls.sql`, `organizations_rls.sql`, `scheduling_rls.sql`, `welfare_rls.sql`); 45 tables in `db/schema.ts`. Drizzle runs as service-role and bypasses RLS by design, so each `actions.ts` / module is today the only gate (June finding S2). PII-in-payload reads found so far use opaque IDs (`applicant_user_id`) and non-PII fields (`vaccine_name`, `locality`) — better than S3 feared, but must be confirmed exhaustively.

**Method.**

1. **RLS inventory (first, authoritative).** A raw grep undercounts because `ENABLE ROW LEVEL SECURITY` lives in migrations. Produce a table: for each of the 45 tables → RLS enabled? policies present? Output to `docs/architecture/rls-coverage.md`. Flag the **sensitive set** lacking a backstop: `profiles`, `ownerships`, `pets`, `pet_events`, `pet_identifications`, `welfare_*`, share/scan tokens.
2. **RLS backstop (S2).** For the sensitive set, add RLS as defense-in-depth (keep the action edge as primary). One migration, policies mirroring the action-layer authorization. **Escalate the policy semantics to Ignacio before applying** — getting an RLS predicate wrong can either leak or lock out. Do not run the migration against any shared DB without sign-off.
3. **Cross-tenant e2e (T3) — the proof.** Add `e2e/cross-tenant-isolation.spec.ts` cases per role: owner A must not read owner B's pet/events/identifications via any route or JSON/error path; anon must not see privacy-flagged lost location. This is the single most valuable test for the whole system — write it even before the backstop lands (it should pass on the action layer; then prove it still passes with RLS on).
4. **PII-in-payload audit (S3).** Grep every `payload->>` / `.payload` read in `src/**` and `app/actions/**`; for each, confirm the returned shape is a redacted projection, not the raw payload. Specifically re-verify adoption-application events (`src/modules/adoption/infrastructure/adoption-repository.ts`) never return applicant name/phone/address. Auto-fix: project PII out of returned shapes. Keep the immutable event intact.
5. **Scan retention (S5) + lost-location flag (S4).** Confirm `credential_scanned` payloads store no IP/lat-lng and define a TTL purge; push `discloseLastLocationWhenLost` into the query predicate, not just the view layer.

**Acceptance.** `rls-coverage.md` exists; sensitive tables have RLS + a passing cross-tenant e2e proving denial at two layers; no `payload->>` read returns raw PII; scan/lost-location findings closed or ticketed. `pnpm verify` + `lint:rls` + `lint:authz` green.

**Escalate:** RLS policy semantics; any migration; any change that would broaden who can read a table.

---

## WS-B · Flow-completeness / usability walkthrough (🔴 protects the live demo)

**Goal.** Every actor's primary loop completes with proper empty / loading / error / confirmation states and no dead-ends. This is UX, not just QA.

**Method — walk each loop and file gaps, then fix the presentational ones:**

- **Owner:** `Mis mascotas (/inicio)` → pet compliance panel → "Programar turno" sheet → booking → back to "Turno reservado" → historial. Check: sheet close returns focus; booking cancel reverts state; empty pet list; a pet with zero events.
- **Vet (solo):** org agenda-first landing → appointment → attend form emits event. Check: empty agenda copy (already "No hay turnos para hoy…"); attend error state.
- **Org:** role-first landing per capability → primary queue. Check: a member with a single capability doesn't see the empty 5-section wall.
- **Lost & found (June U3, known gap):** `/p/[token]/encontre` and `/p/[token]/sighting` lack a back/breadcrumb and a "what happens next" confirmation — the moment a stranger needs reassurance their report reached the owner. **Auto-fix:** add a closure screen ("El dueño va a recibir tu contacto") + back affordance; test the 320px viewport (no h-scroll, targets ≥44px).

**States to standardize (citizen skin):** empty → `LnEmptyState`; loading → existing skeleton (`aria-busy`); error → inline message with retry, never a silent failure. Reuse existing primitives; no new tokens.

**Acceptance.** A written walkthrough note (`docs/design/flow-audit-2026-07.md`) listing each loop with ✅/gap; the lost&found confirmation + back shipped and tested at 320px; `pnpm verify` green.

**Escalate:** any gap whose fix changes a flow's steps or a server action (bring the proposed flow change back first).

---

## WS-C · Operator accessibility audit (🟡 legal gate — Ley 26.653)

**Goal.** Extend axe/WCAG 2.1 AA coverage to the authenticated operator surfaces, which are currently uncovered.

**Current state (verified).** axe covers operator *redirect targets*, `/anotar`, owner-shell, public-smoke — but **not authenticated `/gob/*`, `/admin/*`, `/org/*`** (the `e2e/a11y-operator-auth.spec.ts` header comment says exactly this: "add authenticated axe passes … here"). June U1: dense operator tables lack `<th scope>`/`<caption>`/keyboard nav; KPI/severity use color alone (WCAG 1.4.1).

**Method.** Add authenticated axe passes for representative `/gob`, `/admin`, `/org` routes. For each violation: add table semantics (`<caption>`, `<th scope>`), ensure every status/severity carries icon+text (not color alone), verify keyboard nav + focus order on the operator rail and dense tables. Operator skin (`ln-op-*` / `Op*`) — do not touch citizen surfaces.

**Acceptance.** Authenticated operator routes are axe-clean (no critical/serious); the color-only-status instances are gone; `pnpm verify` green. Reference the fix set against June U1.

**Escalate:** none expected — a11y fixes are auto-approved. Flag only if a fix would require restructuring a shared `Op*` primitive (coordinate so it doesn't collide with the F1 token work in WS-F).

---

## WS-D · Projection integrity review (🟡 the event→view backbone)

**Goal.** Every pure projection is unit-tested and honest about provenance (the compliance panel just showed a "prende por presencia" bug class — check the rest).

**Current state (verified).** `lib/projections/` has 10 modules, only 2 tested. Untested: `pet-adoption-eligibility`, `pet-microchip`, `pet-pregnancy`, `pet-rabies-observation`, `pet-status`, `pet-tattoo`, `pet-weight` (`types` is not a projection).

**Method.** Table-driven unit tests (mirror `pet-compliance.test.ts`) for each untested projection, covering edge cases: no events, out-of-order events, amended events, and — where a projection asserts a *status/fact* — whether it should require verified provenance like WS-H1 did (e.g. `pet-microchip`, `pet-status`). For any projection found clearing a fact on mere presence where provenance should matter, **flag it (don't silently change semantics)** — list them in the test PR description for Ignacio.

**Acceptance.** All 7 projections have passing tests; a short note lists any provenance-honesty gaps found (analogous to H1) for a follow-up decision; `pnpm verify` green.

**Escalate:** changing any projection's meaning (provenance gating) — propose, don't apply.

---

## WS-E · Test-runner reliability (🟡 trust in CI before pilot)

**Goal.** Get the integration suite back to minutes and zero worker-exit noise (June T1: ~5h, 311 "worker exited" errors).

**Current state (verified).** `vitest.config.ts` runs `fileParallelism: false` with a `globalSetup`; helpers `db-overrides.ts`, `expect-db-error.ts`. The instability is classic Postgres pool exhaustion / non-idempotent teardown.

**Method.** Audit `__tests__/global-setup.ts` and `_helpers` for connection cleanup and state isolation between files; ensure every test that opens a pool closes it; cap worker lifetime; make teardown idempotent. Target: suite in minutes, no worker-exit errors.

**Acceptance.** `pnpm test` completes in minutes with 0 "worker exited" lines and all assertions green; document the fix in the test helpers.

**Escalate:** if the fix needs a different test-DB strategy (e.g. per-file schema) — propose the approach first.

---

## WS-F · Design-system token unification (🟢 makes "one ledger" look unified)

**Goal.** One semantic state layer so "al día" is the same green for citizen and operator (June F1). Also unblocks the operator critique's F1.

**Current state (verified).** Two parallel state ramps in `app/globals.css`: `--color-ln-(ok|warn|err)` (citizen, ~21 refs) and `--color-ln-op-(ok|warn|danger)` (operator, ~18 refs), hand-maintained, slightly different hexes. `--color-ln-op-warn` has no recorded contrast audit (citizen `ln-warn` was darkened to `#96600e`, 5.28:1).

**Method (token-only — the cheap path).** Introduce semantic aliases (e.g. `--color-state-ok/-warn/-err`) that both `Ln*` and `Op*` consume; point both skins at one audited value per state. This propagates through the primitives without touching component files (token ratchet). Run/record a contrast audit for the operator warn on its bg. Coordinate with WS-C so operator a11y fixes and this token change don't collide.

**Acceptance.** Both skins render the same audited state colors via shared aliases; `docs/a11y/contrast-audit.md` updated; `pnpm verify` + `lint:tokens` green; no component files needed raw-value edits.

**Escalate:** if unifying reveals a state where citizen and operator genuinely need different hues (rare) — confirm before diverging.

---

## Suggested sequencing

WS-A and WS-B in the same push (security proof + demo-safety) → WS-C (a11y, legal gate) → then WS-D / WS-E / WS-F as independent hardening. Each ships with its own tests and a one-line note in `docs/`. Re-run the full `pnpm verify` at every boundary; keep the cross-tenant e2e (WS-A) green from the moment it's written.
