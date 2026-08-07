# Owner "compliance-first" slice — Claude Code handoff

> Date: 2026-07-01 · Owner-facing (citizen skin `ln-*` / `Ln*`) · Scope: three linked screens delivered as one vertical slice.
> Design rationale (the *why*): [`docs/design/2026-07-01-four-actor-lean-ia-critique.md`](../../design/2026-07-01-four-actor-lean-ia-critique.md) §2. This doc is the *executable* version (the *what* + *where*), scoped for one or two Claude Code sessions.
> Companion critique (operator token layer, do not conflict): [`docs/design/critique-2026-06-24-frontend.md`](../../design/critique-2026-06-24-frontend.md).

## 0. Outcome (definition of done)

The owner's pet profile is re-ranked so **legal compliance leads and everything else recedes**, expressed through three screens:

1. **Compliance panel** — the pet's Resumen tab opens with a "Estado de cumplimiento" panel: rabies, sterilization, microchip, and (where the jurisdiction requires) PPP attestation, each shown as a status badge derived from events. Full libreta history moves below / into its tab.
2. **Turno flow** — the antirrábica card's primary action forks intent (book a vet vs. set a reminder) and reuses the existing booking + reminder machinery, returning the card to a new derived **"Turno reservado"** state.
3. **Historial provenance** — the history tab shows each event's **confidence tier** (vet/official-verified vs. owner-logged) and makes the append-only/amendment model legible in plain es-AR.

**Cheap-redesign guarantee (verified against code 2026-07-01):** no new color tokens, no schema migration, no new event types. This slice is re-composition of existing primitives + two new projection helpers. That keeps `lint:tokens` green (see the token-ratchet note in the critique §1.1).

## 1. Invariants respected

- **The pet is the credential; events are append-only; projections are first-class.** All three screens are `(events, rules) → view`. No new source of truth.
- **Spanish UI, English code.** All user-facing copy es-AR (accents mandatory — `lint:ui`). Identifiers/comments English.
- **Citizen skin only.** `ln-*` tokens, `Ln*` kit. Do not touch operator (`ln-op-*`/`Op*`) surfaces. `AppShell` already routes the citizen chrome here.
- **Token ratchet.** Reuse existing `--color-ln-*` values; add no raw hex/px/`dark:`. Interactivity in `"use client"`; server actions stay `"use server"` async-only (RSC boundary — see critique §1.2).
- **Touch targets ≥44px, no SCREAMING_CASE, no English copy** (`lint:ui`). These encode **Ley 26.653** (WCAG 2.1 AA via Disp. ONTI 6/2019) — treat as compliance.

## 2. WS-1 · Compliance panel (Resumen → "Cumplimiento")

**Where.** `app/(app)/mis-mascotas/[publicToken]/page.tsx` (tabs via `?tab=`; `TabKey` = resumen · libreta · vacunas · historial; `components/pet-profile/PetDetailTabs*`). Restructure the **resumen** tab so section 03 (already "CREDENTIALS" cards) becomes the compliance panel and leads the tab. No new route.

**What leads.** Four obligation cards, each a projection:

| Obligation | Derived from | Reuse | Legal footnote (es-AR, 11px, muted) |
|---|---|---|---|
| Vacuna antirrábica | reminders / `next_due_at` → `getReminderVariant` (`lib/vaccine-reminder-state.ts`); status via `deriveVaccineStatus` (`lib/owner-nudges.ts`) | `LnVstamp` (Vigente / Por vencer / Vencida) | `Obligación del propietario · Ord. CABA 41.831 · Ley 22.953` |
| Esterilización | presence of `sterilization_performed` | `LnBadge` variant | `Evento verificado en la libreta` |
| Microchip | `microchip_implanted` / `pet_identifications` | `LnBadge` + mono number | `Identificación · Ord. CABA 41.831 art. 4°` |
| Atestación PPP | `dangerous_breed_attested` **gated by** `resolveBusinessRule("ppp_breed_list", jurisdiction)` (`lib/business-rules-resolver.ts`, `lib/breeds-server.ts`) | `LnBadge` | `Régimen perros potencialmente peligrosos · regla jurisdiccional` |

