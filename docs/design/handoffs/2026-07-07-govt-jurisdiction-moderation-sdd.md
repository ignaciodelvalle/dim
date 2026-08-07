# SDD proposal — Govt jurisdiction moderation & ownership

> Status: **proposal / roadmap** (post-demo). Placeholder surface ships now; full build is a phased SDD.
> Origin: the 2026-07-07 admin/govt persona review (Cursor) — "en un piloto provincial el gobierno quiere moderar su territorio", and the north-star "el govt debe poder manejar sus localidades y ver lo que allí sucede, completo."

## The principle
A `govt` user is a **jurisdiction official** (municipal/provincial zoonosis, Mascotas CABA, etc.), scoped to their assigned localities. An `admin` is the **platform operator** (DIM team) with national reach. The govt must be able to **own their territory end-to-end**: see everything that happens in their localities AND act on it — without waiting for the national admin.

## What exists today (the govt already sees a lot)
Jurisdiction-scoped, already live: `/gob` Panel (KPIs + alerts), `/gob/maltrato` (welfare cases), `/gob/casos` (unified CAS-), `/gob/vigilancia` (outbreak signals), `/gob/mortalidad`, `/gob/perdidas`, `/gob/reglas` (per-jurisdiction rule cascade), `/gob/analytics`. All filtered to the viewer's assignments.

## The gap
**Moderating the raw anonymous denuncia queue is `admin`-only** (`/admin/moderacion`). Anonymous abuse reports land in a national queue that only the platform operator triages before they become welfare cases. So a provincial govt can act on the *cases* in their jurisdiction but cannot **moderate the incoming anonymous denuncias of their own localities** — the very first step of the welfare pipeline is out of their hands. In a provincial pilot that's backwards: the province, not DIM, should own its denuncia funnel.

## Proposed feature
Give `govt` a **jurisdiction-scoped moderation surface**: `/gob/moderacion`, showing the anonymous denuncia queue **filtered to the viewer's assigned localities**, with the same triage actions the admin has — approve → open a welfare case, reject-as-abuse (with a documented motivo), escalate-to-admin for cross-jurisdiction or ambiguous-jurisdiction reports.

## Design questions to resolve in the SDD (why this is not a one-liner)
1. **Authz.** A new capability (e.g. `denuncia.moderate`) granted to `govt`, **scoped to their locality assignments** — mirroring how `/gob/maltrato` already scopes. Must not widen a govt's reach beyond their assignments (we hardened this exact class in Wave A/F — do NOT regress it). Admin keeps universal moderation.
2. **Jurisdiction resolution of an anonymous report.** A denuncia carries a location; it maps to a locality → a govt. What about a report with no/ambiguous location? → stays in the admin queue (or a "sin jurisdicción" bucket). No report should be invisible to everyone.
3. **Override / concurrency.** If both admin and the local govt can moderate, who wins? Proposal: govt owns their jurisdiction's queue; admin sees all + can act as backstop; the first terminal action locks the report (optimistic lock, like the bulk actions). Full audit of who moderated what.
4. **Event model.** Moderation is an append-only decision (`denuncia_moderated` with actor, motivo, outcome) — consistent with the event-sourcing invariant. A rejected report is not deleted; it's a superseding decision.
5. **Abuse of the moderator role.** A govt rejecting legit denuncias to hide problems in their territory is a real risk — the admin backstop + the full audit trail (`pii_queried` / moderation log) is the mitigation. Surface a "rejected by govt" signal to admin.

## Phasing
- **Phase 0 (now, demo):** an honest **placeholder** — a `/gob/moderacion` entry that shows the govt the intent, clearly "próximamente", scoped-language ("denuncias de tus localidades"). No fake data, no fake actions.
- **Phase 1:** read-only — the govt SEES the anonymous denuncia queue for their localities (the "ver lo que allí sucede" half), no actions yet. Reuses the admin moderation query with a jurisdiction filter.
- **Phase 2:** the triage actions (approve/reject/escalate) with the `denuncia.moderate` capability, the optimistic lock, and the audit trail. This is the full "manejar sus localidades" half.

## Value
Closes the provincial-pilot story: the province owns its denuncia funnel from the first anonymous report, not just the downstream cases. It's the difference between "DIM runs the platform and hands you reports" and "your office runs animal welfare in your territory, on our rails."

## SDD kick-off
Run `/sdd-new govt-jurisdiction-moderation` when prioritized. This doc is the seed for the proposal phase.
