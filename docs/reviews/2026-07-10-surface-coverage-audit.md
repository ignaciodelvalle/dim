# Surface coverage audit — where to spend post-national "love"

**Date:** 2026-07-10 · **Branch:** `integration/all-20260703` · **Type:** READ-ONLY strategic map (no fixes, no build).
**Purpose:** rate every major user-facing surface on 4 axes so the post-national backlog targets *thin* surfaces, not already-solid ones.

## Method & evidence base

- **Route inventory:** 229 `page.tsx` under `app/` (glob).
- **E2E journeys:** the 6 demo specs `e2e/demo/01-publico … 06-admin` are the canonical role journeys; each was read and its visited routes recorded. Crisis/isolation coverage: `e2e/crisis-owner-lost-flow.spec.ts`, `crisis-public.spec.ts`, `crisis-seams.spec.ts`, `cross-tenant-isolation.spec.ts`, `auth-bypass.spec.ts`, `a11y-regression.spec.ts`, `create-pet.spec.ts`, `owner-shell.spec.ts`, `gob-case-detail-shell.spec.ts`, `synthetic-monitor.spec.ts`.
- **Unit/integration:** ~280 files under `__tests__/` (+ colocated `*.test.tsx`).
- **Reviews this session:** `2026-07-09-clickthrough-deep-review.md`, `2026-07-09-gob-admin-content-viz-audit.md` (all 80 gob/admin screens, file:line), `2026-07-09-playwright-demo-review.md`, `2026-07-10-comprobantes-info-quality.md`, `2026-07-10-security-pre-national.md`, `2026-07-10-jurisdiction-handoff-verification.md`, `2026-07-10-auth-floor-and-perf-breakdown.md`, `2026-07-10-national-deployment-batch-roundup.md`.
- **Love-signal grep** over `app/**` (excl. tests) for `TODO|FIXME|WIP|HACK|stub|en desarrollo|próximamente|no implementado`: 21 real hits. The overwhelming majority are the **Mi Argentina deferral** (intentional, gated, Batch-4) + normal `"Todos"` filter labels (false positives). Genuinely unfinished user surfaces are few.

### Axis legend
- **Rev** — reviewed this session? ✅ deep · 🟡 partial/cross-ref · ⬜ not reviewed.
- **E2E** — touched by a demo/crisis journey? ✅ full flow · 🟡 navigated only (no submit) · ⬜ none.
- **Unit** — representative `__tests__` coverage? ✅ strong · 🟡 partial · ⬜ none.
- **Love** — re-design/polish signal: ✅ polished · 🟡 minor gap · 🟥 open finding or stub.

---

## PUBLIC (unauthenticated)

