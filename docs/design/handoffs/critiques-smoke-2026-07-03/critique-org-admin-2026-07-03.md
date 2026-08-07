# Design Critique — Org-admin role (organización · admin)

**Product:** MiMAR (Mi Mascota Argentina) · internal codename DIM
**Account:** `alejo@dim.test` (Alejo Caride · admin of **all four** org types)
**Orgs:** Refugio Patitas del Norte (shelter · Palermo · `DIM-TC7Z-APW6`), Clínica Veterinaria Recoleta (clinic · `DIM-6TZM-DUJZ`), Red de Rescate Puerto Madero (rescue network · `DIM-KN7W-JTB8`), Mascotas BA Centro (sanitary authority · `DIM-PWZR-B75C`)
**Viewport:** Desktop (~1280–1560 wide)
**Date:** 2026-07-03
**Build:** integration `d4b2516c`

---

## Surfaces walked

Org picker (`/org`) · Panel (per org) · Agenda · Ingresos/Intake (list + 4-step Registrar wizard) · Censo · Tránsitos · Voluntarios (pool + filters) · Mascotas (custody) · Transferencias · **Operaciones/Adopciones** · Check-ins · Casos · Maltrato (recibidos/emitidos) · Mordeduras · Servicios (3-step create) · Configuración (profile + capacity) · Miembros (invite + roster) · "Tus permisos" panel. Adoptions route tested on 3 of 4 orgs.

---

## Overall impression

This is the most ambitious and most polished part of the product: a real multi-tenant operations console that **adapts by organization type** (shelter / clinic / rescue network / sanitary authority) and by the member's **capability set**. The dark operator sidebar, the per-org onboarding checklist ("Primeros pasos 2/4"), the KPI strip, and the outstanding **"Tus permisos"** panel (admin sees *ADMIN · TODOS LOS PERMISOS* with a "Revisar solicitudes →" approval queue; a vet sees a granular grant/request list) together feel genuinely enterprise-grade. The headline problem is a **hard crash on the Adoptions/Operaciones page whenever the org has live adoptions** — which is exactly the org an adoption operator cares about most.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Adoptions/Operaciones crashes (server-render error boundary).** On Refugio Patitas del Norte — the org whose panel advertises **"Adopciones en curso: 2"** — `/org/.../adopciones` throws "Algo salió mal" (digest/code shown, e.g. 372514334). **"Reintentar" re-throws.** The same route renders fine on the two orgs with **zero** active adoptions (rescue network, sanitary authority). Console shows `Error: An error occurred in the Server Components render`. | 🔴 Critical | Data-dependent bug: the Operaciones list crashes when rendering in-progress/active adoption rows. Reproduce by seeding an active adoption; fix the server component (likely a null/enum/date field on the active-adoption projection). This blocks the shelter's core workflow. |
| **Panel KPI links into a broken page.** The amber "Adopciones en curso 2" KPI and the sidebar "Operaciones" both route to the crashing page, so the failure is front-and-center. | 🔴 Critical | Same root cause; once fixed, verify the KPI → Operaciones deep link lands on the pending/active tab. |
| **Species enums leak untranslated.** Intake "Ingresos recientes" shows **"guinea_pig"**; the Voluntarios "MATCH PARA" dropdown shows **"Toby (dog)", "Coco (cat)", "Bichita (guinea_pig)"** — raw English/snake_case. Censo correctly localizes ("Perros/Gatos/Otros"). | 🟡 Moderate | Route all species rendering through one i18n map (dog→Perro, cat→Gato, guinea_pig→Cobayo…). It currently reads as half-finished in an otherwise Spanish product. |
| **One feature, three names.** Sidebar **"Maltrato"** → top bar **"Bienestar"** → page title **"Investigaciones de maltrato"** for the same module. | 🟡 Moderate | Pick one label (recommend "Maltrato" or "Bienestar") and use it in sidebar, breadcrumb, and title. |
| **Duplicated empty-state copy** on the custody list (subtitle == body: "Todavía no hay animales registrados…"). | 🟢 Minor | Render once. |
| **Org picker cards lack affordance.** Four look-alike cards, entirely clickable but with no chevron/icon and no visual distinction between the four org *types*. | 🟢 Minor | Add a type icon/color and a hover/next affordance so the four are scannable and obviously clickable. |

