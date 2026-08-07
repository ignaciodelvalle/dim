# Flow-completeness audit — 2026-07

> Reviews & hardening WS-B. Walkthrough of each actor's primary loop for
> empty / loading / error / confirmation states and dead-ends. Grounded in a
> read of the shipped code (owner/vet/org surfaces + the lost&found flows) at
> branch `feat/reviews-hardening`.
>
> Legend: ✅ present · ⚠️ verify (not confirmed in this pass) · 🔧 fixed here ·
> 🚩 gap (escalated — fix would change flow steps / a server action).

## Owner — comply-first loop

`/inicio` (Mis mascotas) → pet compliance panel → "Programar turno" sheet →
booking → back to "Turno reservado" → historial.

| Checkpoint | State |
|---|---|
| Empty pet list | ✅ `PetsGridWidget` renders a "Ver todas" / add-first-pet CTA (mirrors `/mis-mascotas` empty state). |
| Pet with zero events | ✅ Historial `EventTimeline` → "Sin eventos todavía."; compliance panel → obligations show "Sin registro". |
| Compliance panel, nothing known | ✅ each obligation degrades to `neutral` "Sin registro" (never a false "al día"). |
| "Programar turno" sheet open/close | ✅ URL-driven (`?sheet=turno-antirrabica`); close removes the param and returns to the page. |
| Booking cancel reverts state | ✅ "Turno reservado" is a *derived* state (confirmed future appointment); cancelling the appointment removes the derivation → card reverts. No stored flag to desync. |
| Loading (deferred tabs) | ✅ `PetDetailTabsPanel` shows a skeleton with `aria-busy` while libreta/vacunas/historial load. |
| Historial provenance / immutability | ✅ per-event badge + "Los eventos no se editan ni se borran." note (WS-3). |

## Vet (solo clinic) — attest-first loop

Org agenda-first landing → appointment → attend form emits events.

| Checkpoint | State |
|---|---|
| Empty agenda | ✅ `SoloVetAgendaLanding` → "No hay turnos para hoy. Cuando alguien reserve, aparece acá." |
| Appointment → attend | ✅ each row links to `/org/[orgToken]/agenda/turnos/[token]` (existing `AttendanceFormDispatcher`). |
| Attend form error state | ⚠️ `markAppointmentAttendedAction` error surface not re-verified in this pass — confirm the dispatcher shows an inline error (not a silent failure) before pilot. |

## Organization — role-first loop

Role-first landing per capability → primary queue.

| Checkpoint | State |
|---|---|
| Non-admin single-capability member | ✅ landing leads with the "Tu tarea principal" card; the member is not dropped onto the empty 5-section wall. |
| Capability cards | ✅ each card is capability-gated, so links never dead-end (a member only sees queues they can act on). |
| Solo clinic | ✅ early-returns to the agenda-first view (WS-vet). |
| Empty queues (e.g. no foster proposals) | ⚠️ per-queue empty copy not audited exhaustively here — spot-check `/voluntarios/propuestas`, `/checkins` empty states before pilot. |

## Lost & found — stranger-facing loop (June U3)

`/p/[token]/encontre` ("La tengo conmigo") and `/p/[token]/sighting`
("La vi cerca").

| Checkpoint | State |
|---|---|
| Back / breadcrumb | ✅ **already present** — both pages render "← Volver al perfil" in the header. |
| "What happens next" confirmation | ✅ **already present** — on submit, both forms render a closure screen: "¡Gracias! Le avisamos al dueño/a…" + a "Volver al perfil de {petName}" link. |
| Owner opted out of the finder form | ✅ `/encontre` degrades to a contact-links view (tel:/mailto: gated by disclosure prefs) with a back link. |
| Pet not lost | ✅ both degrade to a "no está perdida" view with a link back to the public profile. |
| 320px viewport | ⚠️ not re-measured this pass; layout uses `max-w-md` + single column + ≥44px targets, so no h-scroll expected — confirm on device before pilot. |

**Correction to the handoff premise:** WS-B expected the lost&found closure +
back to be missing (June U3). They are **already shipped** (see the `state.ok`
branch in `FinderInPossessionForm.tsx` / `PetSightingForm.tsx` and the header
back links). No code change was needed; this audit records that they meet the
"reassure the stranger their report reached the owner" bar.

## Summary

The concrete WS-B fix (lost&found closure + back) was already in place. The
primary loops complete with empty/loading/error/confirmation states. Remaining
items are **verify-before-pilot** (⚠️), not code gaps: (1) the org attend-form
error surface, (2) per-queue empty copy on the less-trafficked org queues,
(3) a 320px device pass. None change a flow's steps or a server action, so none
are escalations — they are QA checks for the pilot checklist.
