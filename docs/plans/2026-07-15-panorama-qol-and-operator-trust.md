# Plan: Panorama QOL nightly batch + operator-trust fixes

**Date:** 2026-07-15 · **Branch base:** integration/all-20260703
**Sources:** the "regaladas" inventory (Explore + Cursor cross-check, engram `panorama/qol-regaladas-inventory`) + Cursor's live QA passes:
`docs/reviews/2026-07-15-cursor-qa-admin-official-roles-fresh.md` (admin + govt emergency) and
`docs/reviews/2026-07-15-cursor-qa-owner-vet-org-checklist.md` (owner / vet / org).

Three bodies of work. **Slice P0 (owner/vet/org blockers) + Slice T (operator trust) are the staging priority** — real users and funcionarios hit these. Slice Q (QOL + map disaggregation) is additive value once trust holds.

---

## DONE ALREADY (this session — do NOT redo; VERIFY the ones Cursor still flags)

- Wiring QOL shipped: PPP + mortality vistas/KPIs, map scale + fullscreen controls, clinic reference pins.
- Camera fix: vista switch no longer yanks to national; default to widest jurisdiction.
- Wave 4 (earlier today) already shipped: SLA honest headline, novedades grouping, cron help copy, gob jurisdictions chip, outbox retry feedback, decisiones-0 neutral, site-map clickable.

**Cursor still reports these as broken — RECONCILE before re-implementing (regression or incomplete):**
- **Crons in FALLO are the ROOT CAUSE of the outbox cluster.** The fresh admin review connects it: `process_eno_queue` down → ENO never drains → outbox `Intentos` stays 0 → "Reintentar" is a no-op that gives false control. So A1 (retry no-op) is DOWNSTREAM of A2 (crons down). **First question to settle: are the crons FALLO because local has no scheduler (a QA artifact) or a real bug?** That decides whether A1/A2 admin are prod bugs or local noise. Do NOT "fix" retry before answering this.
- **Outbox "Reintentar" lands on /login** — NOT reproduced in the fresh pass (it shows "Programando…" → Intentos=0, no toast, no /login). Likely a transient session drop, not deterministic. The real issue is the missing feedback + the crons-down root cause above.
- **Cron copy still points to Vercel/curl.** We rewrote the cron help copy (Wave 4). Cursor still sees curl/CRON_SECRET (M6). VERIFY: did the copy change cover THIS path, or is there a second cron-error surface? Also: Cursor wants a BANNER (not just detail copy) — that part is genuinely new (T3).
- **Novedades still 20 identical rows.** We shipped grouping; the fresh pass did not re-test it. VERIFY the grouped fetcher is the one rendering on the surface Cursor tested (admin home vs gob home).
- **Seed drift (not UI):** `govt-local@dim.test` has only Palermo in the DB (missing La Plata the seed documents); casos show seed names (`PANO-Seed-Owner`, `*-gen-*`). Re-seed / filter test rows — I3 territory.

---

## SLICE P0 — Owner / Vet / Org blockers · the top staging priority (real users)

From `2026-07-15-cursor-qa-owner-vet-org-checklist.md`. These are bugs a real user hits, not polish.

### P0-1 — Date default in UTC blocks forms in the AR evening (the worst one)
After ~21h AR, a form's default date resolves to UTC "tomorrow" → the form rejects "la fecha no puede ser futura." Reproduced on owner `?sheet=peso`; same trap in intake / bite / vaccine. **Any real user loading anything at night is blocked.** Client-side default must use `America/Argentina/Buenos_Aires` (AR_TIME_ZONE), not UTC/`new Date()`. Sweep every form with a date default. This is the same timezone class we fenced server-side — extend it to client date-input defaults. **Do this first.**

### P0-2 — Service detail page crashes
`/org/[orgToken]/servicios/[serviceToken]` throws (error digest 3955119939) → generic error boundary; the list shows the service as "Aprobado" but you can't open it. Find the throw (likely a null/undefined in the service detail loader or a missing cupos/agenda relation) and fix; the page must render the service + a link to agenda/cupos.

