# Playwright demo-hardening review — 2026-07-09

Read-mostly visual + content review of DIM/MiMAR operator surfaces and case-creation
comprobantes ahead of a funcionario outreach demo. Driven via Playwright against a fresh
production build on `http://localhost:3000` (the ~15 `/gob` commits on
`integration/all-20260703`).

Method: logged in as `govt@dim.test` (cobertura = 3 localidades: Tierra del Fuego, Santa
Cruz, CABA). Every `/gob` surface rendered **without an error boundary and with 0 console
errors**. The 7-lens rubric (propósito, honestidad, estados ocultos, claridad es-AR,
un-solo-producto, invariantes, privacidad) was applied per screen.

TL;DR: the changed dashboards are in good shape and mostly demo-ready. Two HIGH items need
attention before the demo (**adopciones funnel** and a **CSP-blocked script on the public
denuncia wizard**). The comprobantes and case-detail pages are honest and well-formatted.

---

## Fixed inline (mechanical copy swaps — no logic changed)

All were demo-visible strings leaking raw SQL / enum / table identifiers to a non-technical
funcionario (lens 4). The technical formulas remain in the ⓘ info tooltips.

| File:line | Before | After |
|---|---|---|
| `app/gob/poblacion/page.tsx:280` | `mascotas con pregnancy_status='in_progress'` | `preñez registrada y aún no cerrada` |
| `app/gob/adopciones/page.tsx:198` | `ownerships shelter_custody activas en la cobertura` | `custodias en refugio activas en la cobertura` |
| `app/gob/adopciones/page.tsx:222` | `adoption_finalized en el período y la cobertura` | `adopciones finalizadas en el período y la cobertura` |
| `app/gob/adopciones/page.tsx:486` | `Duración: COALESCE(ended_at, now()) − started_at para ownerships…` | `Duración: desde el inicio de la custodia hasta su cierre (o hasta hoy si sigue activa)…` |
| `app/gob/adopciones/page.tsx:609` | `No hay eventos adoption_finalized en el rango…` | `No hay adopciones finalizadas en el rango…` |
| `app/gob/poblacion/page.tsx:396` | `No hay eventos sterilization_performed en el rango…` | `No hay esterilizaciones registradas en el rango…` |
| `app/gob/vigilancia/page.tsx:578` | `No se registraron eventos movement_recorded en el rango…` | `No se registraron movimientos de mascotas en el rango…` |

`pnpm typecheck` green after the edits. `pnpm verify` NOT run because it ends in
`pnpm build`, which clobbers the live `:3000` server (documented failure mode) — run it in
the pipeline.

---

## Findings (ranked)

### HIGH

**H1 — Adopciones funnel is misleading and visually broken** · lens 2 (honestidad), lens 1
`app/gob/adopciones/page.tsx` · `lib/metrics/custody.ts:80`
- `funnelWithinUniverse()` caps each stage at `Math.min(100, …)`. With `intake=28`,
  `adoption=56`, `adoptionPct = min(100, 200) = 100`. Result: **every stage of the funnel
  reads "(100%)"** — "Ingresos 28 (100%) → Asignados 28 (100%) → Adopciones 56 (100%)" —
  which reads as a perfect pipeline when in fact adoptions are 2× intake (a non-cohort
  artifact). The disclaimer ("conteos de eventos independientes, no cohorte") does not undo
  the visual that everything is 100%.
- The "Adopciones finalizadas" bar uses `bg-ln-op-verde` (line 329) and renders
  **near-invisible in light mode** — the number says "56 (100%)" but the bar looks empty.
- **Reconciliation failure on the same screen**: the `TASA DE RETORNO` KPI = **1.8%**
  (1 devolución / 56 adopciones) while the funnel "Devoluciones" row = **3.6%** (1 / 28
  intake). Same event, two denominators, side by side.
- Recommendation: don't present intake→adoption as a % funnel when it's non-cohort; show raw
  counts, or normalize devolución to a single denominator, and give the adoption bar a
  visible fill.

