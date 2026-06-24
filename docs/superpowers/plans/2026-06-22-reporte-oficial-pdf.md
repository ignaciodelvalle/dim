# Plan: Paquete I — Reporte oficial exportable · ejecutable

> **Para Claude Code.** Plan ejecutable derivado de
> [`specs/2026-06-22-dashboards-sell-completeness-design.md`](../specs/2026-06-22-dashboards-sell-completeness-design.md)
> §1 (Paquete I). Un **informe nacional con membrete** que un funcionario puede sacar del sistema y circular:
> KPIs North-Star vs meta, outliers cross-jurisdicción, frescura del dato y ancla legal por métrica.
> **Sin schema · sin migraciones.** SDD test-first, docs en el PR.
>
> **Patrón de la casa (reusar, no inventar):** el repo ya exporta con **HTML print-ready → "Guardar como PDF" del
> navegador** (sin headless browser, sin persistir archivo) — ver
> [`app/api/mis-mascotas/[publicToken]/libreta-export/route.ts`](../../../app/api/mis-mascotas/[publicToken]/libreta-export/route.ts).
> Este paquete sigue ese patrón. `pdf-lib` (ya en deps) queda como opción para un binario sellado → **diferido**
> (§I-D1).
>
> **Reusa fetchers ya construidos** (los mismos que consume `/admin/programa`, sin recalcular): `fetchPiiOversight`,
> `fetchDataQuality`, `fetchCrossJurisdictionOutliers`, `registryCounts`, `fetchSterilizationCoverage`,
> `fetchMicrochipPenetration`, `fetchEnoSla`, `TARGETS`/`toneForTarget`, `buildProjectionContext` + el helper de
> frescura (`lastIngestAt`).
>
> **Coordinación con la sesión de CC en curso:** Fases I0–I1 son **archivos nuevos**. La única edición de un archivo
> existente es el botón en `/admin/programa` (Fase I2) — commit aislado al final.

---

## Objetivo y no-objetivos

**Objetivo.** `GET /admin/programa/informe` devuelve un **documento HTML print-ready** (membrete MiMAR/DIM + `@media
print` CSS) con el corte ejecutivo del programa a nivel nacional, listo para "Guardar como PDF".

**No-objetivos (diferidos).** Binario PDF sellado vía `pdf-lib` (§I-D1). Scheduling por mail / digest nacional
(Paquete H del vNext). Vistas guardadas. Reportes de `/admin/censo` y `/admin/poblacion` (v1 = solo Programa; el
mismo molde se extiende después).

---

## Fase I0 — Modelo de informe (lib pura + ensamblado) 🟩

**Archivos nuevos:**
- `lib/admin-report.ts`
- `lib/admin-report.test.ts` (integración liviana / unit del armado)

**`buildProgramReport(ctx)` → `ProgramReport`:**
- Llama **en paralelo** a los fetchers ya existentes de Programa (los listados arriba) y arma un modelo plano,
  serializable, **sin JSX**:
  ```ts
  type ReportKpi = { key: string; label: string; value: number; unit: string;
                     target?: number; tone: "ok" | "warn" | "danger" | "neutral";
                     legalAnchor?: string };
  type ProgramReport = {
    generatedAt: string;          // ISO
    period: { since: string; until: string; label: string };
    scopeLabel: string;           // "Nacional · todas las provincias"
    lastIngestAt: string | null;  // frescura
    kpis: ReportKpi[];            // North-Star: cobertura esteriliz., penetración microchip, ENO SLA, registradas…
    outliers: Array<{ jurisdiction: string; metric: string; value: number; target: number }>;
    dataQuality: { completenessByField: Array<{ field: string; pct: number }>;
                   suppressedCells: number; orphanRecords: number };
    piiOversight: { queriesLast30d: number; topActors: Array<{ actor: string; n: number }> };
  };
  ```
- `legalAnchor` por KPI cuando aplique (ej. antirrábica → meta 80% legal; PPP → Ley 14.107/4078). Centralizar el mapa
  KPI→ancla en este módulo (reusar el que ya exista; no duplicar metas — vienen de `TARGETS`).
- Puro respecto de presentación: NO formatea HTML, solo el modelo (testeable sin render).

**Tests (I0):**
- El modelo incluye los KPIs North-Star con su `target` y `tone` derivado de `toneForTarget`.
- `lastIngestAt` es el max `occurredAt` real (no `now`).
- Con dataset vacío → modelo bien formado con KPIs en 0 y `outliers: []` (no crashea).

---

