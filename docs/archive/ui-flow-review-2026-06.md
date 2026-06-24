# UI / Flow / Navigation Review — Baseline (2026-06-12)

> Status: **baseline static review**. A deeper end-to-end (cross-actor) pass is
> running on top of this; findings confirmed/refuted/added there are appended in
> the "Deep pass" section. NOTHING here is fixed yet — this is the inventory.

## What this review WAS (and was not)

- **Was**: a static, per-portal code review — read every page/component and
  traced each button/CTA to its server action or href; checked the action
  exists and its return is handled. Strong at catching dead buttons, missing UI
  entries, 404 links, and dead-end states (all visible in code).
- **Was NOT**: a runtime execution. The app was not driven. Coverage was
  prioritized, not uniform — the **org portal was the thinnest** pass. Thin /
  unverified actor perspectives: **vet role**, **org member with limited
  capability** (permission-denied states), **co_owner/caretaker** (schema-only,
  deferred). Cross-actor handoffs were traced one side at a time, not as one
  continuous journey.

## Coverage by portal (static pass)

| Portal | Depth | Headline |
|---|---|---|
| Owner `app/(app)/**` | Good | 1 P0, 9 P1, 6 P2 |
| Org `app/org/[orgToken]/**` | **Thin** (~54 files) | 1 P0, 6 P1, 6 P2 — likely incomplete |
| Gob + Admin `app/gob/**` + `app/admin/**` | Good | 1 P0 (404 cluster), stale-UI cluster |
| Public + Auth | Thorough | 2 P0, 5 P1 |

---

## P0 — broken flows / dead CTAs

| # | Location | Finding |
|---|---|---|
| P0-1 | `app/(app)/mis-mascotas/[publicToken]/page.tsx:1185` | `PetActionsMenu` gets `hasPendingReturnProposal={false}` **hardcoded** → "Confirmar devolución" never appears. The owner-side return-to-owner entry is dead; the `/devolucion` page works but is URL-only. (All the ARCH-B / V1-3 return-to-owner backend has no UI entry.) |
| P0-2 | `app/org/[orgToken]/intake/IntakeForm.tsx` → `OrgPetSheetMounter.tsx` | Intake success CTA "Asignar tránsito" opens `?sheet=asignar-transito`, but the sheet mounter has no such case → dead button after the first post-intake action. |
| P0-3 | `app/org/[orgToken]/transferencias/recibidas/page.tsx:~262` | Incoming **decomiso** (court-ordered) transfers render the badge + "7 días" deadline but the action renderer excludes `isDecomiso` → no accept/reject UI → uncompletable. |
| P0-4 | `app/gob/page.tsx:205,217,230,240` | Four dashboard KPI tiles link to `/gob/indicadores` — route does not exist → 404 on click. |
| P0-5 | `app/adoptar/[petToken]/ApplyButton.tsx` | Adoption CTA is 100% JS-dependent — no `<form action>` fallback. With JS off the anonymous adoption funnel is dead. |

## P1 — confusing, workaround exists

