# Comprobantes — information-quality review (case-creating receipts)

**Branch**: integration/all-20260703 · **Scope**: READ-ONLY content/UX audit of every surface that a case-creating action lands on (success screen, generated code, detail comprobante). Not a code-quality review. Builds on `2026-07-09-clickthrough-deep-review.md` (that pass fixed k-anon, seed geo, favicon, denuncia banner de-dup; this pass goes deep on the receipt content itself).

**Rubric** (PO's 4 axes): **Missing** (info an official receipt should carry) · **Excess/leak** (PII/internal IDs that shouldn't show) · **Format** (es-AR dates, code casing, masking, enum→label) · **Improvable** (clarity, print/share, immutability signal).

**Severity**: HIGH (privacy/legal/wrong-data) · MED (confusing/inconsistent/missing key datum) · LOW (polish).

---

## Executive shortlist

### Should BLOCK the funcionario demo
Nothing hard-blocks. The two flows a funcionario demo leans on — the **welfare denuncia comprobante** (`/denuncias/codigo/[code]`) and the **govt maltrato detail** (`/gob/maltrato/[id]`) — are the most mature surfaces in the app: correct DEN-XXXX-XXXX code, AR-timezone dates, coarsened public location vs exact official location with an audit-logged view, masked contact on the public side, honest "integración pendiente" banner. No leaks found there.

