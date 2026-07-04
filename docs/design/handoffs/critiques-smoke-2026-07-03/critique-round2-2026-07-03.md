# Design Critique — Round 2 (write-flows, onboarding, North Star) — PARTIAL

**Product:** MiMAR (DIM) · **Build:** the "+20 commits" build serving localhost:3000, 2026-07-03
**Scope this pass:** owner onboarding + write-flows, the lost→found loop, and verification of round-1 fixes. **Cut short on token budget** — a substantial part of the round-2 plan was NOT reached (see "Still to review").
**Method:** logged in as `admin@` and `owner@`; created a real test pet (`QA Ronda2 Perro`, token `DIM-BAFX-B7VF`) and exercised weight-logging + the full lost/found loop. I do **not** create user accounts, so signup was critiqued by inspection only.

---

## Round-1 fixes — verified GOOD ✅

- **Audit log ×N collapse** (`/admin/auditoria`) — excellent. Consecutive identical actions now group as "…(override) ×28 · 28 acciones consecutivas · tocá para expandir" with a time range. Business-rule changes and PII searches are finally visible. The judgment call lands.
- **Scannable admin consoles** (`/admin/govts`) — now has a name/email search + status filters (Todos / Activos / Sin localidades / Desactivados). Seed noise is tamable.
- **`/admin/reglas`** (round-1 gap, now reviewed) — scope-aware rules cascade (país → provincia → localidad) with all 8 rule types and graceful "usa defaults" fallback. Works.
- **Neutral "REGISTRADA" chip** on the pet **detail header** — a fresh 0/3 pet shows grey "REGISTRADA" next to "0 DE 3 AL DÍA" instead of a false green "AL DÍA." Correct… **but see finding #1 — it's only half-applied.**
- **New-pet SuccessScreen** — create pet → instant credential + QR + production URL (`mimar.ar/p/…`) + next-step actions. The core value loop lands beautifully.
- **Natural-language capture** — typing "Peso 12.5 kg" opened the "Registrar peso" sheet with **12.5 kg pre-filled** (deterministic matcher, no LLM). Strong.
- **North Star lost→found loop** — 3-step mark-lost wizard (L1/L2 location + OSM map, physical-details, per-field disclosure toggles) → Tier-1 public credential (first-person "¡Hola! Soy … Estoy perdido", disclosure-aware call/map/finder buttons) → finder "La tengo conmigo" form → SuccessScreen with **WhatsApp share + printable A4 poster**. Excellent end-to-end.

---

## New findings this pass

| # | Finding | Severity | Notes / fix |
|---|---|---|---|
| 1 | **"REGISTRADA" fix is incomplete/inconsistent across surfaces.** Detail header shows "REGISTRADA," but `/inicio` and `/mis-mascotas` **list** rows show the same 0/3 pet as green **"AL DÍA"** — and the `/inicio` "Estado sanitario" sidebar shows it as **"1 PENDIENTE"** on the *same screen*. Same pet, three different status truths. | 🟡 Moderate | Drive every surface (detail header, list badge, sidebar) from the one compliance selector introduced for the header fix. |
| 2 | **Mutations freeze the main thread on the map-heavy pet page.** "Registrar peso" spun on "Registrando…" ~8s (event *did* persist); "✓ Marcar encontrado" **froze the click dispatch** (`Input.dispatchMouseEvent` 30s timeout) twice before the page recovered (status *did* eventually flip to found). Wizards and the dashboard were fine — the freeze is specific to the pet-detail/lost view. | 🔴 High (reliability/perf) | User-visible as "the button does nothing / did it fail?" → risk of double-submits. Likely tied to #3. |
| 3 | **maplibre console error:** `layers.regions-fill.paint.fill-color[4][5]: Input/output pairs for "interpolate" expressions must be arranged with input values in strictly ascending order`. The choropleth fill-color stops are out of order. | 🟡 Moderate | Breaks/blocks the region-fill layer on the govt/admin maps (panorama, vigilancia, analytics) and is a strong candidate for the main-thread stalls. Sort the interpolate stops ascending. |
| 4 | **English validation on a Spanish form.** Submitting the empty new-pet form shows the native browser tooltip **"Please fill out this field."** (HTML5 `required`). | 🟡 Moderate | Replace native validation with localized Spanish messages. Likely affects other forms too. |
| 5 | **New-pet form polish:** labeled "**Paso 1 de 1**" (odd for a single step); **Localidad** helper says "Requerido" but the label has no `*` while NOMBRE/ESPECIE do. | 🟢 Minor | Drop the step counter on single-step forms; align required-field markers. |
| 6 | **Acquisition method not captured at creation.** The minimal create form has no acquisition-method field, though AGENTS says `pet_registered` tracks it (`adopted/purchased/found_stray/…`) for EAH-2018 analytics. | 🟢 Minor (verify) | Confirm where/if it's ever captured; if never, the `/gob/analytics` "adquisición por método" chart is fed by seed only. |
| 7 | **Lost-pet wizard step subtitle is static** — steps 2 ("Datos para reconocerla") and 3 ("Qué querés que vean") still show step 1's copy ("Marcá el lugar y la hora aproximada del último avistaje…"). | 🟢 Minor | Make the subtitle track the active step. |
| 8 | **`/admin/reglas` polish** — uses ASCII `->` instead of the `→` glyph used elsewhere; rule defaults render as raw truncated JSON (`{"breeds":["Akita Inu",…`). | 🟢 Minor | Use `→`; render defaults as a friendly summary. |

