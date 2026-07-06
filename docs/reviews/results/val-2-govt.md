# Validación MiMAR — Pass 2: Sweep gobierno

**Agente:** Cursor (validación manual + browser MCP)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Cuenta:** `govt@dim.test` / `Test1234!` — Operador/a Gobierno (remoto), scope **3 localidades** (CABA, Santa Cruz/El Calafate, Tierra del Fuego/Ushuaia)  
**Side-effects:** apertura detalle maltrato (vista coord exacta → audit `welfare_location_viewed` en actividad reciente del panel); caso Pipa `CAS-K2DV-88J2` ya existía por Pass 1.

Screenshots: `docs/reviews/results/val-2-govt-screenshots/`

---

## Matriz pantalla × rubric

Leyenda: ✅ suficiente · ⚠️ reservas · ❌ insuficiente / roto

| Ruta | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|------|------------|---------|---------|-----------------|-----------------|-------|
| `/gob` Panel | `01-gob-panel.png` | Fila KPI densa (6+ tiles) | Deep-link en tiles superiores | ⚠️ | ✅ | 3 alarmas top: antirrábica, mordeduras/10k, zoonosis. Widget pérdidas **0** vs detalle **6**. |
| `/gob/panorama` | `07-gob-panorama.png` | Panel lateral capas largo | — | ✅ | ✅ | Mapa + leyenda + reproducción temporal; footnotes metodología. Antirrábica **11%** mismo label que panel **42%**. |
| `/gob/analytics` | `02-gob-analytics.png` | Mapa choropleth vacío ocupa mucho | — | ✅ | ✅ | Tile histórico **55%** label distinto ✅. Columna brotes **SIGNALS** en inglés. |
| `/gob/perdidas` | `03-gob-perdidas.png` | — | **CAS- por fila** | ⚠️ | ✅ | KPIs claros (6 activas, 19% reunificación). Lista sin código caso. |
| `/gob/casos` | `04-gob-casos.png` | Códigos seed `PANO-CASE-HIST-*` mezclados con `CAS-` | — | ✅ | ✅ | 35 casos; filtros Todos/Abiertos/Cerrados. |
| `/gob/casos/CAS-K2DV-88J2` | `05-gob-caso-detail.png` | — | — | ✅ | ✅ | Shell operador: partes, jurisdicción, timeline Pipa perdida→encontrada. |
| `/gob/maltrato` | `09-gob-maltrato-list.png` | 113 filas sin paginación visible | — | ✅ | ✅ | Severidad es-AR (Crítica/Alta/Media/Baja). KPI sin asignar **90** = panel denuncias. |
| `/gob/maltrato/{uuid}` | `06-gob-maltrato-detail.png` | — | — | ✅ | ✅ | Acciones triage + **Generar PDF MPF** + derivación org/decomiso. |
| `/gob/mortalidad` | `12-gob-mortalidad.png` | — | — | ✅ | ✅ | Banner trazabilidad 26%; 34 muertes alinea panel. Ley 5470 citada. |
| `/gob/vigilancia` | `13-gob-vigilancia.png` | — | — | ✅ | ⚠️ | Sección **Signals recientes** en inglés. Brotes 0 coherente con panel. |
| `/gob/reglas` | `11-gob-reglas.png` | Lista razas PPP muy larga | — | ✅ | ✅ | Solo lectura × 3 jurisdicciones; badge "Default nacional" en inglés. |
| `/gob/cola` | `10-gob-cola.png` | — | — | ✅ | ✅ | **0 pendientes** = widget panel "No hay solicitudes" ✅ (regresión uxgate corregida). |
| `/gob/moderacion` | `08-gob-moderacion.png` | — | — | ✅ | ✅ | Placeholder **Próximamente** honesto: hoy modera plataforma. |

Rutas nav secundarias no pedidas en el brief pero visibles en rail: Programa, Campañas, Outreach, Población, Censo, Adopciones, Decomisos, Disputas, Organizaciones, Usuarios, Sistema, Outbox, Servicios, Mi actividad — **no recorridas** en este pass (focus en checklist PO).

---

## Chequeo crítico — cobertura antirrábica

