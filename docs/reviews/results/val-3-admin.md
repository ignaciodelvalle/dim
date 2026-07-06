# Validación MiMAR — Pass 3: Sweep admin (operador de plataforma)

**Agente:** Cursor (validación manual + browser MCP)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Cuenta:** `admin@dim.test` / `Test1234!` — Admin institucional, alcance **universal**  
**Side-effects:** búsqueda omnibox (audit `pii_queried` en historial); **no** se ejecutaron crear/desactivar govt/admin ni reemplazo de chip real.

Screenshots: `docs/reviews/results/val-3-admin-screenshots/`

---

## Matriz pantalla × rubric

Leyenda: ✅ suficiente · ⚠️ reservas · ❌ insuficiente / roto

| Ruta | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|------|------------|---------|---------|-----------------|-----------------|-------|
| `/admin` Dashboard | `01-admin-dashboard.png` | KPI strip + 3 cards gestión | SLA ENO no en landing (solo 3 tiles) | ✅ | ✅ | Cola **0** coherente. Decisiones 7d **2** → auditoría sin filtro. |
| `/admin/panorama` | `12-admin-panorama.png` | Panel capas denso | — | ✅ | ✅ | Nacional · mapa + 6 KPIs. Antirrábica varía con período (90d vs 3a). |
| `/admin/programa` | `11-admin-programa.png` | Muchas secciones scroll | — | ✅ | ✅ | North-Star + PII oversight + outliers + alertas DEMO. SLA **12 breach** = outbox. |
| `/admin/censo` | — | — | screenshot | ✅ | ✅ | 66.539 padron; embudo chip 59,6%; ranking provincias. |
| `/admin/adopciones` | — | — | no recorrido en profundidad | — | — | Nav presente; wrapper `/admin/*` (misma superficie gob). |
| `/admin/poblacion` | — | — | no recorrido en profundidad | — | — | Idem. |
| `/admin/inteligencia` | — | — | screenshot | ✅ | ✅ | Índice territorial + calidad datos; copy Ley 25.326 explícita. |
| `/admin/cola` | `13-admin-cola.png` | — | — | ✅ | ✅ | **0 pendientes** = tile dashboard ✅. Filtros por tipo de solicitud. |
| `/admin/alertas` | — | Badge nav **1** | lista no visible en snapshot | ⚠️ | ⚠️ | Filtros es-AR; métricas con slugs `active_zoonosis` en HTML. |
| `/admin/casos` | — | 50 abiertos PANO-heavy | screenshot | ✅ | ✅ | **50 casos** abiertos; mayoría `PANO-CASE-HIST-*`. Filtros estado/tipo/provincia. |
| `/admin/moderacion` | `02-admin-moderacion.png` | — | — | ✅ | ✅ | Cola vacía honesta; filtros tipo/severidad es-AR. Solo admin. |
| `/admin/observaciones` | `03-admin-observaciones.png` | Lista larga sin paginación | KPI resumen arriba | ✅ | ⚠️ | ~24 filas antirrábica; estados En curso / Cerrada negativa. |
| `/admin/observaciones/DIM-S006-RECO` | — | — | screenshot | ✅ | ✅ | Cierre profesional Pelusa; outcomes es-AR (una opción **POSITIVO** en mayúsculas). |
| `/admin/observaciones/…/microchip/reemplazar` | `04-admin-microchip-reemplazar.png` | — | link desde lista observaciones | ✅ | ✅ | Form completo es-AR; fraude/duplicado; audit prometido. **No enviado.** |
| `/admin/sistema` | — | Duplica KPI strip con `/admin` | — | ⚠️ | ✅ | Crons sin runs; deriva caché sin corrida. |
| `/admin/outbox` | `07-admin-outbox.png` | — | — | ✅ | ✅ | Badge **12** = banner SLA + filas rojas ✅. 24 filas últimas. |
| `/admin/auditoria` | `06-admin-auditoria.png` | Sin filtro 7d | filtro por acción pre-seteado | ⚠️ | ✅ | 6 entradas; mezcla decisiones + slugs crudos. |
| `/admin/usuarios` | — | — | screenshot | — | — | Nav OK; no capturado (omnibox PII probado). |
| `/admin/govts` | `08-admin-govts.png` | — | — | ✅ | ✅ | 3 operadores activos; filtros Todos/Activos/Desactivados. **No desactivar.** |
| `/admin/govts/new` | — | — | no abierto | — | — | CTA visible; flujo create no ejecutado. |
| `/admin/admins` | `09-admin-admins.png` | Cuentas system backfill | — | ✅ | ✅ | DIM Admin + 3 `system:backfill-*`. **No desactivar.** |
| `/admin/admins/new` | — | — | no abierto | — | — | CTA + Crear visible. |
| `/admin/organizaciones` | `10-admin-organizaciones.png` | — | — | ✅ | ✅ | 12 orgs; verificadas + pendientes; bulk select. |
| `/admin/reglas` | `05-admin-reglas.png` | Lista 24 provincias larga | — | ✅ | ✅ | Cascada AR país → provincias → localidad. Sin overrides. |
| `/admin/historial` | — | — | screenshot | ✅ | ✅ | 5 acciones propias; 2 solicitudes aprobadas alinean con Decisiones 7d. |
| `/admin/libro` | — | — | no recorrido | — | — | Nav presente (event-sourcing read-only). |
| `/admin/servicios` | — | — | no recorrido | — | — | Nav presente. |

