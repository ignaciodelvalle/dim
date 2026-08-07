# SDD — Mascotas CABA street-atención capture

**Date:** 2026-07-07 · **Status:** spec + design; tractable slice identified, full flow DEFERRED pending product input · **Owner:** Ignacio Del Valle (PO)

> The biggest felt gap in CABA (per the persona reviews): the vaccination truck / patrulla attends animals on the street — vaccinates a stray, treats a colony cat, logs a found dog — and today that "who-was-attended-where" evaporates onto paper. This SDD maps that field capture onto DIM's event model **without inventing a parallel system** and calls out exactly which product decisions must land before the operator form is safe to build.

---

## Proposal

**Intent.** Give a Mascotas CABA field operator a way to record a street-attended animal (vaccination, deworming, sighting, capture-for-castration) so the attention becomes a durable, jurisdiction-scoped, projectable event — feeding coverage metrics and colony/zoonosis surveillance instead of a lost clipboard.

**The core tension (why this is not a copy-paste of org intake).** DIM's event log is *pet-centric*: every `pet_event` hangs off a `pets` row. A street animal attended once, never seen again, is **not a credential-bearing pet** — it has no owner, may have no chip, and may never be re-encountered. Forcing a full `pet_registered` for every street vaccination would (a) pollute the pet population with thousands of ghost rows and (b) misrepresent the North Star ("the pet is the credential") — a one-shot street jab does not mint a credential. So the model question is real: **is a street attention an event on a (thin) animal record, or a location-stamped observation that may never bind to a pet?**

**Why not build the full flow now.** The capture UX (what a truck operator taps on a phone at a plaza, offline-tolerant, in <30s) is a genuine product-design problem, and the actor/authorship model has an unresolved constraint (below). Building the operator form before those land = speculative. We spec the model, ship the schema-level tractable slice, and stop.

---

## Current state (audited)

- **Org-side intake already models "stray found".** `createIntake` (`src/modules/pets/application/intake/create-intake.ts`) writes `pet_registered` + `shelter_intake_recorded` with `intake_reason='stray_found'`, opens a `custody_episode` case, and canonicalizes jurisdiction against the INDEC catalog. This is the closest existing analog — but it assumes the org **takes custody** (a `shelter_custody` ownership row). A truck that vaccinates and releases takes no custody.
- **Event location is first-class.** `pet_events.location_point` (`location_lat`/`location_lng`) is the universal geographic column every projection reads (AGENTS.md § event design). A street capture is inherently location-stamped.
- **Authorship constraint (the blocker).** Per AGENTS.md § "Role vs. event authorship": *institutional accounts (govt/admin) do not author `pet_events` in normal operation.* The `author_role='govt'` value is explicitly **reserved** for "a sanitary authority records an event during an inspection or campaign (likely via a personal vet acting under govt auspices, recorded with the institutional `author_organization_id`)." Street-atención is precisely that reserved case — so the actor model is *sketched but not decided*.
- **CABA operator identity.** A "Mascotas CABA" operator is a `sanitary_authority` **org** (org-type), staffed by `vet` personal accounts holding memberships — OR a `govt` institutional account. Which one authors a street event is open question Q1.

---

## Spec — requirements & scenarios

### R1 — A street attention is recordable as an event

- **R1.1** The system SHALL support recording a street animal attention that captures: species, an approximate description, the attention kind (see R2), a location point, a date, and the acting operator + authority org.
- **R1.2** A street attention SHALL be jurisdiction-scoped (province + locality), canonicalized against the INDEC catalog, identically to intake — so it rolls into the same `/gob` projections.
- **R1.3** WHEN the attended animal bears a microchip that matches an existing pet, THEN the capture SHALL surface that match (reusing `lookupByChip`) so a lost/owned animal is reunited rather than duplicated. *(Same cross-check discipline as intake.)*

### R2 — Attention kinds (the discriminator)

- **R2.1** Initial kinds: `vaccination` (esp. antirrábica — the headline use), `deworming`, `sighting` (census/colony count, no procedure), `capture_for_castration` (CeCT programs). Extensible via a discriminated payload, mirroring `clinical_info_logged`'s `sub_kind` pattern.
- **R2.2** A `vaccination` street attention SHALL be able to carry the SENASA-alignment fields (`tipo_evento_code='vacunacion_antirrabica'`, `lote_biologico`, `via_aplicacion_code`, `vet_matricula`) so a truck jab is export-ready (see the SENASA export SDD) — *contingent on the animal having a pet row (see design D2).*

### R3 — No custody is implied

- **R3.1** Recording a street attention SHALL NOT create an ownership/custody row. A vaccinate-and-release truck holds no custody. *(This is the hard divergence from `createIntake`.)*
- **R3.2** WHEN a street attention *does* result in the animal being taken in (capture_for_castration held overnight), THEN custody is opened by the existing intake path, not by the street-capture event.

### R4 — Colony / re-encounter identity (deferred sub-problem)

