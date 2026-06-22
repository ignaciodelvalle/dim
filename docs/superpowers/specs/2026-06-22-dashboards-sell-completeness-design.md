# Spec/Roadmap: Dashboards — completitud "vendible" (foco admin / stakeholders)

> **Documento de pensamiento — NO toca código.** Sigue a `2026-06-23-dashboards-vnext-roadmap.md` (que damos por
> resuelto como baseline). Mientras aquel cierra el **ciclo de población/custodia** (paquetes E/F/G/H), este se
> enfoca en las **cuatro capacidades que venden el producto a un decisor** (incl. Mi Argentina) y que hoy NO
> existen o están a medias. Origen: review de la sesión + recorrido del portal `/admin` para guionar un walkthrough.
> Convención: 🟢 incremental · 🔵 paquete nuevo · ⭐ misión. Feasibilidad: 🟩 fácil · 🟨 medio · 🟥 caro.

## 0. Decisiones de origen (qué entra y qué no)

De la crítica "qué vendería bien pero no tenemos", el owner resolvió:

| # | Faltante | Decisión | Entra acá |
|---|----------|----------|-----------|
| 1 | Login + credencial oficial Mi Argentina (OIDC real) | **Diferido** — va después de este hito | ❌ (roadmap, no plan) |
| 2 | Reporte oficial exportable (PDF nacional con membrete) | **Sí** | ✅ Paquete I |
| 3 | Forecast / proyección de tendencia | **Sí** | ✅ Paquete J |
| 4 | Bandeja de alertas + triage (revisar → investigar → contactar autoridad local) | **Sí** | ✅ Paquete K |
| 5 | Interoperabilidad con registros nacionales (SENASA/RENAPER/RUPGA sync) | **Diferido** | ❌ |
| 6 | Event-sourcing visible en un dashboard | **Sí** | ✅ Paquete L |

**Regla de integridad (carry-over de la review):** nada de pantallas simuladas en demos. Los puntos 1 y 5 se
narran como roadmap sobre base construida, nunca como features falsas en un video con stakeholders.

---

## 1. Paquete I — Reporte oficial exportable 🔵 · 🟨 medio

**Qué es.** Un botón "Generar informe nacional" en `/admin/programa` (y opcionalmente `/admin/censo`,
`/admin/poblacion`) que produce un **PDF con membrete** — KPIs North-Star vs meta, outliers cross-jurisdicción,
frescura del dato, y ancla legal por métrica — listo para que un funcionario lo lleve a su dirección.

**Por qué vende.** Es el artefacto que un decisor puede **sacar del sistema y circular**. Convierte el dashboard
en evidencia institucional. CSV ya existe (Item 23.3, `/gob/analytics/export`); falta la salida *con formato
oficial*, que es justamente la que pesa en una mesa de gestión.

**Dónde enchufa (ya construido).**
- Fetchers de `lib/metrics` (Programa ya consume `fetchPiiOversight`, `fetchDataQuality`,
  `fetchCrossJurisdictionOutliers`, `registryCounts`, `fetchSterilizationCoverage`, `fetchMicrochipPenetration`,
  `fetchEnoSla`) → el PDF reusa los mismos, sin recalcular.
- `DashboardFreshnessFooter` / `buildProjectionContext` → la marca "calculado al …" va en el pie del informe.
- `TARGETS` + `toneForTarget` → cada KPI sale con su meta y su semáforo.

**Qué falta (lo nuevo).** Un renderer server-side a PDF (`app/admin/programa/informe/route.ts` → stream
`application/pdf`) y una plantilla con membrete MiMAR/DIM. Escribe un `pii_queried`/`report_generated` audit row
(patrón outreach). Sin schema nuevo (payload JSONB en audit).

**Ancla de credibilidad.** Membrete + período + denominador (n) + % de completitud + nota k-anon visibles → el
informe es defendible, no un screenshot.

**Diferir:** scheduling por mail (digest nacional) y "vistas guardadas" → quedan para Paquete H/QOL del vNext.

---

## 2. Paquete J — Forecast / proyección de tendencia 🔵 · 🟩 fácil (donde ya hay serie)

**Qué es.** Una banda de **proyección a futuro** sobre las series que ya graficamos: "al ritmo actual, la cobertura
cruza (o no) la meta en el período X". No es ML — es proyección de tendencia simple (regresión lineal / Holt sobre
los buckets que ya producen `trends.ts` + `timeseries.ts`), con banda de confianza y la **línea de meta** existente.

**Por qué vende.** Pasa de "tablero que mira el pasado" a **herramienta de planificación**. Para el ejecutivo, "vas
a llegar a la meta en marzo" o "a este ritmo no llegás" es la frase que justifica presupuesto.