| Superficie | Label exacto | Valor | ¿Meta 80%? | Veredicto |
|------------|--------------|-------|------------|-----------|
| Panel `/gob` | COBERTURA ANTIRRÁBICA (PERROS, 12M) | **42%** | Sí · 3 partidos | Baseline compliance |
| Panorama `/gob/panorama` | COBERTURA ANTIRRÁBICA (PERROS, 12M) | **11%** | Sí · 3 partidos | ❌ **Mismo label, distinto número** |
| Analítica `/gob/analytics` | COBERTURA ANTIRRÁBICA — TODAS LAS MASCOTAS (HISTÓRICO) | **55%** | No · "histórico · toda especie con ≥1 dosis" | ✅ Label distinto — no comparar vs meta 80% |
| Analítica ranking CABA | Cobertura antirrábica (mascotas) | **56%** | No explícita | Scope intermedio — OK si se entiende como provincial |

**Conclusión antirrábica:** el tile histórico de analítica está bien diferenciado. **Panel vs Panorama comparten label y difieren 31 pp** — violación directa del criterio PO. El footer del Panorama afirma consistencia con dashboards de detalle, pero contradice el Panel.

---

## Hallazgos

### Blocker

#### [BLOCKER] Panel vs Panorama · Mismo label "COBERTURA ANTIRRÁBICA (PERROS, 12M)" con valores distintos (42% vs 11%)

**Repro:** 1) Login `govt@dim.test` → `/gob` (filtros Todas/Todas). 2) Anotar tile antirrábica. 3) Ir `/gob/panorama` (mismo scope, período default). 4) Comparar tile inferior homónimo.

**Esperado:** Misma fórmula y denominador cuando el label es idéntico, o labels que expliciten la diferencia (período, filtro temporal, peso poblacional).

**Actual:** Panel **42%** · Panorama **11%** · ambos dicen "meta 80% · 3 partidos". Panorama además declara en footer: *"Consistente con las superficies de detalle"* — falso frente al Panel.

**Screenshot:** `01-gob-panel.png`, `07-gob-panorama.png`

**Área probable:** `app/gob/panorama/` vs `lib/analytics/govt-dashboards.ts` / proyección compliance — distinto `ProjectionContext` o filtro de período no reflejado en el label.

**Clasificación:** PRODUCT-BUG (integridad de KPI)

---

### Mayor

#### [MAYOR] `/gob/perdidas` · Filas de mascotas perdidas sin código CAS- linkeable

**Repro:** 1) `/gob/perdidas` tab Perdidas (4 filas: Kira, Zeus, Milo, Luca). 2) Buscar prefijo `CAS-` en filas.

**Esperado:** Cada episodio activo muestra `CAS-XXXX-XXXX` → `/gob/casos/{code}` (`LostPetRow.tsx` l.56–62).

**Actual:** Solo nombre + especie + estado + "Ver credencial". Sin CAS-. En `/gob/casos` sí existen casos `lost_pet_episode` (ej. Pipa `CAS-K2DV-88J2`), pero los 4 seed PANO no enlazan.

**Screenshot:** `03-gob-perdidas.png`

**Área probable:** `fetchLostEpisodeCaseCodesForPets` retorna vacío para pets seed sin fila `cases`, o episodios no materializados al marcar perdida vía seed.

**Clasificación:** PRODUCT-BUG (gap funcional / seed)

---

#### [MAYOR] Panel `/gob` · Widget "Pérdidas" muestra **0** mientras `/gob/perdidas` y Panorama muestran **6 activas**

**Repro:** 1) Panel → card Pérdidas al pie. 2) `/gob/perdidas` KPI Activas. 3) Panorama tile Pérdidas activas.

**Esperado:** Mismo conteo de episodios activos en scope.

**Actual:** Panel **0** · Pérdidas **6** · Panorama **6** (9 recuperadas 30d).

**Screenshot:** `01-gob-panel.png`, `03-gob-perdidas.png`, `07-gob-panorama.png`

**Área probable:** widget panel `fetchPerdidasMetrics` vs query del dashboard dedicado.

**Clasificación:** PRODUCT-BUG

---

#### [MAYOR] Panel · Actividad reciente muestra action slug inglés `welfare_location_viewed`

**Repro:** 1) Abrir detalle maltrato (coord exacta). 2) Volver `/gob` → card Actividad reciente.

**Esperado:** Etiqueta operativa es-AR ("Consultó ubicación de denuncia") o ocultar slugs de audit.

**Actual:** Línea literal **`welfare_location_viewed`** + timestamp.

**Screenshot:** `01-gob-panel.png` (post-visita maltrato)

**Área probable:** proyector actividad reciente del panel govt — sin mapa de `audit_log.action` → label.

**Clasificación:** PRODUCT-BUG (copy)

---

### Menor

#### [MENOR] es-AR · Restos de inglés en chrome y vigilancia

**Repro:** Barrido visual rail + `/gob/vigilancia` + `/gob/analytics` tabla brotes.