- **R4.1** The system SHOULD allow a later street attention to bind to the same animal (a TNR colony cat vaccinated across two campaigns) — but the identity key for an unchipped street animal is unresolved (Q3). v1 MAY treat each attention as independent (no re-binding).

---

## Design

### D1 — Model decision: new event type `street_attention_recorded`

Add one event type (a one-line edit to `EVENT_TYPES` in `db/schema.ts` + a Zod schema in `lib/events/event-schemas.ts` — **no migration**, per the catalog's additive rule). Discriminated payload on `attention_kind`:

```
street_attention_recorded:
  { attention_kind: vaccination | deworming | sighting | capture_for_castration,
    species, description?, sex?, estimated_age?,
    // vaccination/deworming carry the SENASA-alignment fields
    ... }
```
Location travels in `pet_events.location_point` (top-level), not the payload (AGENTS.md rule). SENASA columns (`tipo_evento_code`, `lote_biologico`, `via_aplicacion_code`, `vet_matricula`, `establecimiento_renspa`) travel in their dedicated columns.

### D2 — The pet-row question (THE decision, Q2)

Two viable shapes; **PO/product must pick** before the form is built:

- **Option A — thin animal row.** Every street attention still creates a minimal `pets` row (name = alias/"Sin nombre", no owner), so the event has a `pet_id` and reuses the entire existing machinery (projections, SENASA export, chip lookup). Cost: pet population inflates with un-credentialed ghosts; needs a `pets.provenance='street'` flag so dashboards/censo can include/exclude them honestly.
- **Option B — pet-optional event.** Allow `pet_events.pet_id` to be nullable for this type (or route to a separate `street_attentions` table). Purer model, but breaks the "every event hangs off a pet" invariant and forces every projection to special-case a nullable pet — a large blast radius.

**Recommendation (for PO to confirm):** Option A with a `provenance` flag. It preserves invariants, reuses SENASA export + chip-match for free, and the ghost-row concern is a k-anonymity/dashboard-filter problem we already solve elsewhere. But this is a PO call, not an engineering fait accompli.

### D3 — Actor / authorship

Resolves the reserved-case seam: the event is authored by a **personal `vet`** acting under the authority, recorded with `author_role='govt'` (or a new `author_role='sanitary_field'`) + `author_organization_id = <Mascotas CABA sanitary_authority org>`. This matches AGENTS.md's reserved intent exactly. Q1 = confirm whether the operator authenticates as their personal vet account (membership in the sanitary_authority org) vs. a shared institutional credential.

### D4 — Capture UX (deferred to product)

The form must be phone-first, sub-30-second, and offline-tolerant (a plaza has no signal). That is a design problem, not covered here. The tractable slice below is the *domain*, not the *form*.

---

## Tractable slice (safe to implement now) vs. deferred

**TRACTABLE (decision-free, additive, no migration):**
- Register the `street_attention_recorded` event type in `EVENT_TYPES` + a Zod schema in `lib/events/event-schemas.ts` (CI enforces 100% schema coverage — the type cannot land half-defined).
- A pure domain helper mapping a street `vaccination` attention → the SENASA `tipo_evento_code` vocabulary (reuses `lib/reference/sanitary-vocab.ts`).

**DEFERRED — needs product/PO input (do NOT build speculatively):**
- The operator capture form + server action (blocked on D2 pet-row decision + D4 UX + D3 actor confirmation).
- Colony re-encounter identity (R4 / Q3).
- The `/gob` "atención callejera" projection surface.

> This cycle implements the tractable slice **only if** it can be added without touching the deferred decisions. Because the pet-row shape (D2) determines the event's `pet_id` semantics, even the Zod schema's required/optional fields depend on it — so the honest call is to **hold the event-type registration too** until D2 is decided, and ship this SDD as the decision-forcing artifact. (See "Implementation note" in the delivery summary.)

---

## Open questions (BLOCKING the build — for the PO)

1. **Q1 — Operator identity.** Does the truck operator author as a personal `vet` (membership in the Mascotas CABA `sanitary_authority` org) or via a shared institutional credential? Affects `author_role` + audit honesty.
2. **Q2 — Pet row: Option A (thin ghost row + `provenance` flag) or Option B (pet-optional event)?** This is the single largest decision; it gates the event schema, the projections, and the SENASA export path for street jabs. **Recommendation: Option A.**
3. **Q3 — Colony re-encounter identity.** How is an unchipped street animal re-identified across campaigns (photo? colony ID? none in v1)? Gates R4.
4. **Q4 — Capture UX + offline.** What does the operator tap in <30s with no signal? A separate product-design task (D4).
5. **Q5 — Antirrábica coverage semantics.** Do street vaccinations count toward the jurisdiction's rabies-coverage KPI (the star compliance number)? If yes, ghost rows change the denominator — coordinate with the "rabies coverage currently-valid" metric SDD before wiring.