| Surface | File | Rev | E2E | Unit | Love | Notes / evidence |
|---|---|:--:|:--:|:--:|:--:|---|
| `/` landing | `app/page.tsx` | ✅ | ✅(01) | 🟡 `inicio-structure` | ✅ | favicon 404 fixed (clickthrough). |
| `/adoptar` + `[petToken]` | `app/(public)/adoptar/**` | ✅ | ✅(01) | ✅ `adoption-listing`,`lost-listing` | ✅ | a11y run-on link name (LOW, open). |
| `/adoptar/[petToken]/postular` | `ApplicationForm.tsx` | 🟡 | ⬜ | ✅ `adoption-applications`,`apply-intent` | 🟥 | **APP-code decorative/unresolvable** (comprobantes MED, open). No e2e submit — 01 stops at login gate. |
| `/perdidas` + lost `/p` | `app/(public)/perdidas`, `p/[publicToken]` | ✅ | ✅(01, crisis) | ✅ `lost-*`,`pet-sighting-action` | ✅ | Seed geo placeholder fixed; strong. |
| `/p/[publicToken]` credential | `p/[publicToken]/page.tsx` | ✅ | ✅(crisis) | ✅ `public-token*`,`pet-access`,`tier2-public-action`,`disclosure-prefs` | ✅ | Security: server-side PII gating verified strong. a11y restored (token fix). |
| `/p/…/encontre`, `/sighting` | `FoundPetForm`, `PetSightingForm` | ✅(sec) | ✅(crisis) | ✅ `finder-in-possession`,`pet-sighting` | ✅ | Anon write hardening verified. |
| `/denuncias` + `/nueva` wizard | `denuncias/nueva/**` | ✅ | ✅(01) | ✅ `welfare-*`,`denuncia-*` | 🟥 | **CSP-blocked chunk 7851** (verified cosmetic, H2 open); `TODO(M-followup)` LocationFields refactor. |
| `/denuncias/codigo/[code]` receipt | `codigo/[code]/page.tsx` | ✅ | ✅(01) | ✅ `denuncia-receipt-rate-limit` | ✅ | Most mature comprobante. Rate-limit added (security MED-1 fixed). M4 dup código block (LOW open). |
| `/denuncias/buscar` | `buscar/page.tsx` | ✅ | ✅(01) | ✅ `tattoo-lookup`,`decomiso-pet-lookup` | ✅ | Enumeration resistance verified. |
| `/refugios` + `[orgToken]` | `refugios/**` | 🟡 | ✅(01) | ✅ `org-public-profile` | ✅ | Public shelter profile. |
| `/casos/[publicCode]` | `casos/[publicCode]/page.tsx` | ✅ | 🟡(gob path) | ✅ `case-public-code`,`case-access-public` | ✅ | Shared CaseDetailView, role-aware PII. |
| Static/legal (`/acerca /ayuda /leyes /funcionalidades /privacidad /terminos /cookies /accesibilidad /sugerencias`) | `(public)/**` | 🟡 | 🟡(01, most) | 🟡 `legal-knowledge-base` (leyes) | 🟡 | `/leyes` `/funcionalidades` NOT in any journey; low-risk static. |

---

## OWNER / CITIZEN

| Surface | File | Rev | E2E | Unit | Love | Notes / evidence |
|---|---|:--:|:--:|:--:|:--:|---|
| `/inicio` home | `(app)/inicio/page.tsx` | 🟡 | ✅(02) | ✅ `owner-home-nudges`,`greeting-first-name` | ✅ | Honest greeting logic. |
| Alta wizard `/mis-mascotas/nueva` | `MinimalNewPetForm.tsx` | ✅ | ✅(02, create-pet.spec) | ✅ `create-pet-custody`,`pet-pipeline` | ✅ | Province→locality cascade; dedup guard. Solid. |
| Credential / flip / libreta | `[publicToken]/page.tsx`, `EventTimeline`, FlipCard | ✅ | ✅(02) | ✅ `pet-profile-v2-*`,`libreta-*` | ✅ | Flip a11y roving-tabindex verified correct (was stale-token false alarm). |
| Vaccine/deworming capture | `eventos/nuevo/vacuna`,`antiparasitario` | 🟡 | ✅(02 vacuna) | ✅ `vaccine-*`,`antimicrobials`,`event-schemas` | ✅ | Deworming form not e2e-driven but unit-covered. |
| Other event captures (peso, sintoma, nota, clinico, microchip, tatuaje, esterilización, fallecimiento, medicación, embarazo, checkin, mordedura) | `eventos/nuevo/**` | ⬜ | ⬜ | ✅ `event-schemas`,`pregnancy-*`,`microchip-*`,`bite-cases-d2`,`death`… | 🟡 | Schema/action-tested but **no per-form e2e**; UI polish unverified individually. |
| `mordedura/exito` receipt | `mordedura/exito/page.tsx` | ✅ | ⬜ | 🟡 | 🟥 | **No case-reference code on bite receipt** (comprobantes LOW, open). |
| Historial | `[publicToken]/historial` | ✅ | ✅(02) | ✅ `event-queries` | ✅ | |
| Turnos booking | `turnos/buscar/**`, `reservar/[slotId]` | 🟡 | ✅(02) | ✅ `booking`,`booking-race`,`materialize-slots` | ✅ | End-to-end booking proven. |
| `/mis-turnos` + `[appointmentToken]` | `mis-turnos/**` | 🟡 | ✅(02 list) | ✅ `scheduling-attendance` | ✅ | Detail not deep-driven. |
| Denuncia (citizen) `/denuncias/mias` | `(app)/denuncias/**` | 🟡 | ✅(02) | ✅ `welfare-*` | ✅ | |
| Transferencias (owner) | `[publicToken]/_transfer`, `transfer` | 🟡 | 🟡 | ✅ `transferencias-outgoing`,`pet-transfers` | ✅ | |
| Lost flow (`/perdida`, cartel, mudanza) | `perdida/MarkLostWizard`, `cartel/PosterPreview` | 🟡(crisis) | ✅(crisis: perdida) | 🟡 `lost-pet-broadcast`,`set-pet-lost-coord-range` | 🟡 | Lost wizard e2e-covered; **`cartel` poster preview has no test and no review**. |
| **Asistencia / perro de servicio** | `[publicToken]/asistencia/**`, `ServiceDogForm.tsx` | ⬜ | ⬜ | ⬜ | 🟥 | **TRUE BLIND SPOT** — zero test, zero journey, zero review. "Reportado a RUPGA (ANDIS) — pendiente de sincronización y validación" (`asistencia/page.tsx:157`). ANDIS federal registry surface. |
| `/viaje` travel cert | `[publicToken]/viaje` | ⬜ | ⬜ | 🟡 `travel-export` | 🟡 | Export logic tested; page UI not driven. |
| Claim (`/reclamar`, `/reclamar-dni`) | `ClaimWizard`, `reclamar-dni` | 🟡 | ⬜ | ✅ `claim-gate`,`pet-claim` | 🟡 | Stub-profile claim; `reclamar-dni` header says "Stub-profile claim". Logic tested, UI not e2e. |
| Cuenta hub + subpages | `(app)/cuenta/**` | 🟡 | ✅(02 root) | ✅ `profile`,`profile-self-service`,`disclosure-prefs`,`subject-rights-rpcs`,`role-upgrade` | 🟡 | `/verificar-dni` is a **Mi Argentina placeholder** (`TODO(mi-argentina)`, gated). `/desactivar` `/renunciar` niche, not e2e. |
| Notificaciones | `(app)/notificaciones` | 🟡 | ✅(02) | ✅ `notifications*` | ✅ | |

