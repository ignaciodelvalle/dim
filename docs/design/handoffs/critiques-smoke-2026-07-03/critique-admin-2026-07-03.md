# Design Critique — Admin role (meta-admin / SUPERADMIN · UNIVERSAL)

**Product:** MiMAR (Mi Mascota Argentina) · internal codename DIM
**Account:** `admin@dim.test` (DIM Admin · universal scope, all jurisdictions)
**Viewport:** Desktop (~1560 wide)
**Date:** 2026-07-03 · **Build:** integration `d4b2516c`

---

## Surfaces walked

Panel de administración (`/admin`) · Bandeja de alertas (`/admin/alertas`) · Salud del sistema (`/admin/sistema`) · Outbox de notificaciones (`/admin/outbox`) · Auditoría global (`/admin/auditoria`) · Usuarios (`/admin/usuarios`) · Moderación (`/admin/moderacion`) · Gobiernos (`/admin/govts`) · Observaciones antirrábicas (`/admin/observaciones`). (Also present: `/admin/admins`, `/admin/cola`, `/admin/casos`, national analytics.)

---

## Overall impression

The admin portal is the platform's control tower and it's conceptually excellent: it opens by **explaining its own scope** ("alcance universal… estas colas se comparten con Gobierno, que las trabaja acotadas a su jurisdicción"), it has an SLA-driven **alert triage** lifecycle, a genuinely thorough **global audit log** (~90 action types, PII-search logging, business-rule change history), an **anti-bot moderation** pre-queue, a notification **outbox with SLA/retry**, and inline governance guardrails like the **"SIN LOCALIDADES — NO PUEDE OPERAR"** warning on govt accounts. The dominant problem is not the design of any one feature — it's that the **list/console surfaces don't scale**: they're flooded with seed/test rows and mostly lack search, filter, and pagination, so the real signal (the 4 pending approvals, the 1 live alert, the observations past legal deadline) drowns in noise. Some KPIs also contradict their own detail ("SLA ENO 100%" beside "12 en breach").

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **Audit log is unreadable due to bulk-op flooding.** ~150+ consecutive identical "Mutación forzada de evento de mascota (override)" rows (one seed backfill) fill the "last 200 entries," burying real events (PII searches, business-rule changes, decomisos). | 🔴 Critical (for the surface's purpose) | Collapse/group repeated identical actions ("Override ×147 by DIM Admin, 21:59–22:01") with expand-on-click, and/or exclude system-backfill actors by default. An audit log that can't be scanned defeats its accountability purpose. |
| **KPI contradicts its own detail.** Sistema shows "**SLA ENO 100%**" tagged "● Normal" while the same tile reads "**12 en breach activo**" — and the Outbox lists exactly 12 INCUMPLIMIENTO rows. | 🟡 Moderate | Fix the metric or the label. If 100% = "eventually delivered," rename it; a green "100%" next to "12 in breach" reads as a bug and erodes trust in the whole dashboard. |
| **Console lists don't scale.** Gobiernos renders ~55 rows (≈50 are `uc-cd-govt`/`uc-so-govt` seed accounts in "SIN LOCALIDADES" state) with **no search/filter/pagination**. "Actividad por govt" (Sistema) repeats `uc-cd-govt` ~24×. Usuarios shows 50 rows dominated by duplicate seed admins. | 🟡 Moderate | Add search + status filters (hide inactive / no-locality / test) + pagination to Gobiernos, Usuarios, and the Sistema activity table. Even with clean data, universal-scope lists need this. |
| **Usuarios list actions are all dead.** Every row (incl. GOVT users) shows "Sin acciones disponibles desde tu rol para este usuario," yet the dashboard promises admins "crea cuentas, asigna localidades y revoca accesos." | 🟡 Moderate | Surface the real actions on GOVT/personal users here, or make clear that management happens on the Gobiernos/Admins detail pages and link there. As-is it looks like an authz bug. |
| **Wrong portal label on an admin page.** `/admin/usuarios` header reads "**MIMAR GOBIERNO · USUARIOS**" while every other admin page reads "ADMIN". | 🟢 Minor | Fix the shared header's scope label for the admin context. |
| **Overdue rabies observations aren't visually flagged.** Observaciones lists items "EN CURSO" whose "Cierre estimado" is already in the past (e.g. 24/6, 3/7) — the govt Vigilancia counts "2 fuera de plazo," but here they look like any other active row. | 🟢 Minor | Add an "VENCIDA / fuera de plazo (10d)" badge on observations past their legal close date. |

## Visual hierarchy

- The **Panel** leads with the scope explainer, then three tiles (Usuarios / Cola pendiente / Decisiones 7d), then management entries (Gobiernos, Admins, Analítica nacional), then a "switch to a jurisdiction view" nudge — a clean top-down orientation for a universal operator.
- **Alertas** has an exemplary triage layout: rich filter bar (estado / métrica / provincia / date) → one alert row with Observado·Meta, Antigüedad, Estado badge, and Reconocer/Descartar actions. The "> 3 días = breach de SLA" rule is stated in-context.
- Sidebar grouping (ANALÍTICA / OPERACIONES / CONFIABILIDAD) is logical; the numeric badges (Alertas 1, Outbox 12) draw the eye to what needs attention — good.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Localization | Same as govt/org: species render raw ("dog", "cat", "other", "rabbit") in Observaciones; table headers miss accents ("JURISDICCION", "ACCION" in Outbox). | Centralize enum i18n; Spanish accent pass on headers. |
| Metric definitions | "SLA ENO" (100% vs 12 breach) and, cross-portal, "cobertura antirrábica" values differ by page. | One canonical definition per KPI across `/admin` and `/gob`. |
| Future-dated data | Footers show "último evento 31/12/26"; other portals showed 15/10/26. | Validate/clamp event dates (seed), never show future events as live. |
| List patterns | Some lists paginate (govt Maltrato), most admin lists don't. | Adopt one paginated + filterable list component platform-wide. |

## Accessibility

- KPI tiles use icon + word + color for severity (not color alone) and expose "ⓘ" info buttons — good.
- Numeric sidebar badges (Alertas/Outbox) should have accessible text ("12 items en incumplimiento"), verify SR output.
- Long unpaginated tables (Auditoría, Gobiernos) are a keyboard/SR burden as well as a visual one — pagination helps both.
- Verify contrast of the amber "SIN LOCALIDADES — NO PUEDE OPERAR" pill and the muted UUID subtext on white.

## What works well

- **Self-describing scope model** — the admin/govt shared-queue relationship is explained where the operator stands.
- **Audit taxonomy** is exceptional (~90 typed actions incl. "Búsqueda de información personal", "Datos del titular exportados/eliminados", "Regla de negocio creada/actualizada/eliminada", "Mutación forzada… (override)").
- **Alert triage with SLA** and an **anti-bot moderation pre-queue** ("Submit sospechoso por tiempo (posible bot)") are mature trust-&-safety surfaces.
- **Outbox** as a first-class dead-letter/retry queue with SLA, destino, and per-row Detalle — real ops tooling.
- **Inline governance guardrails**: "SIN LOCALIDADES — NO PUEDE OPERAR", "Sin acciones disponibles… para este usuario", chip **ISO 11784/11785 validity** metric.
- **Cross-role data integrity**: the admin Observaciones list shows Firulais/Lucía Tester's rabies observation (Cierre 11/7) — the same case visible in the owner portal. The event-sourced model is coherent end-to-end.

## Priority recommendations

1. **Make the audit log scannable** — collapse bulk/identical actions and default-exclude system backfill actors. It's the accountability centerpiece and currently unusable.
2. **Add search / filter / pagination** to Gobiernos, Usuarios, and the Sistema activity table (and reconcile the dead "Sin acciones" rows with the promised admin actions).
3. **Fix contradictory / inconsistent KPIs** ("SLA ENO 100%" vs 12 breach; cross-page metric definitions) and finish localization (species enums, accented headers).

## Notes / to verify

- No admin mutations were performed (no account creation, no verification revoke, no alert/observation closure, no forced override) — all side-effectful controls were inspected only.
- Most seed-data volume issues (duplicate `uc-cd-govt`, `PANO-Seed-Owner`, 150 override rows) are test-data artifacts, **but** they expose a genuine design gap: universal-scope consoles need filtering/pagination to be usable with real production volume.
