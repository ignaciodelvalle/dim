# SDD — Campaign management UX (gov-side)

**Date:** 2026-07-07 · **Status:** spec + design; read-slice already shipped, create→assign→measure loop DEFERRED pending actor-model decision · **Owner:** Ignacio Del Valle (PO)

> The surfaces exist — `/gob/campanas` measures campaign performance, `/org/[orgToken]/servicios` creates the underlying service offerings, `/turnos/buscar` books turnos. What's incomplete is the **gov-side loop**: a funcionario *creating* a campaign, *assigning* turnos/capacity, and *measuring* asistencia as one coherent workflow. This SDD designs that loop and, crucially, surfaces the actor-model decision that gates the "create" half — because campaigns are created by orgs today, and a govt institutional account cannot own the offering.

---

## Proposal

**Intent.** Let a sanitary authority run the full campaign lifecycle from `/gob`: define a campaign (a vaccination/deworming/castration drive in a locality), open capacity/turnos for it, and watch enrollment → asistencia → no-show in one place.

**Why the loop is half-open.** DIM already has every *primitive*: `service_offerings` (the campaign), `appointments` (turnos, with `status ∈ confirmed|attended|no_show|cancelled`), and the `campaign-metrics` projection. The **measure** third is fully shipped (`/gob/campanas`). The **create** and **assign** thirds live under `/org/[orgToken]/servicios` — i.e., they belong to the *organization* that runs the drive, not to the govt overseer. So "gov-side create" runs straight into the account-type model: a `govt` institutional account has no org membership and cannot author a `service_offering` (which requires the `service_offering.create` org capability). That is the decision to resolve, not code around.

**Scope this cycle.** No new build required — the tractable read slice (measure) is already in production. This SDD documents the create/manage design and identifies the actor decision. A tiny, safe read-only helper is the only candidate for implementation, and only if it adds value without touching `/gob` routes (kept out to avoid a lane collision on the govt surface).

---

## Current state (audited)

| Third of the loop | Where it lives | State |
|---|---|---|
| **Create** campaign (service offering) | `app/org/[orgToken]/servicios/nuevo/ServiceOfferingForm.tsx` | ✅ exists — but org-scoped (needs `service_offering.create`). |
| **Assign** capacity / turnos | `app/org/[orgToken]/servicios/[offeringToken]/CapacityEditor.tsx`, `.../agenda` | ✅ exists — org-scoped. |
| Owner books a turno | `/turnos/buscar`, `/mis-mascotas/[t]/turnos` | ✅ exists. |
| Operator records asistencia | `app/org/[orgToken]/agenda/turnos/[appointmentToken]/AttendanceFormDispatcher.tsx` | ✅ exists — sets `appointments.status`. |
| **Measure** enrollment/asistencia/no-show + geo reach | `app/gob/campanas/page.tsx` + `lib/analytics/campaign-metrics.ts` + CSV export | ✅ **shipped** — pure projection over `appointments ⋈ service_offerings`, jurisdiction-scoped, no schema changes. |

So: a campaign IS a `service_offering`; a turno IS an `appointment`; asistencia IS `appointments.status='attended'`. The measure surface is complete and correct. The gap is purely the *govt-initiated create/assign* half.

---

## Spec — requirements & scenarios

### R1 — Measure (DONE — codifying the shipped contract)

- **R1.1** `/gob/campanas` SHALL show, per campaign offering in the operator's jurisdiction: enrollment (confirmed+attended+no_show), completitud % (attended/enrollment), asistencias, ausencias, geo reach, and period deltas. *(Shipped.)*
- **R1.2** The measure surface SHALL be a pure projection (no writes), jurisdiction-scoped for govt / universal for admin. *(Shipped.)*

### R2 — Create (DEFERRED — gated on actor model)

- **R2.1** An authorized operator SHALL be able to define a campaign: service kind, display name, target locality/jurisdiction, date window, and initial capacity.
- **R2.2** The created campaign SHALL surface in `/gob/campanas` measurement automatically (it is a `service_offering`, so this is free once created).
- **R2.3** *Blocked:* WHO creates it (which account/org) is unresolved — see D1 / Q1.

### R3 — Assign turnos (DEFERRED)