---

## ORG / REFUGIO

| Surface | File | Rev | E2E | Unit | Love | Notes / evidence |
|---|---|:--:|:--:|:--:|:--:|---|
| Portal shell + panel | `org/[orgToken]/page.tsx` | 🟡 | ✅(03) | ✅ `org-dashboard`,`org-setup-checklist` | ✅ | Rail-nav fail-loud beat. |
| Intake wizard | `intake/IntakeForm.tsx` | ✅ | ✅(03 submit) | ✅ `intake-dual-write`,`intake-match-claim`,`intake-tattoo-match` | 🟥 | **Success screen never shows minted DIM code** (comprobantes MED, open); match-card accent nits (LOW). |
| Censo | `org/[orgToken]/censo` | ✅ | ✅(03) | ✅ `org-census`,`census-registry-counts` | ✅ | |
| Tránsitos / foster | `transitos`, `mascotas/[t]/foster*` | 🟡 | ✅(03 nav) | ✅ `foster-*`,`foster-e2e-flow` | ✅ | Show-only on camera; unit-strong. |
| Adopciones ops + review | `adopciones`, `[appEventId]` | 🟡 | ✅(03) | ✅ `adoption-review`,`adoption-cascade`,`bulk-listing-publish` | ✅ | |
| Adoption listing publish | `mascotas/[t]/adoptar/AdoptionListingForm` | 🟡 | ✅(03 submit) | ✅ `adoption-listing`,`bulk-listing-publish` | ✅ | Driven end-to-end. |
| Transferencias (org) | `transferencias/**` | 🟡 | ✅(03 nav) | ✅ `transferencias-inbox`,`cross-org-transfer`,`origin-org` | ✅ | Decomiso handoff actions present. |
| Check-ins / atender | `checkins`, `atender/CodeEntryForm` | 🟡 | ✅(03 checkins) | ✅ `checkin-action`,`CodeEntryForm.interaction` | 🟡 | `/atender` code entry not in journey. |
| Maltrato (org channel) | `maltrato/nuevo`, `recibidos` | ✅ | ✅(03 submit) | ✅ `org-welfare-report`,`welfare-*` | ✅ | New-case submit driven. |
| Mordedura (org) | `mordedura/nuevo/OrgBiteForm` | ✅ | ✅(03 submit) | ✅ `bite-cases-d2`,`chip-match` | 🟥 | **No case-ref code on receipt** (comprobantes LOW). Otherwise strong (noon-anchored dates, legal basis). |
| Casos (org) | `org/[orgToken]/casos` | 🟡 | ✅(03) | ✅ `case-*`,`welfare-cases-d1` | ✅ | |
| Mascotas mgmt + bulk | `mascotas`, `OrgMascotasBulkList` | 🟡 | ✅(03) | ✅ `bulk-actions`,`bulk-select`,`bulk-eligibility`,`bulk-vaccinate` | ✅ | |
| Eligibility / no-aptas | `mascotas/[t]/eligibility`, `pets/no-aptas` | 🟡 | ✅(03 nav) | ✅ `bulk-eligibility` | ✅ | |
| Servicios / cobertura / miembros / config | `servicios`,`cobertura`,`miembros`,`configuracion` | ✅(cobertura) | ✅(03/04) | ✅ `org-coverage`,`org-config`,`org-memberships`,`org-invitations` | ✅ | |
| Voluntarios | `voluntarios`, `propuestas` | 🟡 | ✅(03 nav) | ✅ `foster-proposal-*` | 🟡 | Foster-volunteer wizard. |