**Actual:**
- Nav: **Outreach**, **Outbox** (inglés en rail es-AR).
- Badge topbar **GOB** (abreviatura técnica; no "GOVT" — aceptable pero jargon).
- Vigilancia: heading **"Signals recientes"**, empty **"Sin signals activos"**.
- Analítica brotes históricos: columna **SIGNALS**.
- Reglas: badge **"Default nacional"** repetido.
- Panorama KPI zoonosis: **"0 lepto · 0 hidat."** (jerga clínica abreviada, no enum crudo `lepto` en tablas).
- Razas PPP en reglas: nombres internacionales en inglés (estándar cinológico — aceptable).

**Screenshot:** `13-gob-vigilancia.png`, `02-gob-analytics.png`, `11-gob-reglas.png`

**Clasificación:** PRODUCT-BUG (i18n residual)

---

#### [MENOR] `/gob/moderacion` · Nav item activo sin badge "Próximamente"

**Repro:** Click Moderación en rail.

**Actual:** Placeholder en contenido es honesto (*"hoy las modera el equipo de plataforma"*). El ítem de nav no indica fase 0 — funcionario puede esperar cola.

**Screenshot:** `08-gob-moderacion.png`

**Clasificación:** UX polish

---

#### [MENOR] Panel · CTAs rápidos "Habilitación" / "Acta de infracción" sin destino obvio en pass

**Repro:** Botones bajo título Panel.

**Actual:** Visibles; no se validó destino (fuera de checklist). No bloquean.

**Clasificación:** Cobertura parcial

---

## Flujos OK (sin hallazgo)

- **Cola aprobaciones:** panel widget vacío = `/gob/cola` vacía (0). Conteo consistente.
- **Denuncias maltrato:** severidad en español; KPI 90 sin asignar = panel 90 denuncias activas; detalle con MPF export.
- **Casos regulatorios:** tabla con `CAS-` y `PANO-*`; detalle caso abre en shell operador con timeline.
- **Mortalidad:** 34 fallecimientos alinea panel; banner trazabilidad actionable.
- **Reglas:** lectura por jurisdicción asignada; copy aclara que edita admin nacional.
- **Panorama:** capas, leyenda meta 80%, reproducción temporal, disclaimer dataset demo — valor situacional claro para funcionario.
- **Analytics tile histórico 55%:** label explícitamente distinto del compliance 12M — no forzar meta 80%.
- **No** se encontraron enums crudos `dog`, `GOVT`, `ADMIN`, `Dormant` en superficies recorridas.

---

## VEREDICTO

**NO PASA** (1 blocker)

El portal gobierno es navegable y la mayoría de superficies son autocontenidas y legibles. La integridad de KPIs antirrábicos entre Panel y Panorama rompe confianza operativa. Pérdidas pierde el puente CAS-→caso que el PO pidió validar.

### Top 3 hallazgos

1. **B1 — Antirrábica (perros, 12M): 42% en Panel vs 11% en Panorama** — mismo label, distinto número.
2. **M1 — `/gob/perdidas` sin CAS- en filas** — componente listo pero lookup vacío en seed/runtime.
3. **M2 — Widget pérdidas del Panel en 0** vs 6 activas en detalle/Panorama.

---

## Side-effects dejados en seed

| Entidad | Cambio |
|---------|--------|
| Audit log govt | Entrada `welfare_location_viewed` por vista detalle maltrato |
| Caso Pipa | `CAS-K2DV-88J2` cerrado (Pass 1) — visible en cola casos |

---

## Screenshots index

| Archivo | Contenido |
|---------|-----------|
| `01-gob-panel.png` | Panel jurisdicción — alarmas + KPIs |
| `02-gob-analytics.png` | Analítica — tiles + adquisición |
| `03-gob-perdidas.png` | Pérdidas — KPIs + lista |
| `04-gob-casos.png` | Casos regulatorios — tabla |
| `05-gob-caso-detail.png` | Detalle CAS-K2DV-88J2 (Pipa) |
| `06-gob-maltrato-detail.png` | Detalle denuncia + MPF |
| `07-gob-panorama.png` | Panorama — mapa + capas |
| `08-gob-moderacion.png` | Moderación placeholder |
| `09-gob-maltrato-list.png` | Cola maltrato |
| `10-gob-cola.png` | Cola aprobaciones vacía |
| `11-gob-reglas.png` | Reglas por jurisdicción |
| `12-gob-mortalidad.png` | Mortalidad y disposición |
| `13-gob-vigilancia.png` | Vigilancia epidemiológica |