### Nice-to-have (ordered by value)
1. **MED — Intake success screen never shows the new credential code (DIM-XXXX-XXXX).** The single most useful datum of a refugio intake receipt (the animal's new credential) is only embedded in button hrefs, never displayed. `IntakeForm.tsx:138-170`.
2. **MED — Adoption "APP-XXXX-XXXX" code is decorative, not resolvable.** Success screen tells the applicant to "guardá este código por si necesitás referenciarla", but no route resolves an APP code and the applicant is authenticated anyway. `ApplicationForm.tsx:260-269`.
3. **MED — Decomiso seizure-motive labels are missing Spanish accents** ("Maltrato fisico", "Trafico", "Acumulacion", "situacion critica") and surface on the confirm modal + the case comprobante. `DecomisoForm.tsx:82-90`.
4. **LOW — Bite/mordedura receipts carry no case reference.** Both bite success screens confirm the 10-day observation but show no incident/case code to quote later. `mordedura/exito/page.tsx`, `OrgBiteForm.tsx:142-172`.

---

## Fixed this pass (one commit — `fix(ui): comprobante information-quality polish from B2.2 review`)

| # | Axis | Fix | File:line |
|---|---|---|---|
| F1 | Format | Intake confirm-recap "Fecha" rendered the raw ISO string (`2026-07-10`) instead of an es-AR date. Now `formatDate` with local-noon anchoring (mirrors OrgBiteForm precedent) → "10 de julio de 2026". | `app/org/[orgToken]/intake/IntakeForm.tsx:479-484` |
| F2 | Format | Service-offering detail used a **local** `formatDate` with no `timeZone`, so the server (UTC) renders a late-evening ART timestamp as the next calendar day (violates the `AR_TIME_ZONE` mandate in `lib/utils/format.ts`). Added `timeZone: AR_TIME_ZONE`, keeping the medium style. | `app/org/[orgToken]/servicios/[offeringToken]/page.tsx:27-34` |

DoD: `pnpm exec tsc --noEmit` clean · `biome check` clean on both files · vitest `turnos-offering-detail-page`, `case-ux-components`, `create-clinic-wizard`, `reference-code` all green.

---

## Per-flow findings

### 1. Denuncia de maltrato — public comprobante `/denuncias/codigo/[code]` + wizard success
Files: `app/(public)/denuncias/codigo/[code]/page.tsx`, `DenunciaWizard.tsx`, `SuccessScreen.tsx`, `reference-code.ts`, `mask-contact.ts`.

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Missing | — Complete. Kind title, DEN code (copy + print), status+severity badges, "Enviada {datetime}" + "Ocurrió el {date}", description, subject, coarse location, masked contact, evidence, legal "integración pendiente" banner. | — | page.tsx:216-381 |
| Excess/leak | Clean. Public receipt shows only **coarsened** location (`coarsenPoint(…, "approx")`), never `locationAddress`; contact is `maskEmail`/`maskPhone`; no DNI anywhere. | — | page.tsx:157-166, 316-326 |
| Format | DEN-XXXX-XXXX unambiguous alphabet (no 0/O/1/I); dates via canonical AR-pinned `formatDateTime`/`formatDate`; enum→es-AR labels throughout. | — | reference-code.ts:15-56 |
| Improvable | Print stylesheet correctly scopes to `#comprobante-root` (a prior bug printed the banner only — already fixed). No explicit "este comprobante es oficial e inmutable" line, but the legal banner + status badge cover intent. | LOW | page.tsx:177-188 |
| Note (code, not content) | `DenunciaWizard`'s inline `LnSuccessScreen` branch (`successCode`, lines 329-342) is **dead** — the server action redirects to `/denuncias/codigo/[code]?nueva=1`, and `setSuccessCode` is never called. The real receipt is the codigo page. Harmless but the two copies could drift. | LOW | DenunciaWizard.tsx:329-342 |

### 2. Mordedura / bite report — owner + org
Files: `mis-mascotas/[publicToken]/eventos/nuevo/mordedura/exito/page.tsx`, `OrgBiteForm.tsx`.

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Missing | No case/incident reference code on either success screen — the reporter can't quote this event later except by opening the pet. For a quasi-legal rabies-observation trigger, a case handle would help. | LOW | exito/page.tsx:27-42; OrgBiteForm.tsx:142-172 |
| Format | Org success computes the observation-end date with correct **noon-anchoring** before `formatDate` (avoids the off-by-one) — good precedent, reused by fix F1. Legal basis cited (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987). | — | OrgBiteForm.tsx:142-153 |
| Excess/leak | Org wizard shows the picked pin at 6-decimal precision inline (`lat.toFixed(6), lng.toFixed(6)`) — operator-facing input echo, not a public receipt, so acceptable. | LOW | OrgBiteForm.tsx:295-299 |
| Improvable | Next-step "Ver credencial de la mascota" (public `/p/{token}`) works even when the clinic doesn't hold the pet — thoughtful. | — | OrgBiteForm.tsx:160-168 |

### 3. Intake / ingreso (refugio)
Files: `IntakeForm.tsx`, `intake/match/[matchedPetToken]/MatchConfirmationCard.tsx`.

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Missing | **The generated credential DIM-XXXX-XXXX is never shown on the success screen** — only used inside hrefs. The comprobante of an intake is the new credential; surface it (the `LnSuccessScreen` already supports a `code` prop). | MED | IntakeForm.tsx:138-170 |
| Format | **FIXED (F1)** — confirm-recap "Fecha" was raw `occurredAt` ISO string; now es-AR. Other recap rows already label-mapped (`speciesLabel`, motive/role). | — | IntakeForm.tsx:479-484 |
| Excess/leak | MatchConfirmationCard exposes only `ownerFirstName` (first name only) + last-known location text/date of the matched lost pet — appropriate minimum for a "is this the same animal?" decision; no owner contact/DNI. Last-location date is AR-timezone formatted. | — | MatchConfirmationCard.tsx:116-137 |
| Improvable | Match card has two `Dueno/a`/`devolucion`/`notificara` strings **missing accents/ñ** (Dueño, devolución, notificará). es-AR copy nit. | LOW | MatchConfirmationCard.tsx:118, 167-170 |

### 4. Servicio (vet/refugio service offering)
Files: `ServiceOfferingForm.tsx`, `servicios/[offeringToken]/page.tsx`.

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Format | **FIXED (F2)** — detail-page local `formatDate` had no `timeZone` (UTC-day drift risk). Now AR-pinned. | — | page.tsx:27-34 |
| Format | Price renders `$` + `toLocaleString("es-AR")` (e.g. "$1.500"), no decimals, no "ARS"/currency symbol via Intl currency. Readable but not a true currency format; "Campaña gratuita" fallback is clear. | LOW | page.tsx:158-165 |
| Missing | This is the closest thing to a service "comprobante": shows público token, kind, price, duration, capacity, eligibility, submitted/reviewed dates, status banner with next-step. Complete for a CRUD record. The creation flow itself redirects (no success screen) — acceptable since the detail page is the landing. | — | page.tsx:152-214 |
| Excess/leak | None — org-scoped, no PII. | — | — |

### 5. Investigación epidemiológica (govt vigilancia)
Files: `investigaciones/nuevo/OpenInvestigationForm.tsx`, `investigaciones/[caseCode]/page.tsx`.

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Missing | Detail landing carries publicCode + "abierta {datetime}", status pill, disease/estado/jurisdicción chips, motivo, epidemiological dataset, timeline, applicable normativa, honest "notificación externa no integrada" breach banner. Strong. | — | detail:112-156, 128-133 |
| Format | AR-pinned `formatDateTime` throughout; status/entry enum→es-AR maps. | — | detail:16-42 |
| Excess/leak | `signalId` input placeholder invites a raw `outbreak_signal` event UUID — internal id surfaced as a user input (govt-only, low risk). External-notification detail echoes stored `notified_at` **raw** (whatever the operator typed) rather than through a date formatter. | LOW | detail:46-56; form:89-101 |
| Improvable | New-investigation **form copy is un-accented** ("investigacion", "situacion", "Describe la situacion epidemiologica", "Abrir investigacion") — inconsistent with the accented detail page. es-AR nit. | LOW | form:83, 112 |

### 6. Adopción / custody transfer
Files: `ApplicationForm.tsx` (adoption), `DecomisoForm.tsx` + `casos/[publicCode]` (custody/seizure).

| Axis | Finding | Sev | Ref |
|---|---|---|---|
| Excess/Honesty | **Adoption `APP-XXXX-XXXX` code is derived from the first 8 hex chars of the event UUID and is not resolvable anywhere** — no lookup route, applicant is logged in, next step is account-based "Ver mis postulaciones". Telling the user to "guardá este código por si necesitás referenciarla" overstates its usefulness; the hex slice also isn't the unambiguous alphabet DEN/DIM use (can contain 0/O-lookalikes once uppercased… though hex is 0-9A-F). Either wire a real reference or soften the copy. | MED | ApplicationForm.tsx:260-269 |
| Format | Adoption summary recap uses label-mapped enums (housing/prior-pets); no raw dates shown. Good. | — | ApplicationForm.tsx:462-534 |
| Format | **Decomiso `SEIZURE_MOTIVE_LABELS` missing accents** — "Maltrato fisico", "Trafico / comercio ilegal", "Acumulacion / hoarding", "Sin resguardo adecuado (situacion critica)". These echo on the DC2 confirm modal and the resulting case comprobante under Ley 14.346 — a legal artifact should not carry mis-spelled Spanish. | MED | DecomisoForm.tsx:82-90 |
| Excess/leak | Decomiso lands on `/casos/{publicCode}` (shared `CaseDetailView`, role-aware PII gating, `canReadCase` scope). "ID de denuncia vinculada" field asks for a **raw welfare-report UUID** as user input — internal id leaked into a form field (govt-only). Confirm modal correctly names the owner being dispossessed + legal basis. | LOW | DecomisoForm.tsx:628-648 |
| Improvable | Decomiso submit copy is honest about irreversibility + audit + Ley 14.346 + handoff. Strong immutability signal. | — | DecomisoForm.tsx:843-846 |

---

## Cross-cutting observations

- **Date formatting is canonical and correct almost everywhere** — `lib/utils/format.ts` pins `America/Argentina/Buenos_Aires` and documents the React #418 hydration rationale. The two exceptions found (intake recap, service detail) are fixed this pass. Recommend a lint guard forbidding bare `toLocaleDateString`/`new Intl.DateTimeFormat` without `timeZone` outside `format.ts`.
- **PII discipline is strong.** No plaintext DNI anywhere in the receipts; public denuncia coarsens location and masks contact; govt detail shows exact location but audit-logs the view (`logWelfareLocationViewed`). Invariant #5 upheld across all comprobantes reviewed.
- **es-AR accent inconsistency is the recurring content defect** — the decomiso motive labels, the investigación form, and the intake match card drop accents/ñ while neighbouring surfaces keep them. Batched as a copy sweep (report-only; several are enum labels worth a product/test check before a mass edit).
- **"Official + immutable" signalling is implicit** (legal banners, status badges, "queda registrado en la libreta oficial") but never an explicit "este comprobante es oficial e inmutable" line. Consider a shared footer stamp for the quasi-legal receipts (denuncia, mordedura, decomiso).
