# Design Critique — Vet role (veterinario/a)

**Product:** MiMAR (Mi Mascota Argentina) · internal codename DIM
**Account:** `lilian@dim.test` (Dra. Lilian Marrone · personal account, professional-upgraded · "Vet de planta" at Clínica Veterinaria Recoleta)
**Viewport:** Desktop, 1278×944
**Date:** 2026-07-03
**Stage:** Working app / pre-launch polish

---

## Surfaces walked

1. Login → post-login landing at **My organizations** (`/cuenta/memberships`)
2. **Portales** portal switcher (header)
3. Clinic **org portal panel** (`/org/DIM-6TZM-DUJZ`)
4. **Tus permisos** capability panel
5. Custody list — **Animales en custodia** (`/org/.../mascotas`)
6. **Reportar mordedura** intake form (`/org/.../mordedura/nuevo`)
7. **Miembros** — team roster (`/org/.../miembros`)
8. Personal home dashboard (`/inicio`)

> The vet is a *personal* account (can own pets) that has been upgraded to professional and affiliated to a clinic. So she lives across **two** design languages: the light "citizen" portal (identical to the owner experience) and the dark "organization" console. This critique focuses on what's distinct to the vet; owner-side findings are in the owner critique.

---

## Overall impression

The org console is the standout of the whole product: a focused, professional clinic-operations UI with a role-context banner ("Actuando como **Veterinario/a** — Vet de planta") and — the highlight — a **"Tus permisos"** panel that lists every capability with its code, a plain-language description, its granted/not-granted state, and a one-click **Solicitar** to request it. That's a genuinely excellent, trust-building authorization UX that most enterprise apps never bother to build. The biggest opportunity is **making menu access match the stated permission model** — today a vet can open the full "Reportar mordedura" create form even though `bite.report` reads **NO CONCEDIDO**.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Menu access ≠ permission model.** "Tus permisos" states *"Cada permiso habilita su módulo en el menú."* But the **Mordeduras** item is active and routes to the complete 4-step create form (`/mordedura/nuevo`) despite `bite.report` = NO CONCEDIDO. | 🔴 Critical | Either hide/disable the menu item until the capability is granted, or land un-permissioned users on a "request this permission" gate instead of the working form. As-is, a vet can fill a legally-consequential bite report (auto-starts 10-day rabies observation) she isn't authorized to file, only to (presumably) be blocked at submit — wasted effort and confusing. Reconcile the copy with actual behavior. |
| **Personal greeting bug:** home reads **"Buen día, Dra.."** — doubled period, and uses the *title* ("Dra.") instead of a name. The org portal correctly shows "Dra. Lilian Marrone." | 🟡 Moderate | Fix the personal display-name derivation (first name or "Dra. Marrone") and the trailing-period concatenation. |
| **Portal switcher is easy to miss.** Moving between the personal portal and the clinic is done via a subtle "Portales ▾" text button; a vet may not discover how to reach their clinic. | 🟡 Moderate | Give the switcher more affordance (icon + org name, or a persistent "You're in: Personal / Clínica Recoleta" context chip). |
| **Duplicated empty-state copy.** Custody list shows *"Todavía no hay animales registrados a nombre de la organización."* twice — once as subtitle, once as body. | 🟢 Minor | Render once; consider an illustrative empty state with the primary "Registrar ingreso" CTA. |
| Post-login lands on **My organizations**, not a work surface. | 🟢 Minor | For a single-membership vet, consider landing directly in the clinic panel (or offer "continue to Clínica Recoleta"). |

## Visual hierarchy

- **Org panel** leads with **"Tu tarea principal → Registrar ingreso"**, then **Pendientes** (Casos abiertos, Transferencias, Propuestas de tránsito) with count chips — a clear, task-first hierarchy that's correct for an operator.
- The **role-context line** ("Actuando como Veterinario/a — Vet de planta") is subtle but valuable; consider elevating it slightly so the vet always knows the hat they're wearing.
- Count chips use amber for "1 pending" vs grey "0" — reads instantly.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Identity | Personal side resolves the vet's name to **"Dra."**; org side shows **"Dra. Lilian Marrone."** | Single name-resolution source across portals. |
| Two design systems | Light citizen portal vs dark org console is an intentional, helpful context cue — but the vet crosses the boundary. | Signpost the transition (a brief "Entering organization workspace" affordance or persistent context chip) so the switch never feels like a different app/bug. |
| Nav labels | Sidebar item **"Mascotas"** opens a page titled **"Animales en custodia"** (breadcrumb "Mascotas"). | Align the sidebar label and the page title. |

## Accessibility

- **Dark-green sidebar:** the active item (lighter green fill) is clearly distinguished. Verify muted section headers ("OPERACIÓN", "ANIMALES", "ADOPCIONES") and inactive item text meet 4.5:1 against the dark green — they look light.
- **"Continuar" button** on the bite form is tan/gold with white text — verify contrast (white on ~#C9A66B is likely **below** 4.5:1). Darken the button or use dark text.
- **Permission chips** ("CONCEDIDO"/"NO CONCEDIDO") pair color with text — good, not color-only.
- Search box "Buscar mascota… /" advertises a keyboard shortcut — nice; ensure it's reachable and labeled for SR users.

## What works well

- **"Tus permisos" self-service authorization panel** — capability code + plain-language description + status + request button. Best-in-class transparency; keep and lean into it.
- **Role-context banner** ("Actuando como…") so the user always knows their acting role and title.
- **Capability scoping done right in Miembros**: the vet sees the team roster read-only, and the "Invitar miembro" action simply isn't present (vs a dead/disabled button).
- **Bite-report form** frames the legal trigger up front ("Inicia automáticamente el período de observación antirrábica de 10 días…") and uses a clean 4-step stepper with token-based pet lookup.
- **Verified-org signal** (VERIFICADA badge) on the membership card builds trust.

## Priority recommendations

1. **Reconcile menu visibility with capabilities** — gate the Mordeduras create form (and any other create route) behind its capability, or land un-permissioned users on a request screen. Make "cada permiso habilita su módulo" literally true.
2. **Fix the personal identity/greeting** ("Buen día, Dra..") and unify name resolution across portals.
3. **Make the Portales switcher discoverable** so vets reliably find their clinic workspace.

## Notes / to verify

- Did **not** submit the bite report (side-effectful — would create a case and trigger rabies observation). The gap is that the form is *reachable*; whether submit is server-side-blocked for a vet without `bite.report` should be verified in code (RLS).
- Dev-server pages were slow to paint (repeated screenshot retries) — likely dev-mode, worth a production perf pass.