**H2 — CSP blocks a dynamic script on the PUBLIC denuncia wizard (production build)** · lens 5
`/denuncias/nueva` · CSP in `middleware.ts` · test `e2e/csp-smoke.spec.ts`
- On every load of `/denuncias/nueva`, `/_next/static/chunks/7851.94565e622c443aaf.js` is
  **blocked** by `script-src 'self' 'nonce-…' 'strict-dynamic'` (3 retry attempts, all
  blocked). Reproduced on a clean reload.
- The MapLibre location map, address autocomplete, and full submission all still work — so
  the blocked chunk is a *different* lazy component that degrades silently. But it is a
  recurring, visible CSP violation on the flagship citizen flow (looks bad if a funcionario
  or journalist opens devtools) and a latent risk that some lazy feature silently fails.
- Recommendation: identify which dynamic import emits chunk 7851, fix nonce/strict-dynamic
  propagation for it, and extend `csp-smoke` to assert zero CSP violations on
  `/denuncias/nueva`.

### MED

**M1 — Analytics province rabies ranking: duplicated tables + CABA missing** · lens 1, lens 2
`/gob/analytics`
- "Mayor cobertura antirrábica" and "Menor cobertura antirrábica" show the **same two
  provinces reordered** (Santa Cruz 44%, Tierra del Fuego 43%). With only 2 covered
  provinces in the ranking, two ranking tables are pure duplication — collapse to one.
- **CABA is absent** from this ranking, despite being the largest covered jurisdiction
  (Belgrano alone = 492 activos; the whole brotes-históricos table is CABA). Meanwhile
  `/gob/programa`'s per-province table lists CABA Antirrábica = 64.3%. A funcionario
  comparing the two pages sees conflicting/missing CABA rabies coverage.

**M2 — Poblacion "Balance poblacional +3.619" conflates registration with population growth**
· lens 2 · `/gob/poblacion`
- Components: Altas nuevas +3.657, Nacimientos +0, Muertes −38. "Altas nuevas" are new
  **registrations** of existing animals, not new animals. The disclaimer only warns about
  natality underestimate, not that registration inflow ≠ population growth. Reads as "the
  population grew by 3,619."

**M3 — Casos list: mixed código formats** · lens 1/2 · `/gob/casos`
- Clean `CAS-6HKZ-DTFS` codes shown alongside raw synthetic IDs like
  `PANO-CASE-HIST-DEC-000364` as the visible CÓDIGO. Seed artifact, but demo-visible.

**M4 — Denuncia comprobante: código block duplicated** · lens 1
`/denuncias/codigo/[code]`
- The código + "Copiar código" + "Descargar comprobante" appear twice: once in the green
  "Tu denuncia fue registrada" box and again immediately below under the "Abandono"
  heading. Consolidate to a single action block.

**M5 — Home KPI delta indicators are dubious** · lens 2 · `app/gob/page.tsx`
- MORDEDURAS/10K: "0,1 ↑ +0% vs año ant." — an up-arrow / "Sube" on a **0%** change.
- OBSERVACIONES RÁBICAS ABIERTAS: "1 ↑ +1% vs semana ant." — a percentage delta on an
  integer count of 1 is not meaningful; show the raw delta or suppress the % for tiny counts.

**M6 — Panorama exposes an "(en desarrollo)" button in the demo** · lens 4 · `/gob/panorama`
- "Informe de situación (en desarrollo)" is an explicitly-unfinished feature visible on the
  flagship dashboard. Honest, but consider hiding it for the outreach demo.

**M7 — Vigilancia province filter doesn't reflect the applied URL param** · lens 2/4
`/gob/vigilancia`
- With `?province=AR-B`, the choropleth title reads "Buenos Aires" but the Provincia
  dropdown still shows "Todas". The control and the applied filter disagree.

### LOW

- **L1** — Panorama: "**1 celdas** con menos de 5 casos **ocultas**" — plural agreement wrong
  for count = 1 (should be "1 celda … oculta"). Needs conditional pluralization.
- **L2** — Home PPP tile: "33 de 81 **atestadas** · Ley 4078". "atestadas" is defensible
  legal terminology (`dangerous_breed_attested`) but risks lay confusion with the colloquial
  "atestada" (packed). Consider "acreditadas" / "con atestación" — PO call. NOT changed.
