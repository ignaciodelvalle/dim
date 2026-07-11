# Org plan — pre-verification (cursor, 2026-07-11)

> READ-ONLY pre-verification run against integration/all-20260703 AFTER the vet fixes
> (line anchors below are CURRENT, superseding the plan's older ones). Consumed by the
> #18 executor: anchor status + audit-finding status + the REAL queue inventory for
> the org-type→queues matrix.

## 1. Plan anchor verification (`docs/plans/org-process-clarity.md`)

| Claim (plan) | Status | Current evidence |
|---|---|---|
| Checklist auto-hides when complete (`org-setup-checklist.ts:~136`) | **Still accurate** (lines drifted slightly) | `isSetupComplete` at `lib/infra/org-setup-checklist.ts:136-138`; panel uses `showChecklist = !isSetupComplete(setupSteps)` at `app/org/[orgToken]/page.tsx:246` and mounts checklist only when `showChecklist && isAdmin` at `:433-434`. No post-completion “daily loop” transition exists. |
| KPI row is `isShelter`-gated (`page.tsx:~429`) | **Still accurate** (drifted) | `isShelter = orgType === "shelter"` at `:163`; KPI section `{isShelter && (` at `:438-496`. Not applied to `rescue_network`. |
| Pendientes covers **3 of ~8** queues, not org-type-gated (`:~561-601`); maltrato / check-ins / ingresos missing | **Still accurate** (drifted) | Pendientes card at `:570-610` — only Casos (`:575-585`), Transferencias (`:586-596`), Propuestas de tránsito (`:597-607`). No org-type wrapper. No maltrato/check-ins/ingresos rows. Panel also has **Requieren acción** (`:498-568`, shelter-only) and **primaryJob** lead (`:344-377`, `:417-430`) — as the plan notes. |
| `sanitary_authority` thin surface (`:~753-777`) | **Still accurate** (drifted) | `:762-786` — two link-cards only (Casos + Mordeduras if `bite.report`). No KPI / Pendientes subset / checklist. |
| Nav pending-count badges: only admin outbox today | **Still accurate** | `NavItem.badge?: number` exists (`components/layout/HeaderNav.tsx:20-21`); admin injects outbox/alertas badges (`app/admin/layout.tsx:53-70`). Org layout calls `buildOrgNav` with no badge injection (`app/org/[orgToken]/layout.tsx:54-60`). `nav-presets.ts` has no org badge wiring. |
| Non-shelter sparse panel / no steady-state orientation | **Still accurate** | Clinic gets module grid (`:699-760`) + solo-vet agenda path (`:263-277`); rescue_network skips shelter KPIs/Requieren acción (`isShelter` only); SA remains 2 cards. |

---

## 2. Audit findings status (`docs/design/handoffs/2026-07-04-org-dashboards-audit.md`)

Plan callouts first, then remaining numbered findings.

| # | Finding | Status | Current evidence |
|---|---|---|---|
| 1 | Censo→mascotas `?species=` filter break | **ALREADY FIXED** | Links still emit species at `censo/page.tsx:93,106,119`; `mascotas/page.tsx:97-107` now reads/applies `sp.species` (dog/cat/other). |
| 3 | `Censo` missing from `SEGMENT_LABELS` | **ALREADY FIXED** | `OrgBreadcrumbs.tsx:34` — `censo: "Censo"`. |
| 4 | Permisos 3-way label conflict | **ALREADY FIXED** | Page-level `OpCrumbs` removed (`admin/permisos/page.tsx:154-157`); topbar uses `NESTED_SEGMENT_LABELS["admin/permisos"]="Permisos"` (`OrgBreadcrumbs.tsx:42-43,58-59`). H1 remains “Solicitudes de permisos” (`:157`) — not the old triple conflict. |
| 6 | Species-enum leak in `OrgMascotasBulkList` | **ALREADY FIXED** | Imports/uses `speciesLabel` (`mascotas/OrgMascotasBulkList.tsx:33,341`). |
| 2 | `mascotas` unbounded / no filter | **ALREADY FIXED** | Species/q/adoptionEligible filters (`mascotas/page.tsx:43-54,97-107`); `CUSTODY_LIST_CAP=200` + truncated (`:36,137,307`). |
| 5 | `miembros` / `servicios` no limit | **ALREADY FIXED** | `miembros/page.tsx:62-77` (`MEMBERS_PAGE_SIZE+1`); `servicios/page.tsx:38-49` (`SERVICES_PAGE_SIZE+1`). |
| 7 | `transferencias` no truncation signal | **ALREADY FIXED** | Sent: `transferencias/page.tsx:73,75,150`; received: `recibidas/page.tsx:114,159,171`. |
| 8 | `voluntarios/propuestas` filter-after-limit | **ALREADY FIXED** | Status in SQL WHERE before limit (`voluntarios/propuestas/page.tsx:42-69`). |
| 9 | Devolver / Eliminar without confirm | **ALREADY FIXED** | `InterventionActions.tsx:155+` `ConfirmDialog`; `DeleteRuleButton.tsx:64-74` `ConfirmDialog`. |
| 10 | `buildOrgNav` ignores `orgType` | **PARTIALLY FIXED** | `shelterOnly` + clinic filter (`nav-presets.ts:108,154-202,292`). **Still open for `sanitary_authority`** — not excluded by that filter. |
| 11 | No nested `loading.tsx`/`error.tsx` | **STILL OPEN** | Only `app/org/[orgToken]/loading.tsx` (root). No nested under intake/transferencias/mascotas/checkins/censo/transitos. |
| 12 | `DashboardFreshnessFooter` unused in `/org/*` | **STILL OPEN** | No mounts under `app/org/`; used on gob/admin only. |
| 13 | Admin identity marker inconsistency | **STILL OPEN** | Servicios eyebrow (`servicios/page.tsx:57-59`); miembros embeds name in H1 (`miembros/page.tsx:162-164`); permisos has neither. |
| 14 | Org picker no type icon/chevron | **STILL OPEN** | Text type label only (`app/org/page.tsx:111-117`). Brand header added (`:29-44`) but no type icon/chevron. |
| 15 | Truncation warn on voluntarios/intake/checkins | **PARTIALLY FIXED** | Voluntarios: truncated (`voluntarios/page.tsx:33-64,166`). Intake: `limit(100)` no truncated (`intake/page.tsx:78`). Checkins: `limit(30)` ×2 no truncated (`checkins/page.tsx:103,128`). |
| 16 | No free-text search on adopciones/voluntarios | **STILL OPEN** | Adopciones: status chips only (`adopciones/page.tsx:65-68`). Voluntarios: species/province/locality facets only (`voluntarios/page.tsx:18`). |
| 17 | Nav vs H1 label drift | **STILL OPEN** | H1 “Mis servicios” (`servicios/page.tsx:59`); H1 “Zonas de cobertura” (`cobertura/page.tsx:40`). |
| 18 | Missing breadcrumbs (agenda/voluntarios/casos) | **STILL OPEN** | No `OpCrumbs` in those pages (grep empty). |
| 19 | Maltrato no actor/timestamp for intervention | **STILL OPEN** | Status/intervention pills (`maltrato/recibidos/page.tsx:252-270`); no actor+timestamp of take/return. |
| Prior | Species leak elsewhere | **ALREADY FIXED** (was partial) | Was only `OrgMascotasBulkList`; now uses `speciesLabel`. |
| Prior | Org picker type affordance | **STILL OPEN** | Same as #14. |

Panel growth noted by plan: **Requieren acción** (`page.tsx:498-568`) + **primaryJob** (`:344-377`, `:417-430`) — confirmed present.

---

## 3. Queue inventory (actionable org work)

Org-type applicability from `capabilityAppliesToOrgType` / `SHELTER_ONLY_CAPABILITIES` (`src/modules/organizations/domain/capabilities.ts:147-175`) and page/nav gates. “Panel count” = dedicated count on org home.

| Queue | Route | Count query? | Org types |
|---|---|---|---|
| Casos abiertos | `/org/[orgToken]/casos` | **Yes** — panel `count()` open cases (`page.tsx:283-286,319-320`); list via `listCasesForOrg` | All with `pet.read_held` |
| Transferencias entrantes pendientes | `/org/[orgToken]/transferencias/recibidas` | **Yes** — panel `count()` open `custody_transfer_handshake` as receiver (`page.tsx:287-296,321`) | All with `org.transfer.accept` |
| Transferencias enviadas (abiertas) | `/org/[orgToken]/transferencias` | **No** dedicated count (list open+closed, capped) | All with `org.transfer.propose` |
| Propuestas de tránsito pendientes | `/org/[orgToken]/voluntarios/propuestas` | **Yes** — panel `count()` `fosterProposals.status='pending'` (`page.tsx:297-305,322`) | `shelter`, `rescue_network` (`foster.assign`) |
| Tránsitos activos | `/org/[orgToken]/transitos` | **No** count helper (list only) | `shelter`, `rescue_network` (`foster.assign`) |
| Adopciones pendientes | `/org/[orgToken]/adopciones` (default `?status=pending`) | **Yes** — `fetchActiveAdoptions` (`lib/analytics/org-dashboard.ts:198-219`); KPI only (`page.tsx:315,484-494`), **not** in Pendientes | `shelter`, `rescue_network` (`adoption.review`) |
| Check-ins overdue | `/org/[orgToken]/checkins` | **Page-local only** — `overdue.length` (`checkins/page.tsx:131-141`); **no** panel/shared count | `shelter`, `rescue_network` (`adoption.review`) |
| Requieren acción (custodia) | `/org/[orgToken]/mascotas` (via panel card) | **Yes** — `fetchRequiresAction` (`lib/analytics/org-dashboard.ts:235+`; panel `:307,498-568`) | **`shelter` only** (`isShelter` gate `:163,307,499`) — not `rescue_network` |
| Maltrato recibidos (derivados) | `/org/[orgToken]/maltrato/recibidos` | **No** count query (list `derivedToOrganizationId`, `limit(100)` — `:147-149`) | Roles `admin\|coordinator\|member\|vet_individual` (`nav-presets.ts:87-92`); any org type that receives derivations |
| Permisos pendientes | `/org/[orgToken]/admin/permisos` | **Page-local only** — `pending.length` (`admin/permisos/page.tsx:86,164-169`); **no** panel/nav badge | All with `capability.grant` |
| Agenda del día | `/org/[orgToken]/agenda` | **List helper** — `fetchTodayAgenda` (`lib/analytics/org-dashboard.ts:57-88`); used by solo-clinic landing, **not** a Pendientes count | Primarily `clinic` (`appointment.manage`); capability is universal |
| Ingresos (cola reciente) | `/org/[orgToken]/intake` | **No** actionable pending count (historical last-100 — `intake/page.tsx:57-78`); week KPI only for shelter (`fetchIntakesLastWeek`) | All with `intake.create` |
| Mascotas no aptas | `/org/[orgToken]/pets/no-aptas` | **No** count (full list — `pets/no-aptas/page.tsx:28-38`) | `shelter`, `rescue_network` (`canIntake && isRehoming`, `page.tsx:679`) |

**Pendientes today surfaces only rows 1, 2, and 4** of this inventory (`page.tsx:570-610`), ungated by org type.