## Visual hierarchy

- **Panel** is well-sequenced: role-context line ("Actuando como Administrador/a — Coordinador general") → onboarding checklist → KPI strip (Ocupación / Ingresos / Disponibles / Adopciones en curso) → "Requieren acción" → "Pendientes". An operator can triage in one screen.
- KPI cards use restrained color (green "Disponibles", amber "Adopciones en curso") and each has an "ⓘ Información sobre este indicador" affordance — good for a data product.
- The completed onboarding items use strikethrough + green check — satisfying and legible.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Org-type differentiation | The **module set is nearly identical** across shelter, rescue network, and **sanitary authority** — the "Autoridad sanitaria" panel still centers custody/intake/foster/adoption/check-ins. A government sanitary authority acting as an adoption/foster operator is conceptually odd. | Decide whether org *type* should meaningfully reshape the nav (an authority likely wants oversight/derivations, not a foster pool). Today the type mostly changes the panel title and onboarding copy. |
| Route naming | Sidebar labels don't match URL slugs (Ingresos→`/intake`, Operaciones→`/adopciones`, Maltrato→`/maltrato/recibidos`). Cosmetic, but `/ingresos` 404s. | Fine internally; just ensure no user-facing link points at `/ingresos`. |
| Wizards | Intake (4-step) and Servicios (3-step) use consistent stepper patterns and "Continuar" primary buttons — good. | Keep this as the canonical multi-step pattern. |

## Accessibility

- **Dark-green sidebar:** active item contrast is good; verify muted section headers ("OPERACIÓN", "ADOPCIONES") and inactive items hit 4.5:1.
- The rescue-network onboarding exposes a screen-reader line "Progreso de configuración: 2 de 4 pasos completados" — nice; ensure the shelter panel's "3/5" has the same.
- **Error-boundary page** is accessible and helpful (icon + plain text + support code + Reintentar/Volver) — a good pattern, just shouldn't be reached here.
- KPI "ⓘ" info controls are real buttons with labels ("Información sobre este indicador") — good.

## What works well

- **Capability model + "Tus permisos".** Admin sees *TODOS LOS PERMISOS* and an approval queue ("Revisar solicitudes"); scoped members see per-capability grant/request. Best-in-class authorization transparency.
- **Org-type-adaptive panels** with per-org onboarding checklists and KPI strips.
- **Domain-rich forms.** Intake models microchip country, tattoo, lost-pet chip match, and "custodia temporal vs dueño permanente"; Services encode an authority-approval step before scheduling.
- **Volunteer matching** with province/locality/species filters and per-animal "MATCH PARA" targeting.
- **Governance guardrails.** Configuración states that org *type, jurisdiction, and verification are managed by the MiMAR team* — orgs can't self-verify.
- **Post-adoption Check-ins** (adopter self-reporting in agreed windows) is a thoughtful welfare feature.

## Priority recommendations

1. **Fix the Adoptions/Operaciones crash** (data-dependent server render on active adoptions). It's the shelter's primary job and it's currently unreachable.
2. **Unify species localization** across every list/dropdown; kill raw `dog`/`guinea_pig`.
3. **Resolve the Maltrato/Bienestar/Investigaciones naming** and other label/title mismatches, and reconsider whether "Autoridad sanitaria" should share the shelter operations nav.

## Notes / to verify

- No create/submit actions were fired (intake, services, invites) to avoid writing data; forms were inspected structurally only.
- Recurring **screenshot/render timeouts** persisted at this build — heavy org pages were slow to paint. Worth a production performance profile (main-thread work / bundle size on org routes).