### P0-3 — Clinic signature doesn't project as "official" on the owner credential
A clinic-signed rabies vaccine shows "DECLARADA · sin firma de matrícula" on the owner's credential, while `/org/.../atender` copy implies "firmado/verificado por profesional." Either the provenance projection is wrong, OR (per the H1 keystone) a clinic without a personal matrícula legitimately doesn't reach the "verificado" bar — in which case the ATENDER copy is the bug (it must not promise a stamp the projection won't grant). Decide which; make copy and stamp tell the same story. Do NOT re-litigate the H1 provenance policy — just close the copy↔stamp contradiction.

### P0 re-test gate
Cursor's matrix §3 (V1–V4 clinic, R1–R4 refugio, O1–O2 owner) must reach PASS after P0-1/2/3, with `pnpm verify` + `pnpm test` green in the closing PR.

### Owner/vet/org P1–P2 (fold into a second PR)
- Clinic nav shows refugio-only surfaces (Ingresos/Censo/custodia/adopción) that don't apply — trim to Panel·Agenda·Atender·Servicios·Mordeduras·Miembros·Cobertura·Config (B1).
- Agenda empty state is a dead-end — add a CTA to materialize cupos / go to Servicios (B2).
- Wizards show "Paso N de 4" with ALL fields in the DOM (intake, bite, publish) — one step visible at a time or drop the lying counter (B3/E2).
- Dangerous-action ordering: "Finalizar adopción" heads the Acciones list on a just-ingested pet; a pet row shows 5 actions at once — primary 1–2 + a ⋯ menu, staged order (C1/C2).
- Post-publish the listing form wipes to 0/5000 instead of rehydrating the saved listing (C3).
- Owner welcome says "registrá tu primera mascota" with N pets present; brand MiMAR; "Asentar" vs "Anotar" verb split; anotar quick-chips duplicate the long list (D1/D4/D5).
- **D2 — carousel shows 8 pets vs the index's 14 active: two surfaces use different "live" filters. A real projection inconsistency (label=number canon) — reconcile the filter.** (Elevate; not just polish.)
- a11y "POR VENCER" on PPP when race/weight is simply missing — copy should read "faltan datos / completar," not "vencido" (D3).

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

## SLICE G — Govt scope honesty + emergency triage

### G0 (ALTO — emergency blocker, from the fresh admin review) — Panel "N pérdidas" ≠ /gob/perdidas empty listing
The panel KPI says "3 activas" but `/gob/perdidas` lists **(0) / Sin resultados** (default 30-day filter), while the regulatory-cases panel DOES show lost pets (Firulais, Luna…). In a real lost-pet emergency the operator believes there are cases and the queue is empty. Reconcile: the KPI count and the listing must use the SAME query/filter window, or the listing default must not hide what the KPI counts. **This is the #1 emergency-triage bug.**

### G0b (ALTO) — Critical denuncia open 5 days, "Sin asignar," yet already derived to an org
`DEN-9KSC-MRMZ` (crítica, peleas de perros): Estado Abierta, Asignado "Sin asignar", edad 5 días — and simultaneously "Ya derivada a Mascotas BA Centro." Ownership is ambiguous: who owns the case after derivation? Make the status reflect derivation (a derived case is not "sin asignar"), or show the holding org as the assignee.

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

### Q7 (PO direction, reframed from "heatmap") — Disaggregate the giant province marks to the finest HONEST granularity
The PO sees ~1 giant mark per province at wide zoom (the province LOD rollup band). Goal: show the maximum granularity we can, bounded by two hard limits — **performance** and **privacy**. Reframed away from a kernel-density heatmap (which would fake sub-locality smoothness we don't have) to **locality-centroid disaggregation**:

- **The granularity we can honestly reach = LOCALITY** (via `ar_localities` centroids), for any layer whose rollup already computes per-locality. Province is today's coarse band; locality is the next honest step. Sub-locality (barrio/address) does NOT exist for most data and would break privacy — do not attempt.
- **Performance limit:** a national locality rollup returns hundreds of cells (PBA alone ~135 partidos — the exact budget class we just fixed for cobertura). Rule: locality marks render only when AFFORDABLE — inside a drilled/scoped province (bounded), or served from the cube where it precomputes locality/department. National wide view stays province-aggregated. This is what the LOD "near band" already does for perdidas/mordeduras/denuncias; extend it to the layers that today only province-fill or have no points.
- **Privacy limit:** finer cells → more cells below k=5 → more suppression. That is CORRECT and now honest (the "Protegido (k<5)" hatch we fixed). Disaggregation surfaces more "protegido" holes, not more leakage.
- **Per-layer reach:** coord-bearing events (lost/bite/welfare) COULD show near-actual points at high zoom — but exact lost-pet / welfare-complaint locations are sensitive, so cap at locality-centroid or jittered-to-locality. Jurisdiction-only layers (rabies/steril/chip/ppp/mortality, zoonosis/sintomas — which persist NO coords) can only ever reach locality-centroid; province→locality is their full range.

**Net:** the deliverable is locality-centroid graduated symbols driven by the existing per-locality rollups, gated by scope/zoom affordability and k-anon. Effort **M** (new render for province-fill-only and point-less layers). **PO design decision still open:** for the coord-bearing layers, how far to push — locality-centroid only (safest) vs jittered-to-locality actual points (more granular, needs a jitter/privacy review). See the live discussion.

### DEFERRED until needed (PO decision): movilidad, adopción, custodia, credential-scans map layers — each needs a NEW per-locality geo rollup (M+), scans also privacy-bounded.

---

## Sequencing recommendation

1. **Slice T first, as a single pre-prod PR** (Cursor's own framing) — trust is the staging gate. Start with the T1/T3 reconciliation investigation (what Cursor sees vs what we shipped).
2. **Slices W + I + L + G** — a second operator-UX PR.
3. **Slice Q** — the nightly QOL run (Q1–Q6 are mechanical clones; Q7 heatmap is a spike with a design decision).

Every slice ends with the standard discipline: adversarial fresh review + `pnpm verify` + full suite + live validation on :3000 before it ships.
