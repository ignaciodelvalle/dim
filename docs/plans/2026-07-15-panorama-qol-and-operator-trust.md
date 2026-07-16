# Plan: Panorama QOL nightly batch + operator-trust fixes

**Date:** 2026-07-15 · **Branch base:** integration/all-20260703
**Sources:** the "regaladas" inventory (Explore + Cursor cross-check, engram `panorama/qol-regaladas-inventory`) + Cursor's live admin & govt QA passes.

Two independent bodies of work. Slice T (operator trust) is the priority for staging — it's what makes a funcionario believe the system works. Slice Q (QOL) is additive value once trust holds.

---

## DONE ALREADY (this session — do NOT redo; VERIFY the ones Cursor still flags)

- Wiring QOL shipped: PPP + mortality vistas/KPIs, map scale + fullscreen controls, clinic reference pins.
- Camera fix: vista switch no longer yanks to national; default to widest jurisdiction.
- Wave 4 (earlier today) already shipped: SLA honest headline, novedades grouping, cron help copy, gob jurisdictions chip, outbox retry feedback, decisiones-0 neutral, site-map clickable.

**Cursor still reports these as broken — RECONCILE before re-implementing (regression or incomplete):**
- **Outbox "Reintentar" lands on /login.** We shipped a Tier A `navigateAfterActionSuccess` reload. Cursor sees a redirect to /login mid-action. VERIFY: is the outbox detail route re-auth'ing on reload, or is the session genuinely dropping? This is the #1 trust bug — investigate first.
- **Cron copy still points to Vercel/curl.** We rewrote the cron help copy (Wave 4). Cursor still sees curl/CRON_SECRET. VERIFY: did the copy change cover THIS path, or is there a second cron-error surface? Also: Cursor wants a BANNER (not just detail copy) — that part is genuinely new.
- **Novedades still 20 identical rows.** We shipped grouping. VERIFY the grouped fetcher is actually the one rendering on the surface Cursor tested (admin home vs gob home).

---

## SLICE T — Operator trust ("did it work?") · the staging priority

Order = Cursor's own priority. Each is a work-unit commit.

### T0 (blocker) — Action-feedback contract, applied uniformly
Every primary operator action (reintentar, reconocer, filtrar, aprobar) must: show a pending label ≤100ms, then a success/error toast AND a visible field change. No silent no-ops. Audit the operator action islands for this contract; the outbox retry is the worst offender. Define/confirm the shared toast pattern (sonner is in deps) and apply it. **This subsumes the T "Reintentar" and several P0s.**

### T1 (blocker) — Outbox retry must never dump to /login
Tie to the reconciliation above. Retry stays on the detail page with a success/error toast; never a silent redirect to login. If the reload is what surfaces a flaky session, switch to an optimistic in-place update (Tier B) instead of a full-document nav.