## Fase I1 — Ruta HTML print-ready + plantilla 🟩

**Archivos nuevos:**
- `app/admin/programa/informe/route.ts` (GET → `text/html; charset=utf-8`, `Content-Disposition` con filename
  sugerido `informe-nacional-mimar-{YYYY-MM-DD}.html`)
- `lib/admin-report-html.ts` (render del `ProgramReport` → string HTML con membrete + `@media print` CSS)
- `lib/admin-report-html.test.ts`

**`route.ts`:**
- `await requireAdminOrRedirect()` (admin universal; rechaza desactivados). Si no-admin → 403/redirect coherente con
  el resto de `/admin`.
- `ctx = buildProjectionContext({ role: "admin" }, [], period)` (período desde `searchParams`, default trailing 12m).
- `const report = await buildProgramReport(ctx)` → `renderProgramReportHtml(report)` → `new NextResponse(html, …)`.
- `logReportGenerated(actorUserId, { surface: "admin_report", scope: "national", period })` — **reusar
  `action: "pii_queried"`** con `surface` distintivo (igual que `logOutreachPiiQuery`) para **no tocar el enum
  `AUDIT_LOG_ACTIONS`** (evita editar `db/schema.ts`). Fire-and-forget.

**Plantilla (`admin-report-html.ts`):**
- Membrete: marca MiMAR / codename DIM, escudo/área, título "Informe nacional del programa", `scopeLabel`, período.
- Cuerpo: tabla de KPIs (valor · meta · semáforo es-AR icon+texto) → outliers cross-jurisdicción → calidad de datos →
  oversight PII. Cada KPI con su `legalAnchor` al pie.
- **Pie de credibilidad (obligatorio):** "Calculado al {generatedAt} · último evento {lastIngestAt} · n y % de
  completitud por métrica · celdas suprimidas por k-anonimato: {suppressedCells}". Esto hace el informe defendible.
- CSS `@media print`: A4, márgenes, header/footer repetidos, corte de página entre secciones. `htmlEscape` en todo
  texto dinámico (igual que `libreta-export`).

**Tests (I1):**
- Status 200, `content-type: text/html`, `content-disposition` con filename fechado.
- El HTML contiene las secciones clave (KPIs, outliers, calidad, oversight) y el pie de frescura.
- Dataset vacío → empty-state legible, no output roto.
- Caller no-admin → 403/redirect.
- Se escribió un `pii_queried` con `surface: "admin_report"`.

---

## Fase I2 — Botón en `/admin/programa` (única edición existente) 🟩

> **Única edición de archivo existente. Commit aislado. Coordinar con CC.**
- En `app/admin/programa/page.tsx`, agregar un botón/enlace "Generar informe nacional (PDF)" →
  `/admin/programa/informe` (target `_blank`; el usuario imprime a PDF desde el navegador).
- Additive (no reescribe la página). A11y: link con texto explícito, no solo icono.

**Test (I2):** smoke — la página renderiza el enlace al informe.

---

## Cross-cutting

- **Sin schema / sin migración / sin nuevos audit actions** (se reusa `pii_queried` + `surface`).
- **Una sola fuente de metas:** `TARGETS`. El informe no define umbrales propios.
- **Docs en el PR:** fila en la tabla "Portal surfaces" del `README.md` (`/admin/programa/informe` — Admin — Live) +
  nota de que el export sigue el patrón HTML-print de `libreta-export`.

## Decisiones abiertas

- **§I-D1 — HTML-print vs binario sellado.** Default **HTML-print** (coherente con la casa, cero deps nuevas). Si se
  necesita un PDF binario con sello/firma, segunda iteración con `pdf-lib` (ya en deps) — diferido.
- **§I-D2 — alcance v1.** Solo Programa. Censo/Población reusan `buildProgramReport`-like después (mismo molde).
- **§I-D3 — branding.** Confirmar membrete/escudo definitivos (placeholder explícito hasta tenerlo).

## Criterios de aceptación (resumen)

1. `GET /admin/programa/informe` devuelve HTML print-ready con membrete, KPIs vs meta, outliers, calidad de datos,
   oversight PII y pie de frescura/denominador.
2. Reusa los fetchers de Programa (sin recalcular) y `TARGETS` (sin metas propias).
3. Escribe auditoría sin tocar el enum `AUDIT_LOG_ACTIONS` (reusa `pii_queried` + `surface`).
4. No-admin rechazado; dataset vacío no rompe.
5. Cero schema/migración; botón additive en `/admin/programa`; tests I0+I1(+I2 smoke) en verde.