| # | Location | Finding |
|---|---|---|
| P1-1 | gob/cola `ReviewActions`, admin/cola, gob/servicios `OfferingReviewActions`, org `OwnerReturnProposalCard` | **`router.refresh()` cluster** — no refresh after approve/reject/accept; the item stays visible as if nothing happened (one pattern × 4 sites). |
| P1-2 | `app/gob/usuarios/page.tsx:35` | `searchUsers(query)` is **not jurisdiction-scoped** — a govt user sees users across all jurisdictions (security-adjacent). |
| P1-3 | `app/(auth)/login`, `app/(auth)/signup` | No password-reset / "olvidé mi contraseña" flow exists anywhere. |
| P1-4 | `components/pet-profile/LostPublicCredential.tsx:117` | "Estoy perdida" hardcoded feminine for every pet regardless of `pet.sex`. |
| P1-5 | `app/org/[orgToken]/casos`, `app/org/[orgToken]/maltrato/recibidos` | Welfare cases derived to an org and "maltrato recibidos" are **read-only dead-ends** — no "tomar caso" / acknowledge / status action. |
| P1-6 | `app/gob/analytics/export/ExportFormClient.tsx:50-52` | Export form hidden inputs hold the SSR period; a client-side `PeriodPicker` change is silently ignored → export period mismatches the charts. |
| P1-7 | `app/page.tsx` (landing) | `/perdidas` and `/refugios` are undiscoverable from the landing — the 2nd-most-important public use case (find a lost pet you spotted) has no path from the front page; no public shelter directory. |
| P1-8 | `components/ui/LnOwnerNav.tsx:23`, `LnOwnerSubBar.tsx:33-39,85-90` | Nav active-state misses `/turnos/buscar/*`; breadcrumbs are 2-level and render the raw `publicToken` instead of the pet name/sub-page. |
| P1-9 | `app/org/[orgToken]/miembros/CopyLinkButton.tsx:13-15` | Clipboard copy of the invite link fails silently (empty catch, fallback not implemented). |
| P1-10 | `app/gob/cola/page.tsx` | No type-filter chips despite a `TYPE_LABELS` map — requests of all types are mixed with no way to drill by type. |
| P1-11 | `app/admin/sistema/page.tsx:109` | Dev artifact text ("La tabla `cron_runs` aparece en Fase 14") visible to admins; and a failed cron has no in-app diagnose/retry/alert path. |
| P1-12 | `app/admin/outbox/page.tsx:79-85` | JS-side filter over the last 200 rows — filtered queries silently miss matching rows beyond position 200; no list-level replay. |
| P1-13 | `app/adoptar/[petToken]/page.tsx:463` | "Vacunación al día ✓" shown when `hasVaccinations` is true — a single old shot reads as up-to-date (misleading for adopters). |
| P1-14 | `app/denuncias/nueva/DenunciaWizard.tsx:136-147` | Denuncia location (province/locality) is optional → the report cannot be routed to the correct authority; user not warned. |
| P1-15 | `app/denuncias/codigo/[code]/page.tsx:319` | "Integración pendiente" notice is unconditional (no `sentToGovt` flag) → will keep showing after the integration ships. |
| P1-16 | `app/org/[orgToken]/cobertura/CoverageEditor.tsx` | Coverage edit gated on `role` not capability — inconsistent with the rest of the portal's `requireCapability` model. |
| P1-17 | `app/org/[orgToken]/mascotas/[publicToken]/OwnerReturnProposalCard.tsx` | (subset of P1-1) stale UI after org accept/reject of an owner return proposal. |

## P2 — polish