- **L3** — Vigilancia locality dropdown: mojibake / soft-hyphen artifacts in seed locality
  names ("Agustí­n", "Rí­o Salado", "Colonia San Martíi­n"). Data-quality, cosmetic, buried
  in a very long dropdown.
- **L4** — `/perdidas`: "116 activas / 0 últimas 24h / 0 últimos 7 días" reads oddly (all
  losses older than 7 days). Synthetic-data artifact, not a code bug.
- **L5** — Public credential Pampa: "ESTERILIZACIÓN Sí · Castrado/a" for a Hembra; the slash
  form is acceptable but "Esterilizada" reads cleaner.

---

## Per-surface verdict — demo-ready?

| Surface | Verdict | Note |
|---|---|---|
| `/gob` (home) | ✅ Yes | Decomposed zoonosis + PPP + microchip tiles present, honest caveats (padrón coverage). M5 delta caveats. |
| `/gob/vigilancia` | ✅ Yes | k-anon subregion + movement-corridors panel + honest "—" vs 0. Empty for AR-B (out of 3-locality scope). M7 filter-sync. |
| `/gob/poblacion` | ✅ Yes | Deworming coverage tile + upgraded choropleth. M2 balance framing. |
| `/gob/campanas` | ⚠️ Empty | Clean empty state, but **no campaigns in scope** → impacto-sanitario tile unverifiable; will look sparse in demo. |
| `/gob/analytics` | ⚠️ Mostly | Vet-access table present (map removed ✓) but **all 0 visits** (data gap); M1 ranking dup + CABA absence. |
| `/gob/adopciones` | ❌ Not until H1 | Funnel panel present but misleading/broken. |
| `/gob/panorama` | ✅ Yes | Flagship, polished dark cartography, role-aware preset, k-anon hatch, honest denominator + demo-data disclaimer. M6 en-desarrollo button. |
| `/gob/programa` | ✅ Yes | Folded ENO total present, honest data-quality + PII oversight sections. |
| Denuncia comprobante | ✅ Yes | Honest ("integración Ley 14.346 en desarrollo"), es-AR dates, clear código/status. M4 dup block. |
| `/gob/maltrato/[id]` | ✅ Yes | Excellent — labels synthetic data, privacy-aware "USO OFICIAL", append-only timeline, full triage + legal framing. |
| `/gob/casos/[id]` | ✅ Yes | Legal framework, opener identity, append-only timeline. |
| `/p/DIM-PAMP-0001` | ✅ Yes | Polished credential, tier badge, privacy note, medical summary. |
| Lost credential (`/perdidas` → `/p/…`) | ✅ Yes | Warm lost-mode theme, geolocation share with "no guardamos quién sos", última-vez-vista map. |

Org maltrato/mordedura comprobantes were not reached (would require org-account login);
conceptually the shared comprobante components (`app/(public)/denuncias/codigo/[code]`,
`CaseHeader`) render honestly on the surfaces that were reached.

---

## Top demo risks (ranked)

1. **Adopciones funnel (H1)** — if the demo opens Adopciones, the "everything is 100%" funnel
   with an invisible adoption bar and two conflicting devolución rates undercuts the
   data-honesty story the product is built on.
2. **CSP-blocked script on the public denuncia wizard (H2)** — a visible "blocked" script on
   the flagship citizen flow of a government site.
3. **Analytics duplicate ranking + CABA absence (M1)** — a sharp funcionario will notice two
   identical tables and the largest jurisdiction missing.
4. **Sparse data in the operator's 3-locality scope** — campanas empty, vet-access all-zeros,
   `/perdidas` 0 recent. Consider demoing with a scope that has richer data so surfaces don't
   read as unfinished.
5. **Balance poblacional framing (M2)** — easy to misread as real population growth.

## Overall verdict

**Demo-ready with two must-fix items (H1, H2) and a scope/data decision.** The core operator
narrative — panorama, vigilancia, maltrato triage, case details, public + lost credentials,
denuncia comprobante — is honest, polished, and holds up to the 7-lens rubric. Fix the
adopciones funnel, resolve (or at least silence) the CSP violation on the denuncia wizard,
and pick a demo scope with enough data to avoid empty/all-zero panels.