---

## VET (clinic org)

| Surface | File | Rev | E2E | Unit | Love | Notes / evidence |
|---|---|:--:|:--:|:--:|:--:|---|
| Service offering create | `servicios/nuevo/ServiceOfferingForm` | ✅ | ✅(04 submit) | ✅ `create-clinic-wizard`,`offering-capacity-sync` | ✅ | 3-step wizard driven; lands pending-approval. |
| Offering detail | `servicios/[offeringToken]/page.tsx` | ✅ | ✅(04) | ✅ `turnos-offering-detail-page` | ✅ | Timezone bug fixed (comprobantes F2). |
| Schedule rule / agenda | `servicios/[t]/agenda`, `agenda` | 🟡 | ✅(04 submit) | ✅ `materialize-slots`,`scheduling-attendance` | ✅ | Weekday rule submitted. |
| Attendance forms (vaccine/steril/microchip/deworm/generic) | `_components/attendance-forms/**` | 🟡 | ⬜ | ✅ `scheduling-attendance`,`vaccine-*` | 🟡 | Marking attendance is **show-only** in demo (never submitted); UI polish per-form unverified. |
| Mascotas in care | `org/[orgToken]/mascotas` | 🟡 | ✅(04 nav) | ✅ (shared org) | ✅ | |
| Vet upgrade / landing | `cuenta/upgrade/VetUpgradeForm`, `vet-landing` | 🟡 | ⬜ | ✅ `vet-landing-resolution`,`role-upgrade`,`migrate-vets-to-clinics` | ✅ | |

---

## GOVT (`/gob`)

> The entire 42-route gob surface got a **file:line per-screen content+viz audit** (`gob-admin-content-viz-audit.md`) — the deepest-reviewed cluster in the app. E2E: journey 05 navigates every console (read-mostly by PO decision; only new-investigation submits).