**Verified-good extras worth keeping:** the "Activar mapa interactivo" lazy-load (static map until tapped — smart perf choice on the lost page); immutability framing ("Los eventos no se editan ni se borran… ASIENTOS FIRMADOS DIGITALMENTE"); INDEC locality autocomplete + Nominatim address geocoding both work cleanly.

---

## STILL TO REVIEW (round 2 was cut short here)

**Highest priority — not yet verified:**
- 🔴 **Adoptions crash fix** — did NOT get to confirm `/org/DIM-TC7Z-APW6/adopciones` now renders its 2 applications on every tab. **This is the #1 thing to re-verify** (it was round 1's critical bug).
- **Remaining round-1 fix checks:** "Buen día, Lilian." greeting, gated `/mordedura/nuevo`, KPI reconciliation (antirrábica 42 vs 54), the "(perros, 12m)" / "(mascotas)" coverage-label taste-check, Maltrato single-name, scroll-to-top.

**Not started:**
- **Public front-door:** `/denuncias/nueva` (submit a report) + `/denuncias/codigo`, `/adoptar` (+ apply), `/refugios/[orgToken]`, `/casos/[publicCode]` (role-aware PII redaction).
- **Vet upgrade onboarding:** `/cuenta/upgrade` (DNI-verify prerequisite) → govt/admin approval → `/cuenta/crear-consultorio` + the no-clinic onboarding banner. (`carla@` still unseeded.)
- **Org write-flows:** intake submit, custody transfer (two-phase), bulk operations on census, coverage zones, service creation.
- **Missed govt/admin surfaces:** `/gob/usuarios` (ISO/chip-fraud), `/gob/perdidas`, `/gob/decomisos`, `/gob/disputas`, `/gob/programa`, `/admin/cola` approvals detail, `/admin/casos`.
- **Owner flows not reached:** death recording + disposition method (feeds `/gob/mortalidad`), data-rights (Ley 25.326 export/delete), Tier 0+/Tier-2-público toggles, Tier-2 revocable share link.
- **Mobile viewport pass** (owner PWA at ~390px) — the "PWA principal" form factor, entirely unreviewed.
- **Signup submission + fresh-account empty-state** — not exercised (I don't create accounts; spin up a throwaway owner if you want this walked).

**Test artifact left behind:** `QA Ronda2 Perro` (`DIM-BAFX-B7VF`) on `owner@` — a dog with a weight event and a completed lost→found cycle. Safe to delete or keep as a fixture.

---

## Continuation pass (adoption fix + public surfaces)

**Adoptions crash — PARTIALLY fixed. ⚠️**
- ✅ The **list** (`/org/DIM-TC7Z-APW6/adopciones`) now renders — 2 pending applications (Postulante → Coco, Postulante → Negro), with bulk-select, and the Aprobadas/Rechazadas tabs show clean empty states. The round-1 headline crash is gone at the list level.
- 🔴 **The detail/review page still crashes.** Opening a postulación (`/adopciones/85765971-78ca-4c49-a03e-1e15dfad8f71`) throws the same Server-Components error boundary ("Algo salió mal", **código 3025710647**). So an org-admin can *see* applications but **cannot open one to approve/reject** — the actual adoption-review workflow is still broken. The crash moved from the list down to the detail page; same data-dependent-render class as round 1. **Re-verify after fixing (highest priority).**

**Other findings this pass:**
| Finding | Severity | Notes |
|---|---|---|
| Adoption-list count typo | 🟢 Minor | "2 postulaci**ó**nes" → "2 postulaciones" (misplaced accent / wrong plural). |
| Maltrato label — mostly unified | 🟢 Minor | Sidebar + breadcrumb now say "Maltrato" (good, was 3 names in round 1), but the page **H1 still reads "Investigaciones de maltrato."** Finish by aligning the H1. |

**Verified GOOD this pass:**
- **Adoptions list renders on all three tabs** (Pendientes 2 / Aprobadas / Rechazadas) — no crash.
- **`/adoptar`** (round-1 gap, now reviewed) — strong public listing: rich filters (especie/provincia/localidad/edad/talle/energía + compatibility toggles), 8 pets with warm bios + verified-refugio attribution. **Species are properly localized here** ("Cobayos", "Hurones" — not raw enums), and the two pets with pending applications (Coco, Negro) appear consistently.
- **`/denuncias/nueva`** (round-1 gap, now reviewed) — clean 5-step public report wizard; step 1 offers 9 well-iconed, well-described categories (Abandono, Negligencia, Maltrato físico, Encadenado, Sin refugio, Acumulación, Peleas, Tráfico, Otra). Submit not exercised this pass.

**Mobile viewport pass (partial — public surfaces at ~400px):**
- ✅ **Public Tier-0 credential** (`/p/…`) reflows cleanly — ticket card, avatar, identity grid all readable; also confirmed the pet reverted to **active/found (green dot)**, so the earlier "Marcar encontrado" persisted despite the freeze.
- ✅ **`/adoptar`** reflows well — the desktop nav collapses to a **hamburger** menu and the filter bar becomes a tidy 2-column grid.
- Not tested on mobile: the authenticated **owner app** surfaces (inicio / pet credential / libreta / anotar / lost flow) — would need an owner session; the "PWA principal" app-mode mobile is still the main mobile gap.

**Still not reached:** vet upgrade onboarding (`/cuenta/upgrade` → approval → `/cuenta/crear-consultorio`), govt surfaces (`/gob/usuarios·perdidas·decomisos·disputas·programa`), KPI-reconciliation + coverage-label ("(perros, 12m)") taste-check, adoption-application submit, death/disposition, data-rights, Tier 0+/Tier-2 toggles, and **owner app-mode mobile**.

---

## Write-flows completed (test-debt closeout)

All three of the explicitly-requested end-to-end write-flows now **submit successfully** (all on the `owner@` test dog `QA Ronda2 Perro` / `DIM-BAFX-B7VF`):

- ✅ **Welfare denuncia** — full 5-step public wizard (situación → gravedad → dónde/cuándo + geocoded location → sobre quién → anónima/contacto + evidence). Submitted anonymously; created **`DEN-TF4N-4PJW`** (Abandono · Media · Palermo, CABA · ABIERTA), now listed in "Mis denuncias." Clean, privacy-first ("El código DEN-XXXX es tu única forma de seguimiento").
- ✅ **Mordedura (bite report)** — 4-step org flow with a legal-consent gate; SuccessScreen "Incidente registrado · Mascota en observación antirrábica por 10 días · Próxima revisión: 2026-07-13." Correctly opened case **`CAS-3KRJ-433G`**, an "Observación antirrábica iniciada" event (VERIFICADO · OFICIAL), and the amber "Observación antirrábica en curso" health warning on the pet.
- ✅ **Vacuna antirrábica** — natural-language matcher → full-page form with "antirrábica" prefilled, today's date, and an **auto-suggested next dose (+1yr from catalog)**. Registered as a "Vacuna: antirrábica" timeline entry.

**End-to-end integrity is excellent:** the pet's immutable timeline now correctly shows, in order — Observación iniciada · Credencial escaneada (SIN VERIFICAR) · Marcada como encontrada · Marcada como perdida · Mascota registrada · Vacuna antirrábica · Peso 12.50 kg — with per-event provenance/verification stamps. Event-sourcing holds together across owner + org actions.

**New findings from these flows:**
| # | Finding | Severity |
|---|---|---|
| A | **Compliance vs vaccination-status double-standard.** An owner-declared antirrábica reads **"DECLARADA · SIN VERIFICAR"** and correctly does **not** count toward compliance ("0 DE 3 AL DÍA" — needs a vet; good, owners can't self-certify). But the same page's "ESTADO DE VACUNACIÓN" then shows **"1 AL DÍA / 2 POR VENCER"** — so the pet is simultaneously "1 al día" (vaccination) and "0 de 3 al día" (compliance). Reconcile the copy so the two panels don't contradict. | 🟡 Moderate |
| B | **"PRÓXIMO 💉 Refuerzo: antirrábica · 3 de jul de 2027"** is tagged **"— HOY —"** — the next-dose reminder (a year out) sits under a "HOY" label (looks like a timeline-separator bleed). | 🟢 Minor |
| C | Header still shows neutral **"REGISTRADA"** even while the pet has an **active rabies observation + open case** — arguably the header could reflect the observation state (the amber alert does cover it). | 🟢 Minor (judgment) |

**Confirmed-good:** the owner-declared-vs-vet-verified compliance gate ("La cargaste vos; pedí que un veterinario la registre para que cuente como al día"), the certifiable-entry framing, the deterministic vaccine matcher, and the full-page vacuna/mordedura wizards all completing without the sheet-hang seen on the peso slide-over.

**Test artifacts left behind on `owner@`:** pet `QA Ronda2 Perro` (`DIM-BAFX-B7VF`) with vacuna + peso + lost/found + open bite case `CAS-3KRJ-433G` / observation (next review 2026-07-13); denuncia `DEN-TF4N-4PJW`. Safe to delete or keep as fixtures.