---

## Chequeo crítico — KPI drill-down

| KPI / badge | Valor en origen | Destino del click | ¿Filtrado / reconciliable? | Veredicto |
|-------------|-----------------|-------------------|----------------------------|-----------|
| **Decisiones 7d** (Dashboard) | **2** (2 aprobadas · 0 rechazadas) | `/admin/auditoria` | ❌ Muestra **6** entradas de **todas** las acciones; incluye `welfare_location_viewed`, cuentas govt, miembro org. Solo **2** son `Solicitud aprobada`. Sin filtro 7d ni tipo decisión. | ❌ **Irreconciliable** |
| **Cola pendiente** | **0** | `/admin/cola` | ✅ Lista vacía coherente | ✅ |
| **Outbox** badge nav | **12** | `/admin/outbox` | ✅ Banner "12 items en incumplimiento de SLA"; filas `INCUMPLIMIENTO` | ✅ |
| **SLA ENO** (Programa tile) | 100% resueltos · **12** breach activo | `/admin/outbox` (vía tile) | ✅ Mismo 12 que badge | ✅ |
| **Alertas** badge nav | **1** | `/admin/alertas` | ⚠️ Bandeja cargada; 1 alerta DEMO esterilización CABA en Programa — no re-validado conteo en lista | ⚠️ |
| **Usuarios personales** | **13** | `/admin/usuarios` | — (no drill validado) | — |

**Referencia código:** `AdminKpiStrip.tsx` línea 92 — `href="/admin/auditoria"` para Decisiones 7d, sin query de filtro.

---

## Hallazgos

### Mayor

#### [MAYOR] Dashboard · Tile **Decisiones 7d** enlaza auditoría global sin filtrar (2 ≠ 6)

**Repro:** 1) `/admin` → tile **Decisiones 7d** = **2**. 2) Click tile → `/admin/auditoria`. 3) Contar filas y tipos.

**Esperado:** Lista con **2** filas `request_approved`/`request_rejected` de los últimos 7 días, o historial filtrado equivalente.

**Actual:** Subtítulo auditoría: *"Últimas 6 entradas del registro de auditoría (todas las acciones de autoridad)"*. Incluye slugs, altas de govt, miembro org. **2** solicitudes aprobadas dentro de **6** totales.

**Screenshot:** `01-admin-dashboard.png`, `06-admin-auditoria.png`

**Área probable:** `components/admin/AdminKpiStrip.tsx` (`href` fijo); falta ruta `/admin/auditoria?actions=…&since=7d` o usar `/admin/historial` con scope de decisiones.

**Clasificación:** PRODUCT-BUG (drill KPI — pre-flagged en uxgate-synthesis)

---

#### [MAYOR] Auditoría + Programa PII · Slug inglés **`welfare_location_viewed`** visible al operador

**Repro:** 1) `/admin/auditoria` → primera fila. 2) `/admin/programa` → sección PII → columna Acción fila govt remoto.

**Esperado:** Etiqueta es-AR ("Consulta de ubicación de denuncia") en toda superficie operador.

**Actual:** Texto literal **`welfare_location_viewed`** en auditoría; misma cadena en tabla PII oversight (Programa). Omnibox/historial sí muestran "Búsqueda de información personal" para `pii_queried`.

**Screenshot:** `06-admin-auditoria.png`, `11-admin-programa.png`

**Área probable:** mapa `audit_log.action` → label en proyector auditoría y `fetchPiiOversight` display layer.

**Clasificación:** PRODUCT-BUG (copy / i18n)

---

### Menor

#### [MENOR] es-AR · Inglés residual en chrome admin

**Repro:** Barrido rail + topbar + copy reglas/programa.

**Actual:**
- Nav: **Dashboard**, **Panorama**, **Outbox**, **Govts** (página titulada "Gobiernos").
- Badges: **SUPERADMIN**, **UNIVERSAL**.
- Dashboard card Analítica nacional: *"Ranking **cross-region**"*.
- Reglas: *"**scope-aware**"*, *"**overrides**"*, *"**defaults**"* en subtítulo y filas provincia.
- Programa subtítulo: *"KPIs **North-Star**"*.
- Panorama map controls: **Zoom in** / **Zoom out**; capa **Exportar PNG** OK.
- Observaciones cierre: option label **POSITIVO** (resto es-AR).
- PII oversight columna Superficie: **`alert_inbox`** (slug).

**Screenshot:** `01-admin-dashboard.png`, `05-admin-reglas.png`, `11-admin-programa.png`, `12-admin-panorama.png`

**Clasificación:** PRODUCT-BUG (i18n residual)

---

#### [MENOR] Organizaciones verificadas · Copy contradictorio con CTA