| Surface | Rev | E2E | Unit | Love | Notes / evidence |
|---|:--:|:--:|:--:|:--:|---|
| `/gob` panel | ✅ | ✅ | ✅ `govt-home-kpis`,`gob-home-filter-contract` | 🟡 | Empty "Vigilancia" aside card = link-only placeholder (mechanical, open); M5 tiny-count delta % dubious. |
| `/gob/panorama` | ✅ | ✅(map beat) | ✅ panorama vitest, `ws-perf`, `perf/*` | 🟥 | Reference surface. **"Informe de situación (en desarrollo)" button visible** (M6, open); MED-2 no aggregate rate cap on `panorama_api` (KNOWN, security). |
| `/gob/vigilancia` (+ brotes/zoonosis/investigaciones/nuevo/[caseCode]) | ✅ | ✅ | ✅ `surveillance-*`,`outbreak-*`,`eno-trigger`,`symptom-surveillance` | 🟡 | Subregion k-anon FIXED; zoonosis = near-duplicate (excess); `brotes` `TODO(future)` disease-chip filter; M7 province filter desync. |
| `/gob/programa` | ✅ | ✅ | ✅ `govt-dashboards`,`metrics-scope` | ✅ | Best govt summary; PII table truncated UUIDs (low actionability). |
| `/gob/analytics` (+ export) | ✅ | ✅ | ✅ `analytics-load`,`analytics-period`,`govt-exports` | 🟥 | M1 duplicated rabies ranking + CABA absent (open); **`/analytics/export` half-wired, "Parquet — proximamente"** (`ExportFormClient.tsx:117`). |
| `/gob/campanas` | ✅ | ✅ | 🟡 `outreach-pipelines` | 🟥 | **Shallow spine — appointments-only, not events** (known product gap); empty in demo scope; legend fixed. |
| `/gob/poblacion` | ✅ | ✅ | ✅ `population-control-amendment`,`govt-dashboards-percapita` | 🟡 | Honest natality caveats; M2 balance-framing risk. |
| `/gob/mortalidad` | ✅ | ✅ | ✅ `mortality-disposition` | ✅ | Strong; disposition-unknown breach honest. |
| `/gob/censo` | ✅ | ✅ | ✅ `census-registry-counts`,`gob-locality-scope` | 🟡 | "Activas" vs "Total" redundant. |
| `/gob/adopciones` | ✅ | ✅ | ✅ `adoption-*`,`govt-dashboards` | 🟥 | **H1: funnel caps every stage at 100% → reads "perfect pipeline"; invisible adoption bar (light mode); devolución 1.8% vs 3.6% reconciliation clash** (`lib/metrics/custody.ts:80`, `app/gob/adopciones/page.tsx`). Highest re-design item. |
| `/gob/outreach` | ✅ | ✅ | ✅ `outreach-pipelines` | 🟡 | Export-only, no in-app contact action. |
| `/gob/perdidas` | ✅ | ✅ | ✅ `lost-*` | 🟡 | "Recuperados (30d)" ignores period picker (mechanical). |
| Queues: `/gob/cola`(+detail), `maltrato`(+`[id]`), `moderacion`(+`[id]`), `casos`(+`[code]`), `disputas`(+`[token]`), `decomisos`(+`nuevo`/`[code]`) | ✅ | ✅(list+1 detail; decomiso/nuevo NOT on camera) | ✅ `admin-approval-queue`,`maltrato-*`,`welfare-moderation`,`case-*`,`custody-disputes`,`decomiso-*` | 🟥 | Maltrato detail = most mature. **`decomisos/nuevo` motive labels missing accents** (comprobantes MED, open); raw-UUID input fields (LOW). Shared gap: queue rows lack "why urgent" aggregates. |
| Ref: `reglas`(+nested), `usuarios`, `organizaciones`, `servicios`, `outbox`, `historial`, `sistema` | ✅ | ✅ | ✅ `jurisdiction-*`,`user-search-scope`,`outbox-drainer`,`govt-audit-scope` | 🟡 | `/gob/sistema` for govt duplicates programa (folds/redirects). Jurisdiction authz verified SOUND (handoff report). |

---

## ADMIN (`/admin`)

