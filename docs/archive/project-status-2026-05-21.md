# MiMAR (DIM) — Estado del proyecto: implementado / en curso / planeado / diferido

> **Fecha:** 2026-05-21 · **Owner:** Ignacio Del Valle
> **Última revisión:** 2026-05-21 evening — round de decisiones sobre items diferidos (§4.19-4.22 nuevos, §5.5/§5.6/§5.7 actualizados, §7 con cola completa).
> **Update 2026-05-21 late:** §6.1 verificado **ya estaba cerrado en código** (tabla `cases` declarada en `db/schema.ts:2442`); el único trabajo real era el wiring del TODO `L-followup` en `/gob` home, que se hizo. Se agregan §6.7 (script roto) y §6.8 (drift menor) detectados durante la verificación.
> **Reemplaza a:** `docs/feature-inventory-2026-05-20.md`, `docs/implementation-plan-2026-05-20.md`, `docs/unapplied-specs-audit-2026-05-20.md`, `docs/action-plan-2026-05-20.md` (los cuatro mezclados acá; las versiones originales quedan en `docs/archive/` para historia).
> **Verificado contra:** working tree en `C:\dev\dim` (`develop`, 42 migraciones, último commit del día 2026-05-21).
> **Cómo leer:** §1-3 te dicen *qué hay shipped*, §4 *qué queda*, §5 *qué se difirió y por qué*, §6 *qué está roto/inconsistente*.
>
> **Convenciones de estado:**
> ✅ shipped y verificado en código · 🟢 spec'd + plan listo (a tomar por Claude Code) · 🟡 parcial (parte shipped, parte no) · ⚪ planeado / sin plan escrito · ❎ diferido (con razón explícita) · 🔴 deprecado

---

## 1. Resumen ejecutivo

**El gap entre lo planeado y lo shipped es muchísimo más chico que lo que decía el audit del 2026-05-20.** Esa nota la dejó la `implementation-plan-2026-05-20.md` y se confirma acá: en las últimas 24 horas se cerraron Chunks A.5, C, D, E, F y H-M. La lista de "todavía falta" se redujo a un puñado de items concretos, sub-día cada uno (salvo el adoption handshake unified, que sigue diferido por decisión de producto, y la integración Mi Argentina, que es un blocker externo).

**Lo que falta cerrar antes de poder llamar a esto "v1 lista para demo":**