**Repro:** `/admin/organizaciones` → fila org verificada.

**Actual:** Texto *"Ya verificada — sin acciones disponibles desde acá"* y botón rojo **Revocar verificación** en la misma fila.

**Screenshot:** `10-admin-organizaciones.png`

**Clasificación:** UX copy

---

#### [MENOR] Observaciones antirrábicas · Períodos vencidos sin distinción fuerte

**Repro:** `/admin/observaciones` → filas con *Inicio: hace 1 mes* y estado **En curso**.

**Actual:** Legal 10 días; seed mantiene observaciones abiertas antiguas. Operador ve mezcla activas/completadas sin KPI "vencidas" arriba.

**Screenshot:** `03-admin-observaciones.png`

**Clasificación:** Seed / UX (no crash)

---

#### [MENOR] Casos admin · Predominio códigos seed `PANO-CASE-HIST-*`

**Repro:** `/admin/casos` abiertos.

**Actual:** 50 casos; mayoría prefijo PANO histórico. Funcional pero poco representativo de `CAS-*` en demo.

**Clasificación:** Seed / demo fidelity

---

#### [MENOR] Microchip reemplazar · Ruta anidada bajo `/admin/observaciones/…`

**Repro:** Buscar entrada "Reemplazar chip" desde lista observaciones.

**Actual:** Form accesible solo vía URL `/admin/observaciones/{token}/microchip/reemplazar` (no link obvio en lista antirrábica).

**Screenshot:** `04-admin-microchip-reemplazar.png`

**Clasificación:** UX discoverability

---

## Flujos OK (sin hallazgo)

- **Moderación denuncias anónimas:** cola vacía con copy claro; filtros severidad/tipo en español; no confundir con `/gob/maltrato`.
- **Observaciones 10d:** listado + detalle cierre profesional Pelusa; form microchip completo (lectura).
- **Reglas / jurisdicciones:** cascada nacional AR + 24 provincias + buscar localidad; "Sin overrides (usando defaults)" consistente.
- **Organizaciones:** búsqueda universal; estados Verificada/Pendiente; propuesta verificación en pendientes.
- **Govts / Admins:** listados legibles; filtros estado; CTAs crear visibles — **destructivos no ejecutados**.
- **Outbox ENO:** badge 12 = incumplimientos SLA visibles; filtros estado/destino/provincia; destino "Autoridad ENO" es-AR.
- **Programa PII oversight:** tabla con actores, superficie, conteos; incluye búsquedas omnibox de la sesión.
- **Cola = Dashboard:** 0 = 0 en ambos lados.
- **Panorama nacional:** autocontenido; disclaimer métricas + k-anon; capas es-AR.
- **Inteligencia / Censo:** métricas territoriales sin puntuar personas; embudo identificación claro.
- **Historial propio:** 5 acciones; 2 aprobaciones coinciden con numerador Decisiones 7d (aunque el drill no lleva acá).
- **No crashes** en ninguna ruta visitada.

---

## VEREDICTO

**NO PASA** (0 blocker · 2 mayores)

El portal admin es operable, el alcance universal se entiende de un vistazo, y los badges Outbox/Cola reconcilian con detalle. Los dos mayores son de **confianza operativa**: el drill **Decisiones 7d** no cuadra con auditoría, y el slug **`welfare_location_viewed`** filtra a copy crudo en auditoría y PII oversight.

### Top 3 hallazgos

1. **M1 — Decisiones 7d (2) → auditoría sin filtro (6 filas heterogéneas)** — KPI no reconciliable.
2. **M2 — `welfare_location_viewed` en auditoría y Programa PII** — enum/slug inglés en UI operador.
3. **m1 — Inglés residual** (Outbox, Govts, SUPERADMIN, scope-aware, North-Star, cross-region).

---

## Side-effects dejados en seed

| Entidad | Cambio |
|---------|--------|
| Audit log admin | `pii_queried` por búsqueda omnibox (Organizaciones, alert_inbox) |
| Historial admin | Entrada "Búsqueda de información personal" visible en `/admin/historial` |

---

## Screenshots index

| Archivo | Contenido |
|---------|-----------|
| `01-admin-dashboard.png` | Panel admin — KPI strip + gestión |
| `02-admin-moderacion.png` | Moderación — cola vacía + filtros |
| `03-admin-observaciones.png` | Observaciones antirrábicas — lista |
| `04-admin-microchip-reemplazar.png` | Reemplazar microchip — Pelusa |
| `05-admin-reglas.png` | Jurisdicciones / reglas — cascada AR |
| `06-admin-auditoria.png` | Auditoría global — 6 entradas |
| `07-admin-outbox.png` | Outbox — 12 SLA breach |
| `08-admin-govts.png` | Gobiernos — 3 operadores |
| `09-admin-admins.png` | Administradores + system accounts |
| `10-admin-organizaciones.png` | Organizaciones — 12 resultados |
| `11-admin-programa.png` | Programa — KPIs + PII oversight |
| `12-admin-panorama.png` | Panorama nacional — mapa + KPIs |
| `13-admin-cola.png` | Cola solicitudes — vacía |
