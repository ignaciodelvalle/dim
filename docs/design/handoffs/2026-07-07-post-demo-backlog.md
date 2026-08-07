# Post-demo backlog (2026-07-07)

Consolidated from the admin/govt persona reviews + the final-acceptance triage. Ordered by value; each carries WHY it's post-demo (not "someday" — a real reason it wasn't safe to do the morning of the demo).

## Taken NOW (safe, done or in-flight)
- ✅ **Canonical rabies number** — the analytics all-species tile now has its own label + no shared 80% target (kills the 42%/54% same-label collision). Committed.
- 🔄 **es-AR enum sweep** on govt/admin surfaces (`dog`/`lepto`/English KPI labels → es-AR) — display-layer, in-flight.
- 🔜 **`/gob/perdidas` actionable list** — surface the `CAS-` code + a case row so a govt user finds "Pipa perdida hoy" without drill-down. (Doing after the es-AR sweep to avoid a /gob lane collision.)
- 🔜 **Home summary honesty** — "Todo en orden" vs "0 de 10 al día" reconciliation on /inicio. Minor. (Same /gob-adjacent pass.)
- 🔜 **Govt moderation Phase 0 placeholder** — an honest "próximamente" `/gob/moderacion` entry (see the SDD doc). After the sweep.

## Needs SDD → placeholder now, full build later
- **Govt jurisdiction moderation** — the province owns its denuncia funnel. SDD written: `2026-07-07-govt-jurisdiction-moderation-sdd.md`. Phase 0 placeholder ships now; phases 1-2 (read-only queue → triage actions) are an authz + policy build. WHY not now: touches jurisdiction-scoped authz (the exact class we hardened in Wave A/F — regressing it is a security risk), needs the override/audit policy decided.

## Value, but genuinely RISKY the morning of a demo → daylight, with QA
- **Bundle-size (lazy-load maplibre-gl + code-split recharts)** — real perf win, but dynamic-importing the map risks an SSR/hydration break on **Panorama, the demo centerpiece**, and it can't be screenshot-verified while a cohort holds :3000. WHY not now (even greenlit): a demo user won't notice a few hundred KB, but WILL notice a broken map — wrong risk/reward on demo day. Daylight job with a real device + screenshot pass.
- **Rabies coverage "currently-valid" tightening** — the canonical 42% counts any dose in a trailing 12m, not a check against each dose's real `next_due_at` expiry. Defensible (12m ≈ the annual Ley 22.953 dose), but a strict epidemiologist would want true expiry. WHY not now: this changes the definition of the **star compliance number** the day before a demo — never move that under someone the night before. Metric-refinement SDD, post-demo.

## Roadmap (features / integrations — real value, real scope)
- **Mi Argentina login** — institutional legitimacy; needs a convenio (external, not a code task).
- **Mascotas CABA street-atención integration** — the biggest felt gap in CABA: digitize who-was-attended-where on the vaccination truck. New capture flow.
- **SENASA / LSUCyF batch export** — schema is aligned; the real export (per campaign batch) is pending. Lets the funcionario stop double-loading the old form.
- **Campaign management UX (gov-side)** — surfaces exist; the create→assign-turnos→measure-attendance loop is incomplete.
- **Persona/journeys doc for the GCBA/province pitch** — distill Cursor's persona review into a pitch artifact (3 profiles: sanitario, bienestar, analista). Doc, not code — high pitch value.

## Earlier deferrals (carried, still valid)
- st-token range-snap bulk (~2394 px→token, daylight screenshot job) · crisis-e2e (test-infra) · repo hygiene (134 branches, destructive) · /admin "Decisiones 7d" drill + /org "Disponibles" KPI (structural, not the primary govt demo path) · sync-PPP-async (timeout bump is correct) · lib/projections self-overlay (edge).