1. ~~Test-gating en CI~~ — **CERRADO 2026-05-20** (commit `c13345d`, PR #79). Falta solo verificar branch protection en GitHub UI (5 min owner — §4.1).
2. ~~Cierre del schema gap del sistema de casos~~ — **CERRADO 2026-05-21 late**: tabla `cases` ya estaba en `db/schema.ts:2442`; se cableó el TODO L-followup en `/gob` home (ver §6.1 actualizado).
3. **`receiverOrganizationId` en `cases`** para cerrar la canonización del cross-org transfer (§4.2). **Ya desbloqueado**.
4. **Bulk revoke UI** en las 4 colas de admin/gob (server action shipped, UI sin cablear — §4.6).
5. **Aplicar `db/foster_rls.sql` en Supabase Studio** (paso manual de 15 min — §4.3).

Todo lo demás importante de la versión anterior del plan ya está shipped y verificado.

**Items diferidos por decisión explícita** (ratificados 2026-05-21): adoption handshake 28-preguntas (§5.1), PPP Prov BA v2 (§5.2), spec completo de `physical-tag` (§5.7.1 — el placeholder en pet profile sí entra a cola en §4.20).

**Activados desde diferido 2026-05-21:**
- 3 case_kinds restantes (§4.19 / §5.5): `foster_proposal`, `custody_episode`, `outbreak_investigation`. Spec nuevo en `docs/superpowers/specs/2026-05-21-deferred-case-kinds-design.md`.
- Placeholder `physical-tag` en pet profile (§4.20). Spec en `docs/superpowers/specs/2026-05-21-physical-tag-placeholder-design.md`.
- 11 specs §5.6 a la cola con plan-writing just-in-time (§4.21).
- Chunk N iconic-dataset cleanup al **final** de la cola, con `/design-critique` post-run (§4.22 / §5.3).

**Blockers externos** (sin ETA, fuera de la cola): Mi Argentina OAuth + RENAPER directo + Authority dispatch (§5.4).

**Long-horizon testing** (§5.8): sigue diferido hasta cerrar §4 + §5.5 + §5.6.

---

## 2. Modelo de actores y arquitectura (referencia rápida — todo shipped)

### 2.1 Cuatro roles autoritativos (`profiles.role`, DB-enforced)

| Rol | Account type | Portal principal | Puede tener mascotas | Notas |
|---|---|---|---|---|
| `owner` | personal | `/mis-mascotas` | sí | Default de signup. Puede ser upgradeado a `vet`. |
| `vet` | personal | `/org/[orgToken]` de su clinic | sí | Vet individual = clinic de 1 miembro. `/pro` deprecated. |
| `govt` | institutional | `/gob` | no | Locality-scoped vía `govt_assignments`. |
| `admin` | institutional | `/admin` | no | Universal scope. |

### 2.2 Memberships dentro de una org (`organization_membership_role`)

`admin`, `coordinator`, `member`, `volunteer`, `foster`, `vet_individual` — todos vigentes. La flag `organization_memberships.can_write_pet_events` gatea todos los `events.write.*` y default es false.

### 2.3 Sistema de casos (case_kind) — 8 de 12 kinds con lifecycle V1

| Kind | Estado | Lifecycle |
|---|---|---|
| `bite_incident` | ✅ V1 | abre con `incident_reported(bite_inflicted)` + atómico `rabies_observation_started`; cierra con `rabies_observation_ended` (cron 12h día 11) |
| `lost_pet_episode` | ✅ V1 | abre con `status_changed→lost`; cierra con `status_changed→active` o `custody_transferred` o cron 180d |
| `welfare_denuncia` | ✅ V1 | abre con INSERT en `welfare_reports`; cierra con `welfare_reports.status='closed'` |
| `adoption_listing` | ✅ V1 (único con reopen) | abre con `adoption_eligibility_set(eligible=true)`; cierra con eligibility=false o cron-close-followup; `adoption_reversed` reabre |
| `adoption_application` | ✅ V1 | abre con `adoption_application_submitted`; cierra con `adoption_application_resolved` o cascade F5.5 |
| `custody_dispute` | ✅ V1 | admin/govt only; escalation cron 365d |
| `foster_placement` | ✅ V1 | abre con `foster_assigned`; cierra con `foster_ended` |
| `custody_transfer_handshake` | ✅ V1 | abre con `custody_transfer_proposed`; cierra con `custody_transferred` o cancel/reject/expiry 30d |
| `custody_episode` | ❎ diferido | — |
| `foster_proposal` | ❎ diferido | — |
| `outbreak_investigation` | ❎ diferido | — |
| `microchip_remediation` | ✅ activo en código | UI shipped 2026-05-20 (`microchip_replaced`), lifecycle conecta sólo en `fraud_detected`/`duplicate_detected` |

**Surfaces de casos shipped:** `/casos/[publicCode]` (role-aware), `/admin/casos`, `/gob/casos`, `/org/[orgToken]/casos`.

**~~⚠️ Schema gap~~** — **RESUELTO 2026-05-21 late**: la tabla `cases` está declarada en `db/schema.ts:2442-2549` con CHECK constraints, partial unique indexes y types completos. Las columnas FK relacionadas también (`pet_events.case_id` en 847, `welfare_reports.case_id` en 1126, `notifications.related_case_id` en 1016). El TODO `L-followup` en `app/gob/page.tsx:247` fue cableado a `listCasesForGovt()` / `listCasesForAdmin()`. Ver §6.1.

---

## 3. Inventario por área (qué está shipped)

> Este es el catálogo grande. Items con ✅ están verificados en el repo HEAD. Las celdas con 🟢/🟡/⚪/❎/🔴 saltan al §4 o §5 para detalle.

### 3.1 Owner-facing — Auth & cuenta

| # | Feature | Ruta | Estado |
|---|---|---|---|
| 3.1.1 | Signup con primera-mascota inline + Mi Argentina placeholder | `/signup` | ✅ |
| 3.1.2 | Login email/password + MA placeholder | `/login` | ✅ |
| 3.1.3 | Logout (server action) | `signOutAction` | ✅ |
| 3.1.4 | OAuth callback | `/auth/callback` | ✅ |
| 3.1.5 | Editar perfil | `/cuenta/editar` | ✅ |
| 3.1.6 | Verificación de DNI (provider placeholder) | `/cuenta/verificar-dni` | 🟡 — RENAPER real ⚪ (§5.4) |
| 3.1.7 | Upgrade a vet con review admin | `/cuenta/upgrade` | ✅ |
| 3.1.8 | Memberships (mis orgs) | `/cuenta/memberships` | ✅ |
| 3.1.9 | Renunciar a membership | `/cuenta/renunciar` | ✅ |
| 3.1.10 | Solicitudes (approval requests) | `/cuenta/solicitudes` | ✅ |
| 3.1.11 | Desactivar cuenta | `/cuenta/desactivar` | ✅ |
| 3.1.12 | Inicio (home — Chunk I, v2 activado) | `/inicio` | ✅ |
| 3.1.13 | Notificaciones inbox (read/archive) | `/notificaciones` | ✅ |

### 3.2 Mis mascotas — gestión

13 features, todas shipped (`/mis-mascotas`, `/mis-mascotas/[publicToken]`, `nueva`, `editar`, vecino-en-tránsito, match-flow, reclamar gated por `STUB_CLAIM_ENABLED=false`, postulaciones, perdida, devolución, asistencia, captura rápida `/anotar`, historial). El detail (`/mis-mascotas/[publicToken]/page.tsx`) corre la versión Chunk J ("Option B — Hybrid swap").

### 3.3 Eventos (catálogo de 41 tipos)

Todos los forms en `eventos/nuevo/*` shipped y testeados. El único que estaba en 🟢 hace 24h — **`microchip_replaced`** — shipped en 3 surfaces el 2026-05-20: `/eventos/nuevo/microchip-reemplazo`, `/org/.../microchip/reemplazar`, `/admin/observaciones/[publicToken]/microchip/reemplazar`.

System-emitted: `credential_scanned` (con `is_self_scan`), `outbreak_signal` (cuando match reportable disease).

### 3.4 Libreta sanitaria

| # | Feature | Estado |
|---|---|---|
| 3.4.1 | Libreta agrupada + cronológica + print | ✅ |
| 3.4.2 | Vacunas (lista + programar) | ✅ |
| 3.4.3 | Tier-2 shareable con share token revocable | ✅ |

### 3.5 Credencial pública

Tier 0 / 0+ / 1 todos shipped en `/p/[publicToken]`. Lost mode (Chunk K, swapped in) con red banner, finder form, scan tracking, self-scan filter. Org branding badge gateado por `tier_0_show_branding` + `pet.tier0ShowOriginOrg`. El layout Chunk K vive en la ruta live (los `*-v2` ya no existen).

### 3.6 Turnos owner-side

5 rutas shipped: `/turnos/buscar`, `[offeringToken]`, `reservar/[slotId]`, `/mis-turnos`, `/mis-mascotas/[publicToken]/turnos`.

### 3.7 Adopciones — surface público

| # | Feature | Estado |
|---|---|---|
| 3.7.1 | Listing público `/adoptar` con filtros (SSR para SEO) | ✅ |
| 3.7.2 | Detail `/adoptar/[petToken]` | ✅ |
| 3.7.3 | Postular (form actual 4-campos + Chunk D3 consent) | ✅ — el wizard 28-q queda diferido (§5.1) |
| 3.7.4 | Sitemap + JSON-LD (Chunk D4+D5) | ✅ |

### 3.8 Tránsito / voluntariado (foster volunteer pool)

| # | Feature | Estado |
|---|---|---|
| 3.8.1 | Form "ofrecerme como hogar de tránsito" + pre-check D13 | ✅ |
| 3.8.2 | Propuestas recibidas (`/cuenta/transitos/propuestas`) | ✅ |
| 3.8.3 | Tránsitos activos (`/cuenta/transitos/activos`) | ✅ |
| 3.8.4 | Historial (`/cuenta/transitos/historial`) | ✅ |
| 3.8.5 | Surface unificado org-side `/org/[orgToken]/transitos` | ✅ |

### 3.9 Denuncias welfare (Ley 14.346)

| # | Feature | Estado |
|---|---|---|
| 3.9.1 | Form público — wizard 5 pasos (Chunk M) `/denuncias/nueva` | ✅ |
| 3.9.2 | Tracking anónimo `/denuncias/codigo/[code]` | ✅ |
| 3.9.3 | Buscar denuncia | ✅ |
| 3.9.4 | Bridge a `pet_events` (`maltreatment_reported`, etc.) | ✅ |
| 3.9.5 | Welfare-officer queue (`/gob/maltrato`) | ✅ |
| 3.9.6 | Moderation queue (`/admin/moderacion`) | ✅ |
| 3.9.7 | Cron escalate stale welfare cases | ✅ |
| 3.9.8 | Export MPF CABA + PPP CABA (Chunk F) | ✅ |
| 3.9.9 | Live MiMAR chip lookup en step 4, evidence uploader, save-as-image | 🟢 6 TODOs `M-followup` pendientes |
| 3.9.10 | Export PPP Prov BA | ❎ v2 (§5.2) |

### 3.10 Org portal (`/org/[orgToken]/*`)

Capabilities-driven vía `lib/org-permissions.ts`. Todas las áreas shipped:
- **Setup/admin**: dashboard, member management, coverage zones.
- **Intake**: form new pet + transfer-in, match flow, Flows 1/2a/2b.
- **Custodia entre orgs**: 7 rutas (listar, proponer, aceptar, cancelar, cron expiración 30d, devolver al dueño, return to street).
- **Foster member-based**: asignar, terminar, surface unificado.
- **Foster volunteer pool**: browse `/voluntarios`, propuestas emitidas, match scoring (`lib/foster-matching.ts`), cron expiración 7d.
- **Adopciones**: eligibility, listing, pipeline, review/approve/reject (Flow 6), finalize atómico (Flow 7), revocar (Flow 9 admin-only), checkins, 2 crones (auto-expire, close-followup).
- **Eventos clínicos**: 4 categorías de capability gateadas.
- **Agenda & servicios**: 6 rutas + cron materialize-slots.
- **Welfare org-side**: recibidos, nueva-desde-org, detail, mordedura form, listado mordeduras.
- **Casos org-scope**: `/org/[orgToken]/casos`.

### 3.11 Perfil público refugio

`/refugios/[orgToken]` — solo orgs verificadas tipo shelter o rescue_network. ✅

### 3.12 Admin portal (`/admin/*`)

14 áreas, todas shipped: dashboard, admins, govts, usuarios, organizaciones, cola revisión, auditoría, historial, casos, observaciones rábicas, moderación welfare, servicios, sistema, jurisdicciones (con business-rules engine completo).

### 3.13 Gob portal (`/gob/*`) — Chunk L activado

Home con KPIs reales (Chunk L + L-followup, no más placeholders), 13 sub-rutas shipped:
- Casos en jurisdicción, cola, disputas, maltrato (welfare officer), perdidas, vigilancia, organizaciones, usuarios, servicios, reglas locales, historial.
- Dashboards enriquecidos Chunk E1-E5: MetricCards + MapChoropleth + TimeSeriesChart + JurisdictionSwitcher + PeriodPicker.
- Async export endpoint (Chunk E6) `/gob/analytics/export` con CSV/JSON anonimizado, Zod-per-slice, Storage signed URL 24h, Resend email, audit_log.

### 3.14 Crones (12 handlers)

11 de 12 shipped y funcionando: `auto-expire-approvals`, `business-rules-reeval`, `close-followup-expired-adoptions`, `close-rabies-observations` (12h cadence configurado en `vercel.json`), `close-stale-lost-episodes`, `escalate-stale-disputes`, `escalate-stale-welfare-cases`, `expire-cross-org-transfers`, `materialize-slots`, `post-adoption-checkin`, `vaccine-due` (Chunk C2, con throttle por variante). El 12vo (`expire-foster-proposals`) está activo en código vía el foster pool.

### 3.15 Surveillance & disease

| # | Feature | Estado |
|---|---|---|
| 3.15.1 | Symptom-disease surveillance + outbreak_signal | ✅ |
| 3.15.2 | Bite-rabies observation 10-day | ✅ |
| 3.15.3 | Cron cierre observaciones rábicas | ✅ |
| 3.15.4 | Vaccination-due UX (Chunk C, end-to-end) | ✅ |
| 3.15.5 | Vigilancia view govt | ✅ |
| 3.15.6 | ENO v1 — vet diagnosis auto-notify (`lib/eno-trigger.ts`) | ✅ |
| 3.15.7 | ENO v2 — dedicated JSONB queue column | ⚪ TODO en `lib/eno-trigger.ts:162` |

### 3.16 Identity & legal

| # | Feature | Estado |
|---|---|---|
| 3.16.1 | Microchip implant + tracking | ✅ |
| 3.16.2 | Dangerous breed (PPP) flag + attestation + export CABA (Chunk F) | ✅ |
| 3.16.3 | PPP export Prov BA | ❎ v2 (§5.2) |
| 3.16.4 | Disposition method en `death_recorded` (Ley CABA 5470) | ✅ |
| 3.16.5 | Acquisition method en `pet_registered` (EAH 2018) | ✅ |
| 3.16.6 | Emergency contact + preferred vet en `profiles` (J-followup, migration 0042) | ✅ |
| 3.16.7 | DNI verification real (RENAPER) | ⚪ (§5.4) |
| 3.16.8 | Mi Argentina OAuth | ⚪ (§5.4) |

### 3.17 Design system & UI

| # | Feature | Estado |
|---|---|---|
| 3.17.1 | Poncho primitives (Badge/Panel/EmptyState/Tabs/Alert/DateRangePicker/ReminderCard/MetricCard/MapChoropleth/TimeSeriesChart/JurisdictionSwitcher/PeriodPicker) — Chunk A.5 + E1 | ✅ |
| 3.17.2 | UI v2 swap-in (Chunks H-M activados, las rutas `*-v2` ya no existen) | ✅ |
| 3.17.3 | EventCatcher (owner home, Chunk I) | ✅ |
| 3.17.4 | CasesWidget | ✅ |
| 3.17.5 | KpiTile + JurisdictionFilterBar + GobDashboardShell (Chunk L) | ✅ |
| 3.17.6 | pet-profile components (13 files, Chunks J + K) | ✅ |
| 3.17.7 | Denuncia wizard `app/denuncias/nueva/DenunciaWizard.tsx` (Chunk M, 5 pasos + success) | ✅ |

### 3.18 Infra & cross-cutting

| # | Feature | Estado |
|---|---|---|
| 3.18.1 | Event sourcing hardening (Zod estricto + append-only triggers + validateEventPayload) | ✅ |
| 3.18.2 | Bidirectional geocoding (text ↔ pin via Nominatim/OSM) | ✅ |
| 3.18.3 | Tier-2 share telemetry en tabla dedicada | ✅ |
| 3.18.4 | Bulk operations para refugios high-capacity | ⚪ Chunk G (bloqueada por B2 owner-side) |

---

## 4. Lo que queda — work pendiente (con plan listo)

Items por urgencia. Cada uno tiene plan o spec; muchos son sub-día.

### 4.1 ✅ Test-gating en CI (`pnpm test`) — RESUELTO 2026-05-20 (commit `c13345d`)

Verificado 2026-05-21 late: `.github/workflows/ci.yml` líneas 122-179 ya contienen el job `test` con `pnpm test` (línea 175), Supabase local stack para auth-dependent tests, `pnpm db:bootstrap` y timeout 15min. Mergeado vía PR #79 el 2026-05-20.

**Lo único pendiente (UI-only del owner):** verificar que en GitHub → Settings → Branches → Branch protection rules de `main` y `develop` esté listado **"Tests (vitest)"** como required status check, junto con "Lint, typecheck, build" y "Schema vs migrations drift".

- **Effort owner:** 5 min en GitHub UI

### 4.2 ✅ Cross-org-transfer `receiverOrganizationId` canónico — RESUELTO 2026-05-21 late

Migration 0043 (`db/migrations/0043_cases_receiver_organization.sql`) agrega:
- Columna `cases.receiver_organization_id uuid references organizations(id) on delete set null`
- Backfill desde `custody_transfer_proposed` event payload `to_organization_id` (DISTINCT ON case_id ORDER BY recorded_at DESC, idempotente)
- Partial index `cases_receiver_org_open_idx` para queries "incoming proposals open for org X"

Schema mirror en `db/schema.ts:2486`. Helper `openCase(input)` extendido con `receiverOrganizationId?: string | null` opcional.

**Refactor en 6 read paths** para preferir la column canónica con fallback al payload (legacy rows pre-backfill):
- `proposeCrossOrgTransferAction` — escribe la column al `openCase`
- `acceptCrossOrgTransferAction` — lee de column con cross-check drift loud
- `rejectCrossOrgTransferAction` — agrega guard "solo el receiver puede rechazar" usando la column (cierra bug previo donde cualquier org con `org.transfer.accept` podía rechazar propuestas dirigidas a otra org)
- `cancelCrossOrgTransferAction` — usa column para notify
- `lib/case-closers/expire-cross-org-transfers.ts` — cron usa column
- `app/org/[orgToken]/transferencias/recibidas/page.tsx` — query usa column con OR fallback al payload

**Tests:** 7/7 verde en `__tests__/cross-org-transfer.test.ts` (incluyendo el nuevo aserto sobre `receiverOrganizationId === receiverId` en el "propose" path).

### 4.3 🟢 Aplicar `db/foster_rls.sql` en Supabase Studio — **Sec 2.3 (ops)**

Manual: Supabase Studio → SQL editor → pegar archivo → run. RLS no se auto-aplica con `db:push`.

- **Effort:** 15 min
- **Acceptance:** `pnpm rls:smoke -- foster_proposals foster_volunteers` verde.

### 4.4 ✅ RLS matrix testing — MVP RESUELTO 2026-05-21 late

`scripts/rls-smoke.ts` sigue como spot-check end-to-end. La doctrina D7 (matrix completa) entró por MVP:
- **Spec**: `__tests__/rls/matrix.spec.ts` — TS const tipado (decidido sobre YAML para no agregar `js-yaml` dep; conversión a `db/rls-matrix.yaml` es mecánica si se quiere después). Estructura: `RLS_MATRIX[table][role][op] = { outcome, reason }`.
- **Harness**: `__tests__/rls/matrix.test.ts` — vitest iterativo via `for…of` que genera 1 test por cell. Sign-in con seeded users (`owner@`, `vet@`, `admin@` de `pnpm seed:test`). Fixture case insertada via Drizzle en beforeAll para que las celdas de `cases` tengan target válido.
- **MVP scope**: 4 roles (anon, owner, other_user, admin) × 6 tablas (pets, pet_events, ownerships, notifications, profiles, cases) × select op = **24 celdas**, 26/26 tests verde.

**Acceptance criteria cumplidos:**
- ✅ Cambio permisivo en RLS (`USING (true)`) → el probe recibe `allow` donde el spec dice `deny` → test falla con detalle (`Matrix says X.Y.Z=deny but harness saw allow`).
- ✅ Cambio en spec que no matchea realidad → mismo failure mode (verificado in-place: el primer run con el spec aspiracional mostró 17/26 fails que el matrix corrigió iterativamente).

**Extension futura (no bloqueante)**:
- INSERT/UPDATE/DELETE ops — requieren payload helpers per-tabla (e.g. valid pets row sin tocar FKs / CHECK constraints). El gate `OPERATIONS_UNDER_TEST` (línea 36) declara qué ops corren.
- Roles `vet`, `govt`, `wrong_org_member` — agregar al spec + harness. Trivial dado el current shape.
- Tablas restantes: `welfare_reports`, `foster_volunteers`, `foster_proposals`, `audit_log`, `appointments`, `service_offerings`. Las primeras 4 requieren además fixture rows en beforeAll (igual que cases).

**Descubrimiento durante implementación**: `pnpm db:push` NO aplica los `db/*.sql` files (RLS, triggers). Solo aplica el schema declarado en `db/schema.ts`. Para tener RLS local hay que correr `pnpm db:bootstrap`. En CI el job `test` ya corre `db:bootstrap` antes de los tests; en local es manual. El matrix harness reporta este síntoma claramente cuando RLS no está aplicada (anon ve rows = test falla con detalle).

### 4.5 ✅ `generateUniqueToken` retry wrapper — RESUELTO 2026-05-21 late

Implementado `lib/unique-token.ts` con:
- `generateUniqueToken(table, column, generator, options?)` — pre-INSERT advisory check; retry hasta `maxRetries` (default 5) consecutive collisions. Acepta `executor` opcional para correr dentro de transacciones.
- `isUniqueViolation(err)` — narrowing helper para SQLSTATE 23505 (defense en INSERT path).

**Refactorizados 10 call-sites de producción** (el doc original decía "5" pero confundía funciones generadoras con call-sites):
- `app/actions/libreta-share.ts:56` — libretaShareTokens
- `app/actions/service-offerings.ts:119` — serviceOfferings
- `app/actions/booking.ts:68` — appointments
- `app/actions/pets.ts:346` — pets
- `app/actions/intake.ts:203` — pets
- `app/actions/upgrade.ts:226,323-324` — approvalRequests + organizations + approvalRequests
- `app/actions/admin-proposals.ts:128,223` — approvalRequests (x2)

**Tests:** 7 casos en `__tests__/unique-token.test.ts` (incluyendo los 3 prescritos: success first, success after retry, throw after maxRetries). Tests de regresión booking + libreta-share + admin-fase-0 (24 casos) siguen verde.

**Nota lateral encontrada:** en `upgrade.ts:323`, `organizations.publicToken` se genera con `generatePublicToken()` que devuelve prefijo `DIM-XXXX-XXXX` aunque sea una org (no una pet). Comportamiento preexistente, NO cambiado — anotado en un comment inline. Revisar en algún cleanup futuro si conviene un `generateOrgToken()` con prefijo `ORG`.

### 4.6 ✅ Bulk revoke UI en las 4 colas — YA RESUELTO (PR #3, commit `79a3649`)

Verificado 2026-05-22 late: las 4 colas usan `<BulkRevokeList>` (`components/BulkRevokeList.tsx`, 389 líneas) que llama `bulkRevokeAction`. Per-row checkbox, floating action bar, modal con motivo (≥30 chars) + uploader de evidencia, partial-success report. Mergeado en PR #3 antes del audit que escribió este doc.

### 4.7 🟢 Mirror restante de CHECK constraints — **Sec 3.1**

Tres de las cuatro constraints de `pets_adoption_eligibility` ya están mirrored en `db/schema.ts:555-589`. Confirmar que las restantes (`ineligible_other_needs_notes`, `energy_level_valid`, `size_estimate_valid`, `age_bucket_valid`) están bien y que `pnpm db:push --dry-run` reporta zero changes.

- **Effort:** 1-2h (probablemente ya está; verificar)

### 4.8 🟢 Localities catalog — terminar las 5 server actions restantes — **Sec 6.7**

`resolveCanonicalJurisdiction` está en 2 acciones govt. Falta agregar a: `app/actions/upgrade.ts`, `app/actions/admin-institutional.ts` (org creation), `app/actions/service-offerings.ts`, `app/actions/welfare.ts`, `app/actions/events.ts`.

- **Effort:** ½ día total

### 4.9 🟢 CABA barrios — ejecutar el script — **Sec 6.3**

`scripts/import-caba-barrios.ts` está escrito. Falta: dry-run → live run → assert count = 48 → smoke en `LocalityCombobox` (ranking boost para barrios cuando jurisdicción = CABA).

- **Effort:** ½ día (la ejecución sí, la verificación lleva el resto)

### 4.10 🟢 Vet portal routing default fix — **Sec 6.4**

Plan: `docs/superpowers/plans/2026-05-19-fix-vet-portal-routing.md`. Vet con `professional.provider` granted debería landearr en `/pro`... pero `/pro` está deprecado, así que el plan necesita reescribirse para landear en la clinic-org del vet (vía `/cuenta/memberships` o redirección directa a `/org/[orgToken]`).

- **Effort:** ½-1 día (después de reconsiderar el destination dado pro-deprecation)

### 4.11 ✅ Service-dog 404 fix — ARCHIVADO 2026-05-21 late

Plan movido a `docs/superpowers/plans/archive/2026-05-19-fix-service-dog-404.md`. Junto con 3 más en el mismo housekeeping run (ver §6.3 actualizado).

### 4.12 🟢 Coverage threshold validation — **Sec 1.2** — VERIFICAR enforcement

`vitest.config.ts:26-33` tiene los thresholds. Falta confirmar que CI corre `pnpm test --coverage` (depende de §4.1 landeando primero).

- **Effort:** validación con §4.1

### 4.13 🟢 Cron handler invariants — **Sec 5.2**

10 cron handlers en `vercel.json`. Doctrina D8 quiere 3 tests por handler: idempotency, runtime window, recovery. Priorizar los 5 más state-mutating: `close-rabies-observations`, `materialize-slots`, `auto-expire-approvals`, `escalate-stale-disputes`, `expire-foster-proposals`.

- **Effort:** ~1 semana (1 día por handler × 5)

### 4.14 ✅ Sistema de casos — schema gap cerrado 2026-05-21 late

Ver §6.1. Tabla ya estaba en `db/schema.ts:2442`; TODO L-followup en `app/gob/page.tsx:247` cableado a `listCasesForGovt()` / `listCasesForAdmin()`.

### 4.15 🟢 Denuncia wizard polish — 6 TODOs `M-followup`

Live MiMAR chip lookup (Step 4), evidence uploader (Step 5), save-as-image (Success), LocationFields onChange refactor, dwell-time measurement.

- **Effort:** 1-2 días

### 4.16 🟢 Vaccine-due action wiring — TODOs `C4` / `C4-followup`

Agendar / Posponer slots en `RemindersSection.tsx:98,118` + notification grouping en `app/(app)/notificaciones/page.tsx:12`.

- **Effort:** ½-1 día

### 4.17 🟢 Pet detail J-followups

`app/(app)/mis-mascotas/[publicToken]/page.tsx` líneas 39, 42, 97, 832 — travel docs + lost-mode branch follow-ups.

- **Effort:** TBD

### 4.18 🟢 L-followup govt KPIs

`lib/govt-home-kpis.ts` líneas 221, 290, 296, 378, 379 — population census, dedicated event types para adoption + lepto + hidatidosis.

- **Effort:** TBD (depende de qué census data esté disponible)

### 4.19 🟢 Activación de 3 case_kinds diferidos — agregado 2026-05-21

Cierra los 3 `case_kind` que quedaron deferred en el subset v1.

- **Spec:** `docs/superpowers/specs/2026-05-21-deferred-case-kinds-design.md`
- **Plan ejecutable:** se escribe just-in-time
- **Fases:**
  - **A** `foster_proposal` — más chico, gana confianza (~2-3 días). Migration 0045, extender `expire-foster-proposals` cron, UI updates.
  - **B** `custody_episode` — más grande, backfill no-trivial (~4-5 días). Migration 0044, helpers `lib/case-lifecycles/custody-episode.ts`, sección "historial de custodia" en pet profile.
  - **C** `outbreak_investigation` — nueva surface (~3-4 días). Migration 0046, 3 nuevos event_types, ruta `/gob/vigilancia/investigaciones/*`.
- **Hard dependency:** §6.1 (cases en `db/schema.ts`).
- **Total:** ~9-12 días CC.

### 4.20 ✅ Placeholder physical-tag en pet profile — RESUELTO 2026-05-22 late

Migration **0044** (no 0043 — ese fue para §4.2) + tabla `physical_tag_interest` (unique en `(pet_id, user_id)`, 2 partial indexes activos). Drizzle mirror en `db/schema.ts`. Server action `togglePhysicalTagInterestAction(petPublicToken)` con state machine insert → cancel (soft) → re-interest. Helper `getPhysicalTagInterest(petId, userId)` en `lib/physical-tag-interest.ts`. Componente client `<PhysicalTagInterestCard>` con optimistic UI. Wireado después del `<PetCredentialCard>` en `app/(app)/mis-mascotas/[publicToken]/page.tsx`, solo visible para `accessPath === "owner"` (no a foster / shelter custody). 5 tests verde (getPhysicalTagInterest empty / active / cancelled + uniqueness constraint + toggle state machine).

**Out of scope (sigue en spec completo §5.7.1):** chapas reales, serial `M-XXXX`, redirect `/t/[serial]`, multi-tag, fabricante, surface `/cuenta/chapas`.

### 4.21 🟢 Specs §5.6 — escritura de plans just-in-time

Los 12 specs en §5.6 están todos 🟢 Ready for CC. **Decisión 2026-05-21:** plan files se escriben just-in-time (no batch).

- **Tier 1 independientes:** pet-profile-v2, performed-by-autocomplete, pregnancy-tracking, eno-vet-direct-report v2, tattoo-identifier (plan ya escrito), govt-business-rules-poc, pet-spaces-catalog.
- **Tier 2 (depende de §6.1):** cross-org-transfer-ux, org-abuse-investigation, decomiso-welfare-authority, bite-from-unowned-animal.
- **Effort por plan:** 2-4h escritura, 4-15 días ejecución según spec. Ver §5.6 para tabla completa.

### 4.22 🟢 Chunk N — Iconic-dataset cleanup (al final de la cola) — agregado 2026-05-21

Ver §5.3. Va último por decisión 2026-05-21. **Post-run, correr `/design-critique`** para validar nada faltante antes de cerrar.

---

## 5. Diferido — items con razón explícita

### 5.1 ❎ Adoption handshake unified (28-question wizard)

- **Plan:** `docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md` — 8 fases, ~45 archivos, ~7 días CC. Reemplaza `finalizeAdoptionAction`.
- **Razón:** los 4 campos actuales (housing, other_pets, daily_routine, notes) cubren el caso. Re-evaluar cuando aparezca demanda concreta de refugios o regulación que lo exija.
- **Estado en repo:** `app/adoptar/[petToken]/postular/ApplicationForm.tsx` sigue siendo el form 4-campos (142 líneas).
- **Plan queda como backlog ejecutable en `docs/superpowers/plans/`** — no se borra.
- **Ratificado 2026-05-21:** sigue diferido. Reactivar cuando una implementación real (refugio asociado, regulación) lo exija.

### 5.2 ❎ PPP export Prov BA v2

- **Razón:** Heterogeneidad municipal hace que Prov BA sea su propio sub-proyecto. CABA shipped (Chunk F).
- **Estado:** `TODO(F2-prov-ba-v2)` en `lib/ppp-exports.ts`.
- **Ratificado 2026-05-21:** sigue diferido. Reactivar cuando una implementación real (acuerdo con Prov BA, demanda municipal) lo exija.

### 5.3 🟢 Chunk N — Iconic-dataset cleanup (re-priorizado 2026-05-21)

- **Razón original del diferido:** El audit dice 0 phases tocan UI; ship como `chore:` cuando se quiera demo viva. No bloquea nada.
- **Decisión 2026-05-21:** entra a cola **al final de todos los pendientes** (no antes, porque no bloquea nada). **Post-run, hacer `/design-critique`** del estado del dataset + las surfaces que lo consumen para validar que no falte nada antes de cerrar la lista de pendientes. Ver §7 (Semana final).

### 5.4 ⚪ Blockers externos

- **Mi Argentina OAuth** — placeholder en `/signup` y `/login`. `TODO(mi-argentina)` en `DniVerifyForm.tsx:50`, `dni-verification.ts`, `upgrade.ts`. No avanza hasta que Mi Argentina exponga endpoint.
- **DNI verification real (RENAPER directo vs intermediary)** — relacionado al anterior.
- **Authority dispatch** — `lib/authority.ts:24,40` con `TODO(authority-integration)`. Placeholder funcional para demo, real cuando exista contrato.
- **Ratificado 2026-05-21:** sigue diferido. Reactivar cuando aparezca contraparte real (Mi Argentina expone endpoint, RENAPER firma intermediary, autoridad recibe dispatch).

### 5.5 🟢 3 case_kinds restantes — activación spec'd 2026-05-21

`custody_episode`, `foster_proposal`, `outbreak_investigation` — decisión 2026-05-21: **activar los 3**.

- **Design completo:** `docs/superpowers/specs/2026-05-21-deferred-case-kinds-design.md` (spec nuevo).
- **Plan ejecutable:** pendiente — se escribe just-in-time cuando se ataque.
- **Fases sugeridas en el spec:** Fase A `foster_proposal` (~2-3 días, más chico, gana confianza) → Fase B `custody_episode` (~4-5 días, backfill no-trivial) → Fase C `outbreak_investigation` (~3-4 días, nueva surface).
- **Total estimate:** ~9-12 días CC.
- **Hard dependency:** §6.1 — la tabla `cases` tiene que estar en `db/schema.ts` antes de tocar cualquier de estas activaciones.
- **Cola:** ver §7 (Semana 4 — activación de case_kinds diferidos).

`microchip_remediation` ya está activo en código pero sólo se gatilla en `fraud_detected` / `duplicate_detected` — no entra acá.

### 5.6 🟢 Specs con design completo (decisión 2026-05-21: todos a la cola)

**Verificado 2026-05-21:** los 12 specs están 🟢 Ready for CC según `docs/superpowers/README.md`. **Ningún spec necesita design adicional.** El único que ya tiene plan ejecutable además del spec es `tattoo-identifier`. Los otros 11 sólo necesitan **plan file** (que se escribe just-in-time al momento de ejecutar — los plans escritos hoy se quedan stale si el spec sigue evolucionando).

**Cola por prioridad** (independientes primero, dependientes de cases-system después). El plan se escribe **inmediatamente antes** de cada ejecución (no antes), Claude Code lo consume y ship.

#### Tier 1 — Independientes (sin dependencia del sistema de casos)

| # | Spec | Effort exec | Notas |
|---|---|---|---|
| 1 | `2026-05-19-pet-profile-v2-design.md` (v1.0+v1.1) | ~1 semana | Más visible al usuario — rediseño UX + 5 achievements + PPP card + Service Dog card. NO schema migration; compute on-read |
| 2 | `2026-05-19-performed-by-autocomplete-design.md` | 5-6 días | Combobox dual (linked vs texto libre) en 6 event types. Cero backfill |
| 3 | `2026-05-19-pregnancy-tracking-design.md` | 5 días | `clinical_info_logged(sub_kind='pregnancy')` + `pets.pregnancy_status` flag. Activa Achievement A4 (depende de #1) |
| 4 | `2026-05-19-eno-vet-direct-report-and-owner-alerts-design.md` (v2 — v1 ya shipped) | 5 días | Owner alerts para zoonoses peligrosas. v1 (vet auto-notify a govt) ya shipped el 2026-05-21 |
| 5 | ~~`2026-05-21-tattoo-identifier-design.md`~~ ✅ **shipped 2026-05-22** | — | Migration 0045 + columnas pets.tattoo_* + 2 event types + form `/eventos/nuevo/tatuaje` + libreta header + retroactive lost block + credencial gated por lost + lookup cross-check. PR `feat/tattoo-identifier`. |
| 6 | `2026-05-19-govt-business-rules-poc-design.md` | 7-9 días | Framework configurable rules per jurisdicción. POC con 3 rule_types PPP |
| 7 | `2026-05-19-pet-spaces-catalog-design.md` | 2-3 semanas | **Design 100% cerrado** (Q1-Q8 confirmadas 2026-05-19). Catálogo polimórfico de espacios físicos + MapLibre + widget `/inicio` |

#### Tier 2 — Dependen de cases-system (cerrar §6.1 primero)

| # | Spec | Effort exec | Bloqueado por |
|---|---|---|---|
| 8 | `2026-05-19-cross-org-transfer-ux-design.md` | 5 días | §6.1 + activación de `custody_transfer_handshake` (ya activo en V1) |
| 9 | `2026-05-19-org-abuse-investigation-design.md` | 4-5 días | §6.1 — extiende `welfare_denuncia` |
| 10 | `2026-05-19-decomiso-welfare-authority-design.md` | 7-8 días | §6.1 + activación de `custody_episode` (§5.5) + reusa de cross-org transfer (#8) |
| 11 | `2026-05-19-bite-from-unowned-animal-design.md` | 8 días | §6.1 — tabla `temporary_pet_descriptions` + reconciliation hook |

**Total Tier 1:** ~7-9 semanas. **Total Tier 2:** ~5 semanas (post §6.1). **Cola completa de §5.6 en §7.**

### 5.7 🟢 Specs antes con decisiones abiertas — decisión 2026-05-21

**Verificado 2026-05-21:** estos specs ya no tienen decisiones abiertas; el README de superpowers estaba desactualizado.

#### 5.7.1 `physical-tag` — diferido, con placeholder activado

- **Spec completo (`2026-05-18-physical-tag-design.md` v1.0) sigue diferido** — implementación real (chapas reales, serial `/t/[serial]`, multi-tag, fabricante) requiere proveedor físico AR + cerrar las 6 §15 (material, auto-revoke on death, DIY QR, serial extension, rate limit, visualización del serial). Todas tienen propuesta de Nacho, falta confirmación final.
- **Placeholder activado:** `docs/superpowers/specs/2026-05-21-physical-tag-placeholder-design.md` — componente chico `<PhysicalTagInterestCard>` en pet profile que captura interés (botón "Me interesa" → row en `physical_tag_interest`). Captura señal de demanda sin construir la cadena completa. **~3-4 horas CC.** Ver §4.20.
- **Cuando se reactive el spec completo:** los owners en `physical_tag_interest` con `cancelled_at IS NULL` son la primera audiencia a notificar.

#### 5.7.2 `pet-spaces-catalog` — design completo, sigue cola

- **Las 8 preguntas Q1-Q8 ya están cerradas** en `2026-05-19-pet-spaces-catalog-design.md` §15 (confirmadas 2026-05-19). El README de superpowers desactualizado decía que estaban abiertas.
- **Estado:** 🟢 Ready for CC. Plan se escribe just-in-time. Cola Tier 1 de §5.6 (puesto #7).
- **Effort exec:** ~2-3 semanas (10 fases A-J).

### 5.8 ❎ Long-horizon (testing PLAN.md Fases 2-4)

Property-based testing, adversarial dataset, snapshot tests, visual regression, k6 load tests, chaos engineering, IDOR fuzz, PII leak detection, captcha, external pen test. Tracked en `docs/testing/PLAN.md`.

**Ratificado 2026-05-21:** sigue diferido **hasta que cerremos todos los pendientes de §4 + §5.5 + §5.6**. Reactivar cuando aparezca pre-release / scale-stage.

### 5.9 🔴 `/pro` portal deprecated 2026-05-20

`app/pro/` no existe. Middleware (`middleware.ts:12-15`) redirige `/pro` y `/pro/*` a `/cuenta/memberships`. Wizard `/cuenta/crear-consultorio` activo. Script `scripts/migrate-vets-to-clinics.ts` listo.

---

## 6. Inconsistencias detectadas (a corregir)

### 6.1 ✅ `cases` table en `db/schema.ts` — RESUELTO 2026-05-21 late

**Estado original (de esta misma sesión, antes de verificar):** se reportaba que la tabla `cases` no estaba declarada en `db/schema.ts`.

**Realidad verificada 2026-05-21 late:** la tabla está declarada en `db/schema.ts:2442-2549` con shape completo:
- Todas las columnas, incluyendo `supersededByCaseId`, `parentListingCaseId`, `applicantUserId`, `adoptionApplicationId`.
- Partial unique indexes: `cases_open_per_pet_kind_idx`, `cases_open_adoption_app_per_applicant_idx`, `cases_open_by_owner_pet_idx`, `cases_open_by_jurisdiction_kind_idx`.
- CHECK constraints: `cases_subject_pet_consistency`, `cases_subject_location_consistency`, `cases_merged_consistency`, `cases_closed_consistency`, `cases_opened_reason_min_length`.
- Types exportados: `Case`, `NewCase`.

También están declaradas en schema las FK columns relacionadas: `pet_events.caseId` (línea 847), `welfare_reports.caseId` (1126), `notifications.relatedCaseId` (1016).

**Verificación:** `pnpm db:push` reporta zero drift sobre `cases`. Único drift en toda la base: `pets.permanent_conditions` default (ver §6.8 — menor, no relacionado).

**Trabajo real cerrado en esta sesión:** el TODO `L-followup` en `app/gob/page.tsx:247` fue cableado a `listCasesForGovt(jurisdictions)` (govt) y `listCasesForAdmin()` (admin), mostrando los 5 casos open/escalated más recientes en el card "Casos regulatorios" del dashboard `/gob`.

**Downstream:** §4.2 (cross-org receiver column) y todo Tier 2 de §5.6 ya no están bloqueados por este item.

### 6.2 ✅ `consolidated-cc-plan.md` reporta `ci.yml:122-179` corriendo `pnpm test` — VERIFICADO 2026-05-21 late

El claim resulta ser **correcto**: `ci.yml` tiene 180 líneas (no 120) y SÍ contiene el job `test` (líneas 122-179, mergeado en `c13345d` el 2026-05-20). El status doc del 2026-05-21 estaba escrito antes de verificar el HEAD actual del archivo.

### 6.3 ✅ Plans no archivados después de shipping — PARCIALMENTE RESUELTO 2026-05-21 late

Archivados en esta sesión (housekeeping):

- ✅ `2026-05-19-fix-service-dog-404.md` → `archive/`
- ✅ `2026-05-20-deprecate-pro-portal.md` → `archive/`
- ✅ `2026-05-20-microchip-replaced-ui.md` → `archive/`
- ✅ `2026-05-21-welfare-mpf-ppp-exports.md` → `archive/`

Quedan pendientes (por motivos):

- `2026-05-19-fix-vet-portal-routing.md` — **NO archivar**: necesita re-scoping post-pro-deprecation (ver §4.10).
- `2026-05-19-caba-barrios-import-execution.md` — **NO archivar**: archive recién cuando se ejecute el script (ver §4.9).

### 6.4 🐛 Discrepancia en step count del denuncia wizard

Commit `1060c5c` describe "4-step wizard" pero `DenunciaWizard.tsx:4` dice "Renders 5 steps + a success screen" y hay 5 Step components. La verdad es **5 pasos**. (Cosmético, no funcional.)

### 6.5 🐛 Plans referenciando migration numbers obsoletos

La implementation-plan §6.1 referencia `db/migrations/0044*` como destino para cases — esto era estimate; cases ya vive en 0033/0034 y estamos en 0042. La numeración futura debería arrancar desde 0043 (que sería para §4.2 receiver column).

### 6.6 ✅ `.git/packed-refs` con línea truncada — RESUELTO 2026-05-21 late

Detectado durante el audit. Algunos comandos git fallan con `fatal: unterminated line in .git/packed-refs`. Tanto `packed-refs` como `packed-refs.bak` estaban truncados en el mismo lugar (línea con SHA `35f9bce3917ceacdd46418e0ebe6102` sin ref name).

**Fix aplicado 2026-05-21 late:** se reescribió `packed-refs` sólo con las líneas válidas + se borró `packed-refs.bak`. `git fetch origin --prune` regeneró las refs remotas (incluyendo `chore/docs-adoption-templates-caba` y varias otras).

### 6.7 ✅ `scripts/print-demo-tokens.ts` parser-broken — RESUELTO 2026-05-21 late

Causa: las líneas 346-376 eran una copia parcial del final del archivo (probablemente artefacto de un edit incompleto). Borradas. `pnpm lint` y `pnpm typecheck` pasan limpio sobre el repo entero ahora.

### 6.8 ℹ️ `pets.permanent_conditions` default — NO ES DRIFT REAL (false-positive conocido)

`pnpm db:push` reporta:
```sql
ALTER TABLE "pets" ALTER COLUMN "permanent_conditions" SET DEFAULT ARRAY[]::text[];
```

Investigado 2026-05-21 late: **es un bug conocido de drizzle-kit**, no drift real. Drizzle-orm 0.36 serializa el default del array de una forma y PG lo normaliza a otra forma al introspectar — el diff nunca converge independientemente de la sintaxis en `schema.ts` (sql template, `[]`, `ARRAY[]::text[]`). Ya está manejado en `ci.yml:102-120` como `KNOWN_FALSE_POSITIVE` — se filtra antes de aserción.

**Acción:** ninguna. No es un fix, es un workaround estable hasta que drizzle-kit arregle el bug upstream.

---

## 7. Orden de ataque sugerido (cola completa post-decisiones 2026-05-21)

> **Cambio respecto a la versión inicial:** se incorporaron los items del round del 2026-05-21 (§4.19 case_kinds, §4.20 physical-tag placeholder, §4.21 plans just-in-time de §5.6, §4.22 iconic-dataset al final).

| Sem | Foco | Items | Total |
|---|---|---|---|
| **1** | Quick wins (Sem 1 mayoritariamente cerrada 2026-05-21 late) | ~~§6.1~~ ✅ · ~~§4.1~~ ✅ · ~~§4.7~~ ✅ · ~~§4.11~~ ✅ · ~~§4.5~~ ✅ · ~~§6.6~~ ✅ · ~~§6.7~~ ✅ · ~~§6.8~~ ℹ️ (false-positive). **Pendiente:** §4.3 (manual owner, 15min en Supabase Studio remoto) + verificar branch protection §4.1 en GitHub UI. | ~⅓ día (vs 1-2 estimado) |
| **2** | ~~Cross-org canónico + RLS matrix~~ ✅ | ~~§4.2~~ ✅ (migration 0043 + 6 read paths + bug en reject path cerrado) · ~~§4.4 RLS matrix~~ ✅ (MVP 24 cells, 26 tests verde) | ~⅔ día (vs 2 estimado) |
| **3** | UI gaps owner-facing | §4.6 bulk revoke UI (½-1 día) + §4.15 denuncia M-followup (1-2 días) + §4.16 vaccine-due C4 wiring (½-1 día) + §4.20 **physical-tag placeholder** (½ día) | ~3-4 días |
| **4** | Activación case_kinds diferidos (§4.19) | Fase A foster_proposal (2-3 días) → Fase B custody_episode (4-5 días) → Fase C outbreak_investigation (3-4 días) | ~9-12 días |
| **5** | Feature tail | §4.8 localities catalog (½ día) + §4.9 CABA barrios exec (½ día) + §4.10 vet portal routing rescoped (½-1 día) + §4.17 J-followups + §4.18 L-followup KPIs | ~3-4 días |
| **6** | Test infra resto | §4.13 cron invariants top 5 handlers (1 sem) + state-machine extraction (Sec 5.4 impl-plan) | ~1.5 sem |
| **7** | Observabilidad | Sentry + structured logs (Sec 5.5 impl-plan) | ~3 días |
| **8-9** | §5.6 Tier 1 — visible primero | §4.21 escribir plan + ship: `pet-profile-v2` (1 sem) → `performed-by-autocomplete` (5-6 días) | ~2 sem |
| **10** | §5.6 Tier 1 — completar features de mascota | `pregnancy-tracking` (5 días) — activa Achievement A4 | ~1 sem |
| **11-12** | §5.6 Tier 1 — surveillance + identifiers | `eno-vet-direct-report v2` (5 días) + `tattoo-identifier` (plan ya escrito, TBD) | ~1.5 sem |
| **13-14** | §5.6 Tier 1 — config + spaces | `govt-business-rules-poc` (7-9 días) | ~1.5 sem |
| **15-17** | §5.6 Tier 1 — spaces catalog | `pet-spaces-catalog` (2-3 sem) | ~2-3 sem |
| **18** | §5.6 Tier 2 — cases-system dependents (1) | `cross-org-transfer-ux` (5 días) | ~1 sem |
| **19** | §5.6 Tier 2 — cases-system dependents (2) | `org-abuse-investigation` (4-5 días) | ~1 sem |
| **20-21** | §5.6 Tier 2 — cases-system dependents (3) | `decomiso-welfare-authority` (7-8 días) + `bite-from-unowned-animal` (8 días) | ~3 sem |
| **22** | **Cierre — §4.22 Chunk N** | Iconic-dataset cleanup (chore, no UI) → **post-run: `/design-critique` para validar nada faltante** | ~2-3 días |

**Total estimado** (sin contar §5.8 long-horizon testing): ~5-6 meses de Claude Code agentic.

**Bloqueado por externos** (sin ETA, fuera de la cola): Mi Argentina OAuth + DNI real + Authority dispatch (§5.4).

**Diferido por decisión de producto** (revisar cuando aparezca demanda): adoption handshake 28-q (§5.1), PPP Prov BA v2 (§5.2), physical-tag spec completo (§5.7.1 — el placeholder en §4.20 captura interés mientras tanto).

**Post-§4.22:** se activa §5.8 (long-horizon testing — property-based, k6, chaos, pen test). Recién ahí estamos cerca de "v1 pre-release".

---

## Apéndice A — Eventos crea-caso (referencia rápida)

**Abren un caso:**

| Event | case_kind |
|---|---|
| `incident_reported` con `bite_inflicted` | `bite_incident` |
| `status_changed` to `lost` | `lost_pet_episode` |
| INSERT `welfare_reports` row | `welfare_denuncia` |
| `adoption_eligibility_set` `eligible=true` | `adoption_listing` |
| `adoption_application_submitted` | `adoption_application` |
| `custody_dispute_raised` | `custody_dispute` |
| `foster_assigned` | `foster_placement` |
| `custody_transfer_proposed` | `custody_transfer_handshake` |

**Cierran un caso:**

| Event | Cierra |
|---|---|
| `rabies_observation_ended` | `bite_incident` |
| `status_changed` to `active` | `lost_pet_episode` |
| `welfare_reports.status='closed'` | `welfare_denuncia` |
| `adoption_eligibility_set` `eligible=false` + followup expiry | `adoption_listing` |
| `adoption_application_resolved` | `adoption_application` (+ cascade F5.5) |
| `custody_dispute_resolved` | `custody_dispute` |
| `foster_ended` | `foster_placement` |
| `custody_transferred` / cancel / reject / expire | `custody_transfer_handshake` |

**Cascade (composite):**

- `adoption_finalized` (Flow 7): cierra ganador, cascade F5.5 a rivales, abre `finalized_in_followup`, cierra `foster_placement` activo si aplica, opcionalmente cierra `lost_pet_episode`.
- `adoption_reversed` (Flow 9): único reopen — reabre `adoption_listing`.
- `custody_transferred` (Flow 3 phase 2): cierra `custody_transfer_handshake` Y puede cerrar `lost_pet_episode`.
- `death_recorded`: cascade-cierra `foster_placement` si está en tránsito.

---

## Apéndice B — Migration count

42 archivos en `db/migrations/`. Última: `0042_emergency_contact_columns.sql` (J-followup, 2026-05-21).
Próxima libre: `0043` (sugerida para §4.2 `cases_receiver_organization`).

---

## Apéndice C — Changelog del repo desde 2026-05-20

37 commits en 2026-05-21 + 1 en 2026-05-20. Highlights:

- **2026-05-20**: `1d3b703` microchip-replaced UI (owner/vet-in-org/admin).
- **2026-05-21 morning**: Chunk A.5 (poncho), Chunk C C1-C4 (vaccine-due), Chunk D (adoption D3+D4+D5), Chunk E1 (govt primitives), repo housekeeping.
- **2026-05-21 mid-day**: Chunk E2-E6 (vigilancia/perdidas/maltrato/analytics/export), Chunk H (EventCatcher polish + parking de v2 previews).
- **2026-05-21 afternoon/evening**: Chunks I/J/K/L/M (UI v2 activations — swap-in de owner home, pet detail, lost mode, /gob home, denuncia wizard), Chunk F (welfare exports), L-followup (real KPIs), J-followup (emergency contact + migration 0042), ENO v1 vet auto-notify, PetProfileHero fix.
- **Plans archived**: vaccine-due-ux, ui-v2-activation, govt-dashboards, y 6 plans del 2026-05-20.
- **Plans/specs nuevos del día**: consolidated-cc-plan, pending-decisions-resolved, eno-pipeline, tattoo-identifier (spec + plan), welfare-mpf-ppp-exports (plan).

---

*Documento merged a partir de los 4 status docs del 2026-05-20. Para regenerar: re-correr el audit contra HEAD y reconciliar contra este archivo.*
