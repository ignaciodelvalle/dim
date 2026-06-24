# Wave 3 — Org ops layer — technical dev handoff (Items 16–19)

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-18 · **Wave 3 del paquete metrics-IA**
> · Umbrella: `2026-06-18-metrics-ia-handoff-design.md` · De la review completa del rol Organizations 2026-06-18.
>
> **SECUENCIA:** corre **al FINAL del bloque autónomo, después de Wave 2.** CC ya ejecuta: **NO reordenar ni interrumpir lo en curso.**
> Orden interno: **16 → 17 → 18 → 19** (17 y 18 dependen de 16 para la ocupación).

**Contexto de la review.** El portal org tiene workflows transaccionales completos (intake, adopción, foster pool, transferencias cross-org, check-ins, cobertura, permisos, servicios+agenda) — las 40+ rutas renderizan con empty states; **no hay pantallas faltantes ni a medio hacer**. Lo que falta es la **capa agregada/operacional** del refugio. Correcciones de la review: (a) el `agenda` ya tiene ocupación **de turnos** (no de custodia); (b) el **bulk-vaccinate ya existe** en `OrgMascotasBulkList` — no specar de nuevo.

Tokens/comп reales: `Op*` (dashboard), `LnEmptyState`, `OpKpi`, `OpCard`, `OpStateBadge`.

---

## Item 16 — Censo & ocupación del refugio 🔴 (⚠️ único item con migración aditiva)

### Overview
Hoy el dato existe a nivel animal (custody rows) pero **nunca se agrega**: cuántos animales tengo, capacidad, ocupación %, ritmo ingreso/egreso. Es la métrica primaria del refugio. (Distinto del `agenda`, que es ocupación de *turnos*.)

### Decisión cerrada (capacidad) — ⚠️ toca schema
- **D1 — Capacidad declarada a nivel org, opcional, aditiva.** Columnas **nullable** en `organizations`: `capacity_dogs`, `capacity_cats`, `capacity_other`, `capacity_total` (todas `integer NULL`). Es el **único cambio de schema de todo el paquete** — migración **aditiva** (nullable, sin backfill, sin drop). Si el refugio no declara capacidad, se muestra **censo sin %** (capacidad opcional).
- **D2 — Ocupación = proyección pura** sobre el event log: count de custody rows activas (`shelter_custody`) por especie. Nada se denormaliza salvo la capacidad declarada (config mutable, no evento). Coherente con principio #7.
- *(Ajustable: si preferís capacidad por sede o un solo total, es un cambio de columnas menor — el default per-especie+total cubre el caso común sin bloquear.)*

### UI
| Superficie | Contenido |
|---|---|
| `configuracion` | sección "Capacidad" con inputs per-especie + total (opcional); copy "para calcular tu ocupación" |
| Panel (Item 17) | KPI **Ocupación** (N en custodia / capacidad → % con `OpKpi` tone por umbral) |
| Vista censo | desglose por especie + estado de custodia; link a la lista filtrada |

### States / edge
| Caso | Comportamiento |
|---|---|
| sin capacidad declarada | mostrar censo (conteos) sin %, con CTA "Declarar capacidad" |
| ocupación > capacidad | tone `danger` + "Sobre capacidad" (no bloquea intake — es informativo) |
| org no-refugio (clínica) | la sección capacidad no aplica → ocultar (gating por `org_type`/capability `intake.create`) |

### Tests
- Proyección de ocupación por especie sobre seed de custody rows; excluye no-custody. Capacidad nullable → censo sin %. Migración aditiva no rompe orgs existentes.

---

## Item 17 — Panel org como dashboard de operación 🟡 (depende de 16)

### Overview
El Panel hoy son 3 KPIs de pendientes (casos, transferencias, propuestas) — una to-do list. Rediseñarlo como **dashboard de refugio**, equivalente org de lo que Items 2–4 hicieron para gob/admin (read-only projections, org-scoped).

### Layout target (Op* grid)
```
Header: nombre org + estado verificación
KPI row: Ocupación (Item 16) · Ingresos (semana) · Disponibles para adopción · Adopciones en curso
OpCard "Requieren acción": cola priorizada — animales en custodia con vacuna/médico vencido o estadía larga
OpCard "Pendientes" (conservar): casos abiertos · transferencias · propuestas de tránsito (los 3 KPIs actuales, demovidos)
Capability action cards (conservar)
```

### Proyecciones nuevas (`lib/org-dashboard.ts` o sibling)
| Métrica | Fuente |
|---|---|
| Ingresos semana | `shelter_intake_recorded` en ventana |
| Disponibles | custody activas con `adoption_eligible=true` |
| Adopciones en curso | `adoption_application_*` abiertas |
| **Requieren acción** | custody activas con: vacuna/deworming vencido, medicación activa sin dosis, o estadía > N días (long-stay) |

### Edge / a11y
- Refugio recién creado / vacío: empty states alentadores, no KPIs en 0 sin contexto. Cola "requieren acción" vacía = mensaje positivo. Reusa a11y de Item 11.

---

## Item 18 — Vista de pipeline de animales 🟡 (depende de 16; reusa data existente)

### Overview
El refugio piensa en **flujo**: ingreso → evaluación → disponible → reservado → adoptado/tránsito/devuelto. Hoy hay lista + filtros + bulk (`OrgMascotasBulkList`), pero no un **tablero por estado**.

### Spec
- Toggle **Lista / Tablero** en `mascotas` (no pantalla nueva; misma data y filtros).
- Columnas = estados de custodia ya modelados (no inventar estados). Cards arrastrables opcional (v2); v1 = columnas read + click a la mascota.
- **Reusa** `OrgMascotasBulkList` (selección + bulk-vaccinate ya existentes) — el board es otra vista de la misma colección.

### Edge
- Muchos animales por columna: scroll + conteo por columna; respeta k-anon N/A (es data propia de la org, no agregada pública).

---

## Item 19 — Onboarding de organización (first-run guiado) 🟡

### Overview
Tras `crear-consultorio`/upgrade, la org cae en un portal vacío. El owner tuvo su aha (Item 13); la org no. Checklist de activación.

### Spec
- Componente `OrgSetupChecklist` en el Panel (se auto-oculta al completarse): pasos con estado done/pending + CTA:
  1. Definir zonas de cobertura (`cobertura`)
  2. Invitar miembros (`miembros/invitar`)
  3. Cargar servicios (`servicios/nuevo`) — si aplica
  4. Declarar capacidad (Item 16) — si refugio
  5. Enviar documentación de verificación
- Derivado (no persistido): cada paso se calcula del estado real (hay cobertura? hay miembros? verificación enviada?).

### States / edge
- Org verificada y configurada → checklist no se muestra. Pasos no aplicables al `org_type` se omiten (una clínica no declara capacidad de refugio).

### A11y
- Checklist como lista con progreso (`aria`), foco al primer paso pendiente.

---

## Cierre por item (todos)
SDD test-first, Biome/typecheck verdes, docs en el mismo PR, flippear fila en `docs/superpowers/README.md`. **Item 16 lleva la migración aditiva** (única del paquete) — documentarla en `db/` + `AGENTS.md` (organizations). Items 17/18/19 son read-only/UI.

## Lo que NO está en Wave 3
- Bulk-vaccinate (ya existe en `OrgMascotasBulkList`).
- Ocupación de turnos (ya existe en `agenda`).
- Reporting/export para la propia org (board/donantes) — fuera de scope; se prioriza con uso real.
- Bulk-intake masivo — solo si emerge demanda; el intake unitario + match ya cubre el caso base.