- Owner inicio: "Próximos turnos" and "Vencimientos" rows are non-link `<div>`s (look clickable, aren't); export-data has no success feedback; new-pet form has no client validation for missing species.
- Org: topbar breadcrumb hardcoded "Panel"; casos filter chips use `<a>` (full reload) not `<Link>`; agenda has no "Hoy" shortcut; `RevokeCell` collapses the confirm panel before the action error renders.
- Gob/Admin: missing accents in analytics copy ("Metricas", "analiticas", "adquisicion"); several KPI tiles have no `href`; `/gob/vigilancia` has no in-page CTA to zoonosis/investigaciones; admin/gob historial shows raw `approvalRequestId` UUIDs with no link.
- Public/Auth: Mi Argentina stub button is first in tab order (steals focus before email); landing footer links to the GitHub repo; "Gracias por animarte a denunciar" tone; lost-credential map is an emoji placeholder; ThrottleNotice + credential `<main>` missing `id="main-content"` (breaks skip link on the most-scanned page); privacy policy missing DNPDP/AAIP registration number; `/refugios` has no index page.

## False positives (verified, discarded)

- "`/casos/[publicCode]` route doesn't exist" — **it exists** (`app/casos/[publicCode]`). `LostCockpit` `caseHref` is fine.

---

## Deep pass (cross-actor, end-to-end)

7 journey agents traced each flow continuously across every actor (both sides of
each handoff), covering the gaps the per-portal pass missed (vet role, limited-
capability org members, cross-actor loops). Method still static (no runtime).

### Biggest discovery — notification actionability is systemic

`NotificationCard` only renders a CTA when both `ctaLabel` AND `ctaUrl` are set.
**~38 notification types are emitted with NO actionable CTA** — they're dead
informational rows. The full matrix is in the agent report; the critical ones:

- **[P0 safety] `rabies_observation_escalation_owner`** (severity=urgent) — owner
  alerted to possible rabies symptoms during observation, NO link to the case/pet.
  `symptom-observed-use-case.ts:256`.
- **[P0] `govt_locality_assigned`** — `ctaUrl: "/admin"`, a route govt CANNOT
  access (guard bounces non-admins to `/`). Should be `/gob`. `admin-institutional.ts:843`.
- [P1] `eno_pet_disease_diagnosis` / `eno_disease_diagnosis` — owner/govt told of a
  diagnosis, no link.
- [P1] `foster_volunteer_reenroll_prompt`, most `foster_*`, `custody_dispute_resolved`,
  `custody_dispute_stale`, `decomiso_*`, `revocation_executed_*`, `microchip_fraud/duplicate`,
  `welcome`, `adoption_application_closed`, `approval_request_auto_expired`, `org_invitation_*`,
  `org_membership_removed` — informational dead-ends.
- [P1] `CASE_NOTIFICATION_TEMPLATES` (`lib/notification-templates.ts`) + `renderCaseNotificationTemplate`
  are **DEAD CODE** — never imported; `lib/case-notifications.ts` (the intended caller) doesn't exist.
  25+ template defs unreachable; production emits inline copies with divergent/missing CTAs.

### New P0 (beyond baseline)

- **Owner→owner transfer initiation button does not exist.** The whole `petTransfers`
  recipient/sender/cancel/expire stack is built and wired, but NO button/href opens
  `?sheet=transferir-mascota` — URL-only. Same dead-entry class as P0-1. (`SheetMounter.tsx:211`, `PetActionsMenu.helpers.ts`)
- **Microchip-implantation attendance ALWAYS fails.** `AttendanceFormDispatcher` routes
  `microchip_implantation` to the generic form (vet_visit payload) but the writer validates
  against `microchip_implanted` schema → `EventPayloadValidationError` every time. The appointment
  can never be marked attended. (`attendance.ts:134-170`, `AttendanceFormDispatcher.tsx:80-119`)
- **No password reset** is now P0 (not P1): owner/vet who forgets their password has ZERO
  recovery path; only institutional accounts have admin-issued magic links.
- The 2 notification-CTA P0s above (rabies escalation, govt_locality_assigned).

### CONFIRMED baseline (with broader scope)

- P0-1 owner return entry hardcoded false — CONFIRMED; mitigated by the notification CTA being live
  (the only working path). Also NEW: inverted `canProposeReturn` gate (page.tsx:117) blocks the org from
  re-proposing after a cancel/reject.
- P0-3 decomiso dead-end — CONFIRMED and BROADER: the `/casos/[publicCode]` fallback link is also
  read-only, and `expire-decomiso-handoffs` only nags (never closes the case) → the receiver state has NO exit.
- P0-5 ApplyButton JS-only — CONFIRMED.
- P1-4 feminine "Estoy perdida" — CONFIRMED (`LostPublicCredential.tsx:100,117`); share-text heuristic also fragile.
- P1-5 org welfare recibidos read-only — CONFIRMED; plus reporter comments invisible to govt; re-derivation leaves a stale notification on the previous org.
- P1-13 vaccine "al día" — REFINED: not "any 1 vaccine"; the real bug is free-text vaccine names are silently dropped from the status computation.

### Other NEW findings (selected)

- **Lost/found handoff crux**: `finder_in_possession` events are NOT fetched into the LostCockpit scan feed
  (`lib/lost-mode.ts:186-206`) → owner is blind to possession reports in the cockpit; the "kind: finder" feed branch is dead code.
- **Lost recovery loop silent**: `lost_episode_resolved_owner/broadcast` templates exist but `setPetFound` emits no notification — neither owner nor broadcast orgs learn the episode resolved.
- **`?status_override=normal`** link in LostCockpit is dead (param never read) → owner can't view the normal profile while lost.
- **Adoption tab always empty**: adoption notifications are inserted with `category = null`; the notifications page groups by category → `?cat=adoption` shows 0 for every adoption actor.
- **Applicant can't withdraw** an adoption application (one-way door); `info_requested` is invisible to the applicant and emits no lifecycle event (org also can't tell which apps it already probed).
- **Silent approval queue gap**: if `findAuthoritiesForJurisdiction` returns 0 (no admins seeded for a locality), the org/vet request is created but NOBODY is notified and the requester gets no warning/SLA.
- **`canWritePetEvents` column ≠ `event.write` capability**: the EventWriteToggle flips the column, but enforcement reads the capability → the toggle can show "active" while the member is still denied. Dual-track tech debt.
- **DNI verification is trust-on-input** (Mi Argentina stub): `dni_verified=true` from a typed string; everything gated on it (vet upgrade, org creation, foster, adoption finalize) rests on security theater.
- Clinical: `ReminderActions` "Agendar" passes `?service=&pet=` but the search page reads `service_kind` and ignores `pet` → lands with no filters; `PetReminders` links to a non-existent `/vacunas/programar` route; no-show/attended actions don't revalidate the owner side.
- Welfare/surveillance: denuncia location optional → unroutable (no warning); "integración pendiente" banner unconditional (shows even on closed reports, contradicts the badge); no in-app "marcar como notificado a SNVS/SENASA" → compliance audit gap.
- Auth/account: Mi Argentina stub button is first in tab order; `/cuenta` has no notificaciones link; `/privacidad` mentions rights but doesn't link the self-service export/erase tools; no re-consent flow when `LEGAL_VERSION` bumps.

