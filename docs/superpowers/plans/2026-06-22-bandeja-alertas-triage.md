# Plan: Paquete K — Bandeja de alertas + triage operativo · ejecutable

> **Para Claude Code.** Plan ejecutable derivado de
> [`specs/2026-06-22-dashboards-sell-completeness-design.md`](../specs/2026-06-22-dashboards-sell-completeness-design.md)
> §3 (Paquete K). Cierra el loop "medir → accionar": el admin **revisa una alerta, la investiga y contacta al
> oficial de la localidad**. Hoy las **suscripciones existen** (`alert_subscriptions`) y se **evalúan** en
> `/admin/programa` (`evaluateAlertSubscriptions`), pero la alerta se queda en "prendida/apagada", sin ciclo de vida
> ni acción. **Este es el único paquete del set que toca schema** (una tabla aditiva). SDD test-first, docs en el PR.
>
> **Reusa lo ya construido:** `evaluateAlertSubscriptions` + las 6 `ALERT_METRIC_KEYS` (`db/schema.ts:2758`), el
> flujo de investigaciones **completo** (`openOutbreakInvestigationAction({diseaseCode, reason, linkedSignalEventId})`
> → `{publicCode}` → `/gob/vigilancia/investigaciones/[publicCode]`), `govt_assignments` (para resolver el/los govt
> de una localidad), la capa de notificación/outbox, y el patrón de audit `logOutreachPiiQuery`.
>
> **Coordinación con la sesión de CC en curso (importante — este es el paquete más invasivo):**
> - **Fase K0 toca `db/schema.ts` + una migración nueva** → hacerla en un **commit/migración aislado**, primero, y
>   re-generar tipos antes de seguir.
> - Fase K3 edita `components/layout/nav-presets.ts` (+ snapshot) y, opcionalmente, `app/admin/layout.tsx` (badge).
> - Todo lo demás son archivos nuevos. Secuenciar para minimizar conflicto de merge.

---

## Flujo (máquina de estados)

```
disparada → reconocida → en_investigacion → autoridad_contactada → resuelta
                     └──────────────→ descartada
```

- **disparada:** la evaluación cruzó el umbral de una suscripción.
- **reconocida:** un admin la tomó (acknowledge).
- **en_investigacion:** se abrió (o vinculó) un expediente de investigación.
- **autoridad_contactada:** se notificó al/los govt de la jurisdicción.
- **resuelta / descartada:** cierre con nota.

---

## Fase K0 — Schema (aditivo, aislado) 🟨 · **toca `db/schema.ts` + migración**

> Decisión §K-D1 del spec **resuelta:** tabla dedicada `alert_firings`, **fuera de `pet_events`** (no mezclar
> eventos de mascota con eventos de sistema).

**Cambios:**
- Nueva tabla `alert_firings` en `db/schema.ts` (additive, no altera tablas existentes):
  ```
  id                uuid pk
  subscription_id   uuid fk → alert_subscriptions(id) on delete set null  (nullable: la sub puede borrarse)
  metric_key        text  ($type AlertMetricKey)
  direction         text  ($type AlertDirection)
  threshold         numeric
  observed_value    numeric
  jurisdiction_province text null
  jurisdiction_locality text null
  status            text  ($type AlertFiringStatus)  default 'disparada'
  fired_at          timestamptz not null default now()
  acknowledged_at   timestamptz null
  acknowledged_by   uuid fk → profiles(id) null
  investigation_code text null      -- publicCode del expediente vinculado
  contacted_govt_user_id uuid fk → profiles(id) null
  contacted_at      timestamptz null
  resolved_at       timestamptz null
  resolved_by       uuid fk → profiles(id) null
  notes             text null
  ```
- `export const ALERT_FIRING_STATUSES = ["disparada","reconocida","en_investigacion","autoridad_contactada",
  "resuelta","descartada"] as const;` + tipo.
- Índices: `(status, fired_at)` para la bandeja; `(subscription_id, status)` para dedup de abiertas; parcial sobre
  jurisdicción si hace falta.
- Migración SQL nueva en `db/migrations/` (additive). `pnpm db:generate` + revisar.
- **Sin tocar el enum `AUDIT_LOG_ACTIONS`**: el rastro de transiciones vive en las columnas `*_at`/`*_by` de
  `alert_firings`. (Si se requiere audit-log formal, §K-D4.)

**Tests (K0):** smoke aditivo (la tabla existe, FKs ok); insert/select básico; default status.

---

## Fase K1 — Evaluación → persistencia + dedup (dominio puro + writer) 🟨

**Archivos nuevos:**
- `lib/metrics/alert-firing.ts` (dominio puro: dedup + transiciones)
- `app/actions/alert-firings.ts` (server actions, admin-only)
- tests para ambos

**Dominio puro (`alert-firing.ts`):**
- `shouldOpenFiring(existingOpen, evaluation)` → boolean: **una sola alerta abierta** por
  `(subscription, jurisdicción)` — no spamear; si ya hay una no-cerrada, no abrir otra.
- `nextStatus(current, transition)` — máquina de estados validada (rechaza saltos inválidos, ej. resuelta→reconocida).
- Puro, sin DB → unit-testeado.

**Persistencia:**
- Extender el punto donde corre `evaluateAlertSubscriptions` (hoy en `/admin/programa`) y/o un **cron** para, cuando
  una suscripción cruza umbral, **registrar un `alert_firings`** si `shouldOpenFiring` lo permite. Reusar las 6
  métricas existentes (active_zoonosis, eno_sla_ontime_pct, queue_oldest_days, sterilization_coverage_pct,
  microchip_penetration_pct, open_welfare_reports).
- Considerar un cron `api/cron/evaluate-alerts` (patrón de los crons existentes en `vercel.json`) para que la
  evaluación no dependa de que un admin abra Programa. Marcar como recomendado.