| Surface | Rev | E2E | Unit | Love | Notes / evidence |
|---|:--:|:--:|:--:|:--:|---|
| `/admin` panel | ✅ | ✅ | ✅ `admin-institutional` | 🟡 | Landing has no analytics KPIs (improvement noted). |
| `/admin/panorama` | ✅ | ✅(map beat) | ✅ panorama vitest | ✅ | Universal-scope variant of gob. |
| `/admin/programa` | ✅ | ✅ | ✅ `admin-analytics-perf`,`admin-sistema-fetchers` | ✅ | Adds forecast + cron runs. (Staging timeout was infra death-spiral, fixed.) |
| `/admin/censo /poblacion /adopciones` | ✅ | ✅ | ✅ (shared analytics) | ✅ | Universal-scope mirrors. |
| `/admin/alertas` | ✅ | ✅(fail-loud) | ✅ `alert-firings-*`,`alert-subscriptions` | ✅ | Closes loop from programa subscriptions. |
| `/admin/casos /moderacion`(+`[id]`) | ✅ | ✅ | ✅ `case-*`,`welfare-moderation` | ✅ | |
| `/admin/observaciones`(+detail/microchip) | ✅ | ✅ | ✅ `close-rabies-observations`,`microchip-replaced*` | ✅ | Legal 10-day compliance; high density. |
| `/admin/sistema`(+`/crons`) | ✅ | ✅(fail-loud, 21 crons) | ✅ `admin-sistema-fetchers`,`cron-*` (many) | ✅ | Recently-fixed crash guarded by e2e. |
| `/admin/outbox`(+`[id]`) | ✅ | ✅ | ✅ `outbox-*`,`outbox-breach-count` | ✅ | |
| `/admin/auditoria` | ✅ | ✅ | ✅ `keyset-pagination`,`admin-pii-audit-log` | ✅ | Universal audit trail. |
| `/admin/libro` (event ledger) | ✅ | ✅(fail-loud, amendment chain) | ✅ `amendment`,`pet-events-append-only` | ✅ | Best spine-transparency surface. |
| `/admin/usuarios /govts /admins`(+new/detail) | ✅ | ✅(lists) | ✅ `admin-org-verification`,`govt-roster`,`admin-revocations` | ✅ | `/new` creation forms not on camera. |
| `/admin/reglas`(+nested) | ✅ | ✅(1 drill) | ✅ `business-rules-*`,`jurisdiction-rules-href` | ✅ | Admin CRUD lens. |
| `/admin/inteligencia` | ✅ | ⬜ | 🟡 `institutional-scope` | 🟡 | Strong analytics per review, **but no dedicated test and not in demo journey**. |
| `/admin/acerca/integracion-miarg` | ✅ | ✅ | 🟡 | 🟥 | **Documented Mi Argentina stub** — non-hideable "vista ilustrativa" disclaimer; gated `miarg/callback` returns 501 (`TODO(25b)`). Intentional Batch-4 deferral. |

---

## Ranked "NEEDS LOVE" shortlist

Ordered by (thin-review ∪ thin-test ∪ open-finding) × user impact. Each item names the **smallest useful next step**.

| # | Surface | Why it's thin | Smallest next step |
|---|---|---|---|
| 1 | **`/gob/adopciones` funnel** | Open HIGH (H1): every stage shows 100%, invisible adoption bar, two contradictory devolución rates on one screen — directly undercuts the data-honesty story. `lib/metrics/custody.ts:80`. | **Re-design**: drop the %-funnel (non-cohort), show raw counts + one devolución denominator + a visible bar. |
| 2 | **Owner `asistencia` / perro de servicio** | **TRUE BLIND SPOT** — zero test, zero e2e, zero review; ships a RUPGA/ANDIS "pendiente de sincronización" surface. `[publicToken]/asistencia/**`. | **Review first** (is the ANDIS surface honest/complete?), then add 1 unit + 1 e2e beat. |
| 3 | **Adoption applicant submit** `/adoptar/[petToken]/postular` | APP-code decorative/unresolvable (MED open); **no e2e journey** exercises citizen postulación end-to-end. | **Fix copy** (soften or wire APP lookup) + add an applicant e2e leg (owner2 → postular). |
| 4 | **Intake success screen** | Missing minted DIM code — the receipt's key datum (MED open, KNOWN). `IntakeForm.tsx:138-170`. | **Small fix**: render the `code` prop (LnSuccessScreen already supports it). |
| 5 | **`/gob/campanas`** | Shallow appointments-only spine (no event projection) + empty in demo scope; reads unfinished. | **Product-decision then wire** `vaccination_administered`/attendance events; interim: richer demo scope. |
| 6 | **Bite receipts (owner + org)** | No case-reference code on a quasi-legal rabies-observation trigger (LOW open, KNOWN). | **Small fix**: surface the case/incident handle on both success screens. |
| 7 | **Per-form owner event captures** (peso, síntoma, clínico, microchip, tatuaje, medicación, embarazo, fallecimiento…) | Schema/action-tested but **no per-form e2e**; individual UI polish/empty-states unverified. | **Broaden e2e**: a parametrized capture-form smoke pass (one submit each). |
| 8 | **`/analytics/export` (+ Parquet)** | Half-wired, "proximamente"; header says unreachable while analytics links to it. | **Decide**: finish-or-hide the export entrypoint. |
| 9 | **`decomisos/nuevo` labels** | Motive labels missing es-AR accents on a Ley 14.346 legal artifact (MED open, KNOWN). `DecomisoForm.tsx:82-90`. | **Copy sweep** (with a label test to prevent regression). |
| 10 | **Owner `cartel` (lost poster) & `viaje`** | Poster preview: no test/no review; travel page: only export logic tested. | **Light review + 1 smoke test each.** |