---

## Proposed fix plan (batches) — NOT started; for review

Each batch = one stacked PR (implement + adversarial review + PR), same method as the v1.0 chain.

| Batch | Theme | Items (severity) | Notes |
|---|---|---|---|
| **UI-1** | Dead UI entries (broken flows) | owner return-proposal prop [P0]; owner→owner transfer initiation button [P0]; org intake "asignar tránsito" sheet case [P0]; decomiso receiver accept/reject UI + exit [P0]; `/gob/indicadores` 404 tiles [P0]; adoption ApplyButton noscript fallback [P0] | Mostly small (wire existing actions to UI). Decomiso needs a real receiver surface. |
| **UI-2** | Notification actionability | rabies-escalation CTA [P0 safety]; govt_locality_assigned wrong URL [P0]; add CTAs to the ~36 dead notif types where a destination exists [P1]; delete/relocate dead CASE_NOTIFICATION_TEMPLATES [P1] | Systemic. The single highest-leverage UX batch. |
| **UI-3** | Stale UI / refresh | router.refresh on gob+admin cola, OfferingReviewActions, OwnerReturnProposalCard [P1]; owner-side revalidation on no-show/attended [P1] | One pattern × several sites. |
| **UI-4** | Lost & found completeness | feminine hardcode [P1]; finder_in_possession in cockpit feed [P1]; recovery notifications on found [P1]; dead status_override link [P1]; /perdidas discoverability [P1] | The finder→owner handoff is the crux. |
| **UI-5** | Clinical correctness | microchip attendance schema mismatch [P0]; reminder "Agendar" params [P1]; PetReminders dead route [P1]; vaccine free-text/al-día [P1] | microchip is a hard P0. |
| **UI-6** | Adoption completeness | notif category (empty tab) [P1]; applicant withdraw [P1]; info_requested visibility + lifecycle event [P1] | |
| **UI-7** | Welfare/org action surfaces | org "tomar caso" on derived welfare [P1 — needs product decision]; denuncia location required/warn [P1]; "integración pendiente" gating [P1]; re-derivation de-notify [P1]; SNVS mark-notified [P1] | "tomar caso" needs a product call on what the org does. |
| **UI-8** | Gob/admin polish | usuarios jurisdiction scope [P1 security]; cola type filters [P1]; sistema dev artifact + cron-failure action [P1]; outbox SQL filter [P1]; analytics export period [P1]; audit action labels [P2] | |
| **UI-9** | Auth/account | password reset [P0 — needs decision: Supabase native email vs deferred email provider]; /cuenta notificaciones link [P1]; /privacidad→tools link [P2]; Mi Argentina stub tabindex [P2]; DNI stub labeling [P2] | Password reset hinges on the email decision. |
| **UI-P2** | Polish | breadcrumbs, non-link rows, accents, map placeholder, /refugios index, etc. | Batch last. |

### Decisions (resolved 2026-06-12)

- **Password reset → DEFERRED** until the transactional-email provider lands (user
  decision). The P0 stays open and tracked; UI-9 excludes it. Do not implement the
  Supabase-native path.
- **Org "tomar caso" → acusar recibo + notas + devolver.** The org can mark a derived
  welfare report as taken/in-intervention, add intervention notes visible to gov, and
  return it ("no podemos intervenir"). **Gov remains the only closer.** This defines UI-7.
- **`canWritePetEvents` vs `event.write` → the toggle manages the CAPABILITY.** The
  EventWriteToggle grants/revokes `event.write` through the capability system (the real
  enforcement model); the legacy column becomes a mirror/deprecated.
- **Runtime click-through → AFTER the fixes**, as the final verification pass per role.
- DNI real verification / re-consent / SNVS dispatch — remain tied to the already-deferred
  Mi Argentina + email + authority-endpoint items.