**New projection helper.** `lib/pet-compliance.ts` → `fetchComplianceState(pet): ComplianceState` composing the four above (pure derivation over events + one rule resolve). Ordered: any `overdue`/`por vencer` first. Panel header shows an aggregate ("3 de 4 al día") and the hero chip mirrors the worst state.

**States & colors (all existing tokens):** al día = `--color-ln-ok*`; vence pronto = `--color-ln-warn*`; vencida = `--color-ln-err*`; turno reservado = `--color-ln-celeste*` (see WS-2). PPP-not-applicable → **hide the card** (default) — see Open Decision D2.

**Acceptance.** Owner opening `/mis-mascotas/[token]` sees the compliance panel above the libreta; each badge reflects real events; a pet whose breed is not on the jurisdiction's `ppp_breed_list` shows no PPP card; org-path viewers (clamped to resumen/vacunas) see the panel read-only.

## 3. WS-2 · Turno flow off the antirrábica card

**Trigger.** Primary action on the antirrábica card when status ∈ {por vencer, vencida}: `Programar turno`.

**Intent fork (new, small).** A `LnSheet` (bottom sheet, tone) with two options routing to existing machinery:

- **Reservar turno con un veterinario** (recommended) → `/turnos/buscar?service_kind=vaccination_rabies` (filter exists, `app/(app)/turnos/buscar/page.tsx`) → offering → `reservar/[slotId]` → `bookSlotAction(slotId, petId)` (`app/actions/booking.ts`, redirects on success). Pass pet context so the pet is pre-selected in `BookingFormClient`.
- **Solo recordármelo** → `/mis-mascotas/[token]/vacunas/programar` → `createVaccineReminderAction` (`app/actions/reminders.ts`). This path does **not** clear the obligation (Open Decision D3).

**New derived state — "Turno reservado" (no migration).** When the pet has a `confirmed` future appointment for `service_kind=vaccination_rabies`, the antirrábica card renders celeste with copy `Turno reservado · {fecha} · {proveedor}` and the microcopy: *"Cuando el veterinario la aplique, se registra como evento y el estado pasa a Al día solo."* Derivation only — `appointments.status` already ∈ `('confirmed','attended','no_show','cancelled_by_owner','cancelled_by_org')` (schema line ~2433). Extend `fetchComplianceState` to left-join the pet's confirmed future vaccination appointments.

**Loop closure.** Vet marks the appointment `attended` and emits `vaccination_administered` (`professional_verified`) → reminder `next_due_at` recomputes → badge → al día. No owner action.

**Acceptance.** From an amber antirrábica card, the owner books via the existing flow with pet pre-filled, returns to a celeste "Turno reservado" card; cancelling the appointment reverts the card to its prior state.

## 4. WS-3 · Historial provenance + immutability

**Where.** History tab (`?tab=historial`; `/historial` 308-redirects here). Reuse the existing `PetHealthTimeline` / historial list.

**Confidence tier → owner badge.** `computeConfidence` returns 5 tiers (`lib/event-confidence.ts`: institutional_verified · professional_verified · corroborated · self_reported · unverified). Collapse to a **3-badge display map** (add to a small helper, not new tokens):

| Tier(s) | Badge (es-AR) | Tone |
|---|---|---|
| institutional_verified (govt / refugio / lab) | `Verificado · oficial` | `ln-azul` |
| professional_verified (vet) | `Verificado por vet` | `ln-celeste` / info |
| corroborated · self_reported | `Registrado por vos` | neutral |
| unverified (anon scan) | `Sin verificar` | `ln-warn`, only if surfaced |

**Immutability, in plain Spanish.** A one-line note (`Los eventos no se editan ni se borran. Una corrección es un evento nuevo.`) and, for amended events, `Corregido · ver original`. Corrections already modeled: `AMENDABLE_EVENT_TYPES` + `event_amended`; libreta applies the latest overlay, historial shows the original alongside (`lib/amendment.ts`). Gate the "Corregir" affordance with `canAmendEvent`.