**Tests (K1):** dedup (no abre segunda alerta con una abierta); transición válida/ inválida; cada métrica dispara al
cruzar su umbral en su dirección.

---

## Fase K2 — Bandeja `/admin/alertas` 🟨

**Archivos nuevos:**
- `app/admin/alertas/page.tsx` (server, `requireAdminOrRedirect`)
- `app/admin/alertas/loading.tsx`
- `components/admin/AlertInboxTable.tsx`
- `app/admin/alertas/AlertRowActions.tsx` (client)
- tests

**Página:**
- Lista de `alert_firings` con: métrica (label es-AR), jurisdicción, valor observado vs umbral, **antigüedad** (aging),
  estado (badge icon+texto, no color solo), y un **badge de breach** para las disparadas viejas (patrón outbox).
- Filtros: estado, métrica, jurisdicción, rango de fechas.
- **No** reusar `CaseQueue` (no es `CaseListItem`-shaped — mismo motivo por el que `/admin/observaciones` quedó fuera
  de `CaseQueue`). Tabla dedicada con a11y (`scope="col"` + `<caption>`).
- Escribe `pii_queried` con `surface: "alert_inbox"` por vista de lista (patrón outreach) — sin tocar el enum.

**Acciones de fila (`AlertRowActions` → server actions de K1):**
- **Reconocer** (acknowledge): `disparada → reconocida` (set `acknowledged_at/by`).
- **Abrir investigación** (solo métricas con disease-mapping, ver §K-D2): pre-llama
  `openOutbreakInvestigationAction({ diseaseCode, reason: "Alerta {métrica} en {jurisdicción}", linkedSignalEventId:
  null })`, guarda `investigation_code` y pasa a `en_investigacion`. Para métricas **no** mapeables a enfermedad,
  ofrecer "Registrar seguimiento" (nota) en vez de investigación.
- **Contactar autoridad:** resolver el/los `profiles` govt de la jurisdicción vía `govt_assignments`, enviar
  notificación (outbox), set `contacted_govt_user_id`/`contacted_at` → `autoridad_contactada`.
- **Resolver / Descartar:** cierre con `notes` → `resuelta`/`descartada`.

**Tests (K2):** render con filas de cada estado; acknowledge transiciona; "abrir investigación" crea el expediente y
linkea `investigation_code`; "contactar" resuelve los govt correctos por jurisdicción; no-admin redirigido.

---

## Fase K3 — Nav + badge (ediciones existentes, acotadas) 🟢

> **Commits aislados. Coordinar con CC.**
- `components/layout/nav-presets.ts`: agregar `{ href: "/admin/alertas", label: "Alertas",
  matchPrefix: "/admin/alertas" }` a la sección **"Operaciones"** de `ADMIN_NAV_SECTIONS` + actualizar
  `nav-presets.test.ts` (invariante "ningún href perdido").
- **Opcional** — badge de alertas abiertas en el riel (patrón del breach de outbox en `app/admin/layout.tsx`):
  inyectar `badge = count(status NOT IN ('resuelta','descartada'))`. Marcar opcional para no forzar edición de
  `layout.tsx` si CC lo está tocando.

---

## Cross-cutting

- **Único schema del set:** `alert_firings` (aditivo) + un enum de status. Nada más altera el DB.
- **Sin nuevos `AUDIT_LOG_ACTIONS`** (transiciones en columnas; `pii_queried`+`surface` para vistas de lista).
- **Ancla legal/credibilidad:** el triage de zoonosis/rabia comparte anclas con vigilancia (Decreto 4669, Ord.
  41.831, Res. 1144). Mostrar el **SLA de atención de alertas** (aging) refuerza "grado sanitario".
- **Docs en el PR:** fila "Portal surfaces" del `README.md` (`/admin/alertas` — Admin — Live); nota en
  `hexagonal-lite.md` (dominio puro `alert-firing.ts` + writer).

## Decisiones abiertas

- **§K-D1 — RESUELTA:** tabla aditiva `alert_firings` (no `pet_events`).
- **§K-D2 — qué métricas habilitan "investigación".** Solo las disease-mapeables (`active_zoonosis`) abren un
  `openOutbreakInvestigationAction`; el resto (SLA de cola, cobertura, microchip, denuncias) usan "seguimiento/nota"
  o derivan a outreach. Definir el mapa métrica→acción.
- **§K-D3 — disparo: cron vs on-page.** Recomendado **cron** (`api/cron/evaluate-alerts`) para no depender de que un
  admin abra Programa. Confirmar cadencia en `vercel.json`.
- **§K-D4 — audit formal.** Si se exige audit-log de transiciones (no solo columnas), agregar **un** action
  `alert_triaged` — pero eso edita el enum `AUDIT_LOG_ACTIONS`; hacerlo en el **mismo commit aislado de K0** para no
  fragmentar el toque a `schema.ts`.
- **§K-D5 — canal de contacto.** Notificación in-app (outbox) en v1; mail/SMS diferido.

## Criterios de aceptación (resumen)

1. Cruzar umbral registra un `alert_firings` (con dedup de una abierta por suscripción/jurisdicción).
2. `/admin/alertas` lista, filtra y permite reconocer → investigar → contactar → resolver, con la máquina de estados
   validada.
3. "Abrir investigación" reusa `openOutbreakInvestigationAction` y vincula el `investigation_code`; "contactar"
   resuelve los govt correctos por `govt_assignments`.
4. Único schema = tabla aditiva `alert_firings` (+ enum status); sin nuevos `AUDIT_LOG_ACTIONS` (salvo §K-D4, en el
   mismo commit).
5. Nav additive; badge opcional; tests K0–K2 en verde; no-admin rechazado.