**Dónde enchufa (ya construido).** `lib/metrics/trends.ts` ya entrega buckets por período (semana ≤120d / mes) con
k-anon: `fetchRabiesCoverageTrend`, `fetchBitesTrend`, `fetchOutbreakSignalsTrend`, `fetchDeathCausesTrend`.
`lib/metrics/timeseries.ts` tiene los transforms puros (testeable sin DB). `OpKpi` ya soporta sparkline + deltaV2.
`TARGETS` da la meta. → El forecast es **una función pura nueva** (`lib/metrics/forecast.ts`: `projectSeries(buckets,
horizon)`) + una banda en el chart. Cero schema.

**Dashboards clave y facilidad (qué hacer primero):**

| Dashboard | Serie base | Estado | Facilidad | Valor de venta |
|-----------|-----------|--------|-----------|----------------|
| **Cobertura antirrábica** (`/admin/programa`, `/gob`) | `fetchRabiesCoverageTrend` | ✅ existe | 🟩 inmediato | Alto — meta legal 80%, narrativa sanitaria |
| **Cobertura esterilización** (`/admin/poblacion`) | TimeSeries `sterilization_performed` | ✅ existe | 🟩 inmediato | ⭐ Alto — es la métrica-misión |
| **Crecimiento de altas / registro** (`/admin/censo`) | altas por bucket (Paquete E) | 🟡 depende de E | 🟨 medio | Alto — "¿el programa escala hacia Mi Argentina?" |
| **Balance poblacional** (esteriliz. vs natalidad) | eventos reproductivos por bucket | 🟡 parcial | 🟨 medio | ⭐ Máximo — el North Star, pero requiere serie de natalidad |
| Señales de zoonosis / mordeduras | `fetchOutbreakSignalsTrend` / `fetchBitesTrend` | ✅ existe | 🟩 fácil | Medio — útil para vigilancia, menos "ejecutivo" |

**Recomendación:** arrancar por **cobertura antirrábica + esterilización** (serie ya existe → forecast es solo la
función pura + la banda). El balance poblacional es el de mayor impacto narrativo pero depende de consolidar la
serie de natalidad (coordina con Paquete G del vNext).

**Honestidad estadística:** mostrar la banda de confianza y el n; rotular "proyección, no garantía". Un forecast
con horizonte corto y supuestos visibles vende; uno que finge precisión, quema.

---

## 3. Paquete K — Bandeja de alertas + triage operativo ⭐/🔵 · 🟨 medio

**Qué es.** El trabajo real del admin: **revisar una alerta, investigarla y contactar al oficial de la localidad.**
Hoy las **suscripciones de alerta existen** (`alert_subscriptions`: `metricKey` × `direction` × `threshold` ×
jurisdicción) y se **evalúan** en `/admin/programa` (`evaluateAlertSubscriptions`), pero la alerta se queda en
"prendida/apagada": no hay ciclo de vida ni acción. Este paquete cierra el loop.

**Por qué vende.** Demuestra que el sistema **no solo mide — acciona**. "Saltó la alerta de zoonosis en La Matanza →
abrí investigación → contacté al gobierno local" es la historia que convierte un dashboard en un centro de operaciones.

**Flujo propuesto (estados):**

```
disparada → reconocida → en investigación → autoridad contactada → resuelta / descartada
```

**Dónde enchufa (ya construido).**
- Disparo: `evaluateAlertSubscriptions` + las 6 `ALERT_METRIC_KEYS` (active_zoonosis, eno_sla_ontime_pct,
  queue_oldest_days, sterilization_coverage_pct, microchip_penetration_pct, open_welfare_reports).
- Investigación: el flujo **ya existe** en `/gob/vigilancia/investigaciones` (`OpenInvestigationForm`,
  `InvestigationActions`, `[caseCode]`). La alerta debe **handoff** a ese expediente, no reinventarlo.
- Contacto: reusar la capa de notificación (outbox) / patrón outreach para "notificar autoridad local".
- Auditoría: cada transición escribe audit (hoy las alertas son `NO audit log en v1` — esto lo cambia).

**Qué falta (lo nuevo).**
- Una **bandeja** `/admin/alertas` (lista con estado, jurisdicción, antigüedad, badge de breach) — no solo el
  panel embebido en Programa.
- Un **ledger de disparos** append-only (`alert_firings` o evento en el log) para tener historial y SLA de
  atención. **Único candidato a schema del paquete** — evaluar si entra como tabla aditiva o como `pet_events`-like
  append. Decisión abierta §K-D1.
- Acción "Abrir investigación desde alerta" (pre-llena `OpenInvestigationForm` con jurisdicción + métrica) y
  acción "Contactar autoridad" (selecciona el/los govt de esa localidad vía `govt_assignments`).

**Ancla legal/credibilidad.** El triage de zoonosis/rabia se apoya en los mismos anclajes que vigilancia (Decreto
4669, Ord. 41.831, Res. 1144). Mostrar el SLA de atención de alertas refuerza "grado sanitario".