**Two lenses.** Segment `Todo` vs `Libreta sanitaria` (`LIBRETA_SANITARIA_EVENT_TYPES`, `lib/libreta-sanitaria.ts`). "Descargar libreta sanitaria (PDF)" is the official export (also the **Ley 25.326** art. 14 access surface; sanitary events are retained under SENASA / **Ley 14.072**). Default lens = Open Decision (recommend `Todo`).

**Acceptance.** Every event row shows a provenance badge; an amended `weight_recorded` shows "Corregido · ver original" with the original reachable; the libreta lens filters to the official subset and export produces it.

## 5. Legal copy strings (informative, non-intrusive)

Keep to one muted line where the owner acts; never a banner. All already-real norms (see `AGENTS.md` legal-framework):

- Antirrábica obligation: `Ord. CABA 41.831 · Ley 22.953`. (Note: no norm requires the *system* to warn — the duty is the owner's; word nudges as a convenience, not a compliance claim.)
- Microchip / identificación: `Ord. CABA 41.831 art. 4°`.
- PPP attestation: `Régimen perros potencialmente peligrosos` (jurisdiction rule).
- Data rights (Cuenta / export): `Ley 25.326` arts. 14 / 16.
- Rabies observation (if a bite path surfaces): `Decreto PBA 4669/1973 · Ord. CABA 41.831 art. 9`.

## 6. Test & verify impact

- **Run `pnpm verify` frequently** (typecheck + 8 lints + build), not at the end.
- **e2e to update (assert UI structure):** `e2e/owner-shell.spec.ts` (nav/shell + resumen structure), `e2e/create-pet.spec.ts` (pet-detail sections). Re-point selectors to the compliance panel; do not weaken assertions — update them. `cross-tenant-isolation.spec.ts` / `auth.spec.ts` should be unaffected but re-run.
- **New unit tests:** `lib/pet-compliance.ts` (per-obligation state incl. turno-reservado derivation) and the confidence-tier display map. Pure functions — table-driven, mirror `lib/libreta-sanitaria.test.ts` style.
- **Guards:** verify no `h-9/w-9` on new buttons (≥44px), no raw palette/hex/px, es-AR accents present, no English copy.

## 7. Open decisions for Ignacio (with recommended defaults)

- **D1 — "Turno reservado" as a real state?** Recommend **yes** (celeste, derived, no migration) — it's what makes the pipeline visible. Alternative: a note under the amber card without changing status.
- **D2 — PPP "no aplica": hide or show greyed?** Recommend **hide** when the breed isn't on the jurisdiction list (less noise; the panel stays about *this* pet's real obligations). Show greyed only if you want to teach the rule.
- **D3 — May an owner self-attest a vaccine?** Recommend **no** for obligation-clearing: only `professional_verified`/`institutional_verified` events flip a legal badge to "al día"; owner self-reports still appear in the libreta as `Registrado por vos` but don't clear the obligation. This aligns confidence tiers with compliance and is honest to the "comply, then optional" thesis.
- **D4 — Default history lens?** Recommend **`Todo`** (owners think in "everything"); `Libreta sanitaria` one tap away for official use/export.

## 8. Sequencing

WS-1 (panel + `fetchComplianceState`) → WS-2 (intent fork + turno-reservado derivation, extends WS-1's helper) → WS-3 (historial provenance/immutability, independent, can parallelize). Land unit tests with each; update the two e2e specs at the end of WS-1/WS-2. The owner **nav re-rank** (7 → 3 + bell, `OWNER_NAV`) is a separate, larger change — **out of scope for this slice**; do it after these three land so the demo story is coherent first.

## 9. Explicitly out of scope

Vet/org/govt surfaces; the nav re-rank; any new event type, appointment status, or color token; the free-municipal-campaign offering (needs a separate `serviceOfferings` question — flagged, not assumed here).