---

## SOLID — leave alone (well-covered on ≥3 axes)

- **Panorama** (gob + admin) — deepest-reviewed, perf-hardened, security-verified, e2e map beat, panorama vitest suite.
- **`/p` public credential** (active + lost) — reviewed, crisis e2e, strong unit + a11y, server-side PII gating verified.
- **Denuncia wizard + `/codigo/[code]` comprobante** — most mature comprobante; reviewed ×3, e2e, rate-limited, PII-clean.
- **`/gob/maltrato/[id]` triage detail** — "excellent" (playwright), jurisdiction handoff verified, append-only.
- **Alta wizard + credential/flip/libreta** — e2e (02 + create-pet), pet-profile-v2 unit suite, a11y verified.
- **Turnos booking** — full e2e, booking/race/materialize-slots unit.
- **Intake flow** (minus the DIM-code polish) — e2e submit, dual-write/match unit.
- **Admin ops core**: `sistema`(+crons), `libro`, `alertas`, `observaciones`, `auditoria`, `outbox` — fail-loud e2e + cron/audit unit suites.
- **Multi-jurisdiction authz + cross-tenant isolation** — verified SOUND (handoff + security reports, 201+ targeted tests, both CI guards green).

---

## TRUE BLIND SPOTS (zero test AND zero review)

1. **`/mis-mascotas/[publicToken]/asistencia`** (service-dog / ANDIS-RUPGA credential) — the single clearest blind spot: user-facing, quasi-legal (ANDIS federal registry), no test, no journey, no review, ships a "pendiente de sincronización" state.
2. **`cartel` / lost-poster preview** (`PosterPreview.tsx`) — no test (broadcast logic is tested, the poster UI is not), not in any journey, not reviewed.
3. **`/admin/inteligencia`** — reviewed favorably but has **no dedicated test** and **no e2e journey** (admin 06 doesn't visit it) — a review-only surface.
4. **Static `/leyes` & `/funcionalidades`** — not in any journey; `/leyes` has `legal-knowledge-base` unit coverage, `/funcionalidades` has neither. Low risk (static content) but genuinely unexercised.

---

## KNOWN (already flagged this session — do NOT re-litigate)

- Intake success missing DIM code · adoption APP-code resolves nowhere · decomiso label accents · bite receipts no case-ref (comprobantes).
- Uncapped authenticated `panorama_api` fan-out (security MED-2, recommendation on record).
- Adopciones funnel H1 · CSP chunk 7851 H2 (cosmetic, verified) · analytics rabies ranking M1 · poblacion balance framing M2 (playwright-demo).
- Campaign appointments-only spine · 22/48 event types never surfaced in dashboards · default panorama preset by role · `/gob/sistema` consolidation (content-viz audit product queue).
- Mi Argentina federation surfaces (verificar-dni, integracion-miarg, miarg/callback) — intentional Batch-4 deferral, gated.
- Whole-province (non-CABA) assignment scaling + non-canonical locality routing completeness (handoff CONCERNs, PO attention).