**Decisión abierta §K-D1:** ¿historial de disparos como tabla aditiva (`alert_firings`) o como append en el event
log? La segunda es más coherente con event-sourcing (ver Paquete L) pero mezcla eventos de mascota con eventos de
sistema. Recomendación inicial: tabla aditiva dedicada, fuera de `pet_events`.

---

## 4. Paquete L — Libro de eventos / event-sourcing visible 🔵 · 🟩 fácil (read-only)

**Qué es.** Una vista admin **read-only** ("Libro de eventos" / `/admin/libro`) que hace **tangible** el principio
que sostiene todo el producto: `pet_events` es un **registro append-only inmutable**; nada se edita, todo se anexa;
las correcciones son **enmiendas anexadas** (`event_amended`), y el estado de cualquier mascota/jurisdicción es la
**proyección** de ese log — reproducible "al día X".

**Por qué vende (y cómo explicarlo en un dash).** Event-sourcing es abstracto; un decisor no compra "arquitectura".
La forma de que lo *entienda y confíe* es mostrar tres cosas concretas, en este orden:

1. **El stream en vivo** — feed cronológico de eventos (tipo, actor, jurisdicción, timestamp, nº de secuencia).
   Mensaje: "esto es lo que pasó, en orden, sin que nadie lo pueda reescribir."
2. **La enmienda, no la edición** — tomar un evento y mostrar su corrección como un **nuevo evento `event_amended`**
   encima (el modelo ya existe, Wave 2 Item 15: `lib/amendment.ts` + `AmendedBadge`). Mensaje: "no borramos —
   corregimos dejando rastro." Este es el momento "ajá" de confianza/auditoría.
3. **La reproducción temporal** — el `TimeScrubber` del Panorama ya reconstruye el mapa "as of t". Enlazar desde el
   Libro: "el mismo log te deja ver el país como estaba en cualquier fecha." Mensaje: "una sola fuente de verdad,
   verificable hacia atrás."

**Dónde enchufa (ya construido).** `pet_events` (append-only), `event_amended` + `lib/amendment.ts` +
`AmendedBadge`, y la reproducción temporal del Panorama. → El Libro es **proyección + UI read-only**: lista paginada
+ filtro por tipo/jurisdicción (reusa `petEventsScopeClause`), badge de enmienda, y deep-links al Panorama as-of-t.
Cero schema, cero nuevos event types.

**Cuidado de privacidad.** Es vista admin (scope universal), pero aplicar las mismas reglas: PII gateada según
sensibilidad del evento, k-anon en cualquier rollup, y registrar accesos (`pii_queried`) como el resto del admin.

**Diferir:** prueba criptográfica / hash-chain "tamper-evident" visible al ciudadano → roadmap (refuerza el punto 6
pero excede este hito; el valor de venta ya se logra con los 3 pasos de arriba).

---

## 5. Secuencia recomendada

Por ROI y dependencias (todo después de dar vNext por baseline):

1. **🟩 Paquete L (Libro de eventos)** — read-only, reusa lo existente, **cero schema**, y es el que mejor explica
   el corazón del producto. Máximo retorno narrativo por mínimo costo. Primero.
2. **🟩 Paquete J (Forecast)** — empezar por antirrábica + esterilización (serie ya existe). Función pura + banda.
3. **🟨 Paquete I (Reporte oficial PDF)** — reusa fetchers de Programa; el costo es el renderer + plantilla.
4. **🟨 Paquete K (Bandeja de alertas + triage)** — el más grande; toca el único posible schema del set
   (`alert_firings`) y conecta con investigaciones. Cierra el loop "medir → accionar".

Diferidos explícitos (roadmap, no este hito): **#1 Mi Argentina OIDC** y **#5 interoperabilidad de registros**.

## 6. Nota para el walkthrough (próxima versión del video)

Este paquete está pensado para que el **siguiente** recorrido del admin sea más contundente que el actual:

- **Libro de eventos** da el cierre conceptual ("una fuente de verdad, inmutable, reproducible") que hoy se cuenta
  con palabras y mañana se *muestra*.
- **Forecast** agrega el beat de planificación ("vamos a llegar / no vamos a llegar a la meta").
- **Bandeja de alertas** agrega el beat de operación ("el admin detecta, investiga y contacta — en vivo").
- **Reporte oficial** da el call-to-action físico ("y esto te lo llevás en PDF a tu dirección").

El plan de grabación actual (recorrido admin) se mantiene como está; estos cuatro beats se **insertan** cuando CC
los implemente, sin reordenar lo ya guionado.

---

> Todo se apoya en `lib/metrics` (primitivas de proyección + k-anon + period + **trends/timeseries ya existentes**),
> en el modelo de **enmienda append-only ya construido**, y en el flujo de **investigaciones ya construido**. El
> grueso es **proyección + UI read-only**; el único candidato a schema es el ledger de disparos del Paquete K
> (§K-D1, decisión abierta). Coordina con Panorama v2 (capas/presets) y con el vNext (paquetes E/G para las series
> de censo y natalidad que alimentan el forecast).