### T2 (blocker) — Soft-navigation drops on dense operator lists
Cursor: clicking "Mapa del sitio → Sistema" and "Outbox → Detalle" focuses the link but stays on the page (sidebar/hard URL work). Find why these specific links soft-nav-drop (Next 15.5 silent-drop class we've hit before — lib/ui/sheet-nav.ts routes around it elsewhere). Fix so the click navigates.

### T3 — Crons-down banner (operator copy)
A single banner on /admin (Dashboard) AND /admin/sistema when any cron is in FALLO: "Procesos automáticos caídos · avisá a soporte." Curl/Vercel detail only under a collapsed "Detalle técnico". (The detail copy we already softened; the banner is new.)

### T4 — Omnibox empty state for a universal admin
Suggest formats (DIM-…, CAS-…, nombre + apellido); never imply a jurisdiction limit for SUPERADMIN. (We made it scope-aware; add the format hints.)

---

## SLICE W — Work queues that surface work first

### W1 (P0) — Observaciones defaults to "En curso"
/admin/observaciones badge says 1 but the list shows ~20 "Cerrada negativa" with the one "En curso" buried. Default sort/filter: Activas (en curso) first; closed behind a filter/tab. Audit the other queues for the same "closed items drown the active one" pattern.

### W2 (P1) — Dashboard attention hierarchy
Warm colors (pink/orange) reserved for "needs a decision now" (SLA vencidas, alertas vencidas, observaciones en curso). Treat Casos (494) as neutral inventory, not an alarm. Re-tone the cockpit tiles.

### W3 (P1/P3) — Outbox table honesty + SLA card lead
- Outbox: `Intentos = 0` on ENTREGADO/INCUMPLIMIENTO is confusing — show "—" when never attempted (or "entregado en el primer intento").
- Outbox detail: link pet/org/event IDs to human labels; raw UUIDs under a "Detalle técnico" disclosure.
- SLA card: lead with "12 vencidas ahora"; historical % secondary (Cursor says our current version still reads as "todo bien" because the big number is the %).
- Retry copy: plain es-AR ("Lo programamos para el próximo envío automático, hasta 5 min. Si los procesos automáticos están caídos, no va a salir."). No `next_retry_at` / "cron de drenaje" in the primary card.

---

## SLICE I — Identity & seed hygiene

### I1 (P1) — Usuarios shows email, not UUID
/admin/usuarios secondary line is a UUID — useless. Show email + rol + estado.

### I2 (P1) — Gobiernos needs a real search field
Footer says "refiná la búsqueda" but there's no search input; dozens of identical smoke rows make the page unusable. Add the search field (mirror the organizaciones one we just labeled).

### I3 (P1) — Demo-seed pollution in identity screens
/admin/usuarios and /admin/govts open with dozens of `uc-cd-admin` / `govt-dashboard-export` smoke rows (0 localidades). Filter "cuentas de prueba" or default-sort real operators with assignments first. (Seed-side + a UI filter — decide which; the UI filter is safer for prod where test rows shouldn't exist at all.)

---

## SLICE L — Locale & copy

### L1 (P2) — Date inputs dd/mm/aaaa
Alertas filters show mm/dd/yyyy — wrong for es-AR and produces wrong ranges. Sweep operator date inputs for the locale.

---

## SLICE G — Govt scope honesty

### G1 (E16) — Panorama out-of-scope URL: refuse + bounce, don't render a hollow shell
`?province=AR-X` for a govt without AR-X still "opens" Córdoba: map + caption say Córdoba, KPIs are —, the locality dropdown loads 526 Córdoba towns. The honest UX: a hard refuse + toast "No tenés acceso a esta jurisdicción" + redirect to an in-scope province — never render the foreign map/localities. (Server-side scope check on the panorama page for a govt actor; loop-safe — bounce to their widest jurisdiction, which the camera fix already computes.)

### G2 (E17) — Mordeduras KPI: rate rounds to 0 with n>0
"Mordeduras / 10k = 0,0" next to "5 reportes" reads as zero bites. When the rate rounds to 0 but n>0, show "<0,1" or "5 reportes · tasa <0,1".

### G3 (E18) — Actividad reciente collapses repeated PII searches
The feed is mostly "Búsqueda de información personal" (audit is correct, but noisy). Collapse repeats into "3 búsquedas · hoy" so real decisions stay visible.

---

## SLICE Q — QOL "regaladas" (nightly batch — additive value)

### Do now = DONE (wiring). Nightly batch (clone an existing fetcher into a layer):
- **Q1 — Vet-access "desierto de atención" choropleth** (S–M): `fetchVetAccessByLocality`, already locality-grouped + k=5. Care-inequity map, audit-defensible, no isochrone infra.
- **Q2 — Deworming (antiparasitario) coverage choropleth** (S–M): `fetchDewormingCoverage.byProvince` exists. 4th coverage axis; clone the `esterilizacion` path.
- **Q3 — Territorial composite-index choropleth** (S–M): `territorial-index.ts` computes the 0–100/province score; province-only (no k-anon, ≤24 rows). One-glance national scorecard.
- **Q4 — Scrubber activity histogram** (S–M): `fetchKpiTrend` per-bucket counts exist. The scrub stops being a blind slider.
- **Q5 — Per-capita toggle for density layers** (M): denominator exists (`census.ts` / `activePetsCondition`). The map stops being "where pets live"; small towns with high per-capita risk appear.
- **Q6 — Unit-history drill branches for sintomas/esterilización/microchip/ppp** (M): plumbing exists; these 4 layers drill empty today.

### Q7 (idea, PO-floated) — Heatmap for zoonosis/sintomas
Honest constraint: those events persist NO point coordinates (writers store none — deliberate), so a true kernel-density point-heatmap returns EMPTY. BUT a **locality-centroid-weighted heatmap** IS buildable: place a heat point at each `ar_localities` centroid weighted by the existing per-locality rollup. That's a new RENDER MODE (MapLibre heatmap layer over synthesized centroid points) — effort **M**, not free, but it reuses the rollup + centroids we already have. Worth a spike in the nightly batch: it answers "dónde se concentra" more legibly than graduated symbols for dense signals. Decision needed: is a centroid-weighted heatmap honest enough (it implies smooth spatial density we don't actually have at sub-locality resolution)? Recommend labeling it explicitly "densidad por localidad" so it never reads as GPS-precise.

### DEFERRED until needed (PO decision): movilidad, adopción, custodia, credential-scans map layers — each needs a NEW per-locality geo rollup (M+), scans also privacy-bounded.

---

## Sequencing recommendation

1. **Slice T first, as a single pre-prod PR** (Cursor's own framing) — trust is the staging gate. Start with the T1/T3 reconciliation investigation (what Cursor sees vs what we shipped).
2. **Slices W + I + L + G** — a second operator-UX PR.
3. **Slice Q** — the nightly QOL run (Q1–Q6 are mechanical clones; Q7 heatmap is a spike with a design decision).

Every slice ends with the standard discipline: adversarial fresh review + `pnpm verify` + full suite + live validation on :3000 before it ships.