- **R3.1** The operator SHALL be able to set/adjust capacity and the schedule window for a campaign, reusing the existing `CapacityEditor` domain.

### R4 — Close the loop honestly

- **R4.1** The lifecycle create→assign→measure SHALL be navigable as one workflow (a campaign detail view linking its measurement), not three disconnected surfaces.

---

## Design

### D1 — The actor decision (THE blocker, Q1)

Three options, in increasing order of build cost:

- **Option A — Delegated org (recommended).** A "Mascotas CABA" / municipal campaign is authored by the authority's own `sanitary_authority` **org**, created and staffed exactly like a clinic. The funcionario operates through their org membership (`service_offering.create`). `/gob/campanas` then *oversees* (read) what the authority's org *runs* (write). **Zero new authorization model** — it reuses the existing org portal. The only addition is a cross-link from `/gob/campanas` → the authority's `/org/[orgToken]/servicios/nuevo`.
- **Option B — Govt-authored offerings.** Grant `govt` accounts a new capability to create `service_offerings` scoped to their jurisdiction, with `author_organization_id` NULL or a synthetic authority org. Cost: extends the authz model (the exact class hardened in Wave A/F — regressing it is a security risk, per the moderation SDD's caution), plus a new writer path that bypasses org membership.
- **Option C — Campaign as a first-class entity.** A new `campaigns` table distinct from `service_offerings`, with its own govt-scoped CRUD. Highest cost; only justified if a campaign is genuinely more than "a service offering run as a drive" (it currently is not).

**Recommendation: Option A.** It closes the loop with a cross-link and org onboarding, touches no authorization surface, and keeps `/gob` as the honest *oversight* role the four-actor model assigns it. Options B/C are re-litigations of the account-type model and should not be undertaken without a strong reason.

### D2 — Manage view (once A is chosen)

Add a campaign detail at `/gob/campanas/[offeringToken]` (read) that: shows the offering's measurement over time, links to the running org's `/org/[orgToken]/servicios/[offeringToken]` for capacity edits, and lists recent turnos with status. This is *read + link-out*, not write — it respects the oversight boundary while closing R4's "one workflow" gap.

### D3 — Nothing new in the data model

Under Option A, create/assign/measure are entirely existing tables. The whole feature is UX + a cross-link + org onboarding docs. That is why this is a UX SDD, not a schema one.

---

## Tractable slice vs. deferred

**ALREADY SHIPPED (the read/measure third):** `/gob/campanas` + `campaign-metrics.ts` + CSV export. Nothing to build; R1 is done.

**TRACTABLE but held for lane safety:** the `/gob/campanas/[offeringToken]` read-only detail view (D2). It is decision-light *given Option A*, but it (a) still depends on confirming Option A, and (b) lands on the `/gob` route surface, which other agents are actively editing this cycle (lane collision risk). Held for a dedicated `/gob` pass.

**DEFERRED — needs the actor decision (Q1):** the create + assign-turnos halves (R2, R3). Under Option A these become "onboard the authority as a `sanitary_authority` org + add a cross-link" (small); under B/C they are an authorization build. The PO must pick the model first.

> **This cycle implements no code for this feature** — the valuable, decision-free slice (measure) already exists in production, and the remaining slices are either lane-blocked or gated on Q1. The deliverable is this design + the decision-forcing question.

---

## Open questions

1. **Q1 (BLOCKING create/assign) — Actor model: Option A (authority runs its own `sanitary_authority` org), B (govt-authored offerings via new capability), or C (first-class `campaigns` table)? Recommendation: A.** Everything downstream depends on this.
2. **Campaign vs. offering vocabulary.** Should the UI call it "campaña" while the data stays `service_offering`, or does a campaign group *multiple* offerings (a multi-locality drive = several offerings under one banner)? If the latter, a lightweight `campaign_id` grouping column on `service_offerings` may be warranted (additive) — but confirm the need first.
3. **Turno assignment model.** Are campaign turnos self-booked by owners (current `/turnos/buscar` model) or operator-assigned (the funcionario schedules specific animals)? The word "assign turnos" in the backlog is ambiguous. → PO clarification; changes R3 substantially.
4. **Asistencia by whom.** On a campaign day, who marks `attended` — the running org's operator (current path) or a govt operator? Ties back to Q1.
