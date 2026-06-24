# Plan: Retiro de `/gob/analytics` (descomposición del catch-all) · ejecutable

> **Para Claude Code.** Cierra la decisión de producto pendiente sobre `/gob/analytics` (registrada como
> "absorción vía 308 — no ejecutada"). **Conclusión de la review:** no es un caso de "absorber en Panorama"; es un
> **catch-all heredado** (pre metrics-IA / pre Panorama) cuya mitad ya está duplicada en hogares canónicos. Regla:
> **si ya está repetido, se va; solo migramos lo que verdaderamente agrega valor y no esté ya planificado en los
> Paquetes E (censo) / F (adopción).** El 308 es el **último** paso, a destinos canónicos, no en bloque a Panorama.
>
> **Gating:** las migraciones (Fase A) dependen de que existan los destinos — **Paquete E** (`/gob/censo`,
> `/admin/censo`) y **Paquete F** (adopción). La Fase A3 (ranking) y todo lo de retiro (C/D) pueden ir antes si E/F
> se postergan, pero **migrar antes de borrar** siempre.
>
> **Coordinación con CC (refactor cross-página — el más invasivo en archivos existentes):** todas las ediciones van
> en **commits aislados por fase**, después de E/F, y **nunca borrar antes de migrar**. Lista de puntos de corte
> exacta en la Fase 0.

---

## Inventario de dependencias (verificado contra `develop`)

**Links entrantes a `/gob/analytics` (6) — todos deben repuntar o removerse en Fase C:**
- `app/admin/page.tsx:115` — "Analítica nacional"
- `app/admin/sistema/page.tsx:65`
- `app/gob/page.tsx` — 4 links (261, 281, 348, 371)
- `components/panorama/DetailDrawer.tsx:320` — drill desde Panorama

**Nav + tests:**
- `components/layout/nav-presets.ts:229` — entrada "Analítica" en `GOB_NAV_SECTIONS`
- `components/layout/nav-presets.test.ts` (237, 250-251, 347) + `lib/shell-nav-phase-b.test.ts:37`

**Componentes usados SOLO en analytics (mover si migran, borrar si no):** `AcquisitionChartDynamic`,
`RegionRankingTable`, `OutbreakHistoryTable` (`app/gob/analytics/_components/`).

**Lib dedicada:** `lib/analytics-ranking.ts` (`fetchRegionRanking`), `lib/govt-exports.ts`
(`/gob/analytics/export`). `fetchAcquisitionTrend` vive en `lib/govt-dashboards.ts` (compartido — **no** borrar).

---

## Fase 0 — Audit keep/kill (decide qué, si algo, sobrevive) 🟩

Para cada panel, confirmar si ya está cubierto por un hogar canónico **o** ya planificado en E/F. Sesgo a borrar.

| Panel de analytics | ¿Duplicado / ya planificado? | Acción |
|---|---|---|
| KPI Pets totales + sparkline registro | Sí → Censo (E) | **Kill** (cross-link) |
| KPI Cobertura antirrábica | Sí → Programa + capa Panorama | **Kill** |
| KPI Disputas de custodia | Sí → `/gob/disputas` | **Kill** |
| Señales de brote (tendencia) | Sí → `/gob/vigilancia` + capa zoonosis | **Kill** |
| Distribución geográfica (choropleth casos/10k) | Sí → Panorama | **Kill** |
| Top 10 causas de muerte | Sí → `/gob/mortalidad` | **Kill** |
| Brotes históricos (tabla) | Sí → `/gob/vigilancia` | **Kill** |
| Adquisición por método + CSV | ¿E lo cubre? (altas/cohortes) | **Migrar SOLO si E no lo cubre** → A1 |
| KPI Tasa de adopción 12m | ¿F lo cubre? (pipeline adopción) | **Migrar SOLO si F no lo cubre** → A2 |
| Ranking cross-region antirrábica (tabla) | Parcial → Programa (outliers) | **Migrar si aporta vista tabular** → A3 |

> **Resultado esperado:** el residuo verdaderamente único es chico (a lo sumo adquisición-por-método, tasa de
> adopción y el ranking tabular). Si E/F ya los contemplan, **analytics pasa a ser borrado puro** (sin Fase A).
> Documentar la decisión por panel en el PR.

---

## Fase A — Migrar los sobrevivientes (condicional, gated E/F) 🟨

> Solo los panels marcados "Migrar" en Fase 0. Cada migración es additive en el destino; **no toca analytics todavía**
> (para no romper nada antes de la Fase C).

- **A1 — Adquisición por método → Censo.** Mover `AcquisitionChartDynamic` a `/gob/censo` + `/admin/censo` (Paquete
  E); reusar `fetchAcquisitionTrend` (`lib/govt-dashboards.ts`). **CSV:** usar el export per-chart de `DashboardChart`
  (Item 23.3) en vez de la ruta dedicada `/gob/analytics/export` → así la ruta de export se retira en C.
- **A2 — Tasa de adopción 12m → Adopción (F).** Mover el KPI (reusar el fetcher subyacente de `fetchAnalyticsMetrics`
  o el de F) a la superficie de adopción.
- **A3 — Ranking cross-region antirrábica → Programa / Población.** Mover `RegionRankingTable` + `fetchRegionRanking`
  (`lib/analytics-ranking.ts`) a la sección de outliers/cobertura de `/admin/programa` (o `/admin/poblacion`).
- **Tests:** value-pinning — los números del panel migrado coinciden con los de analytics pre-retiro (parity).

---

## Fase B — Verificar paridad de los "kill" (sin migración) 🟢

Antes de borrar, confirmar que cada panel duplicado **ya se ve** en su hogar canónico (no perder señal):
- causas de muerte ↔ `/gob/mortalidad`; señales/brotes ↔ `/gob/vigilancia`; choropleth ↔ Panorama; KPIs ↔
  Programa/Censo/`/gob/disputas`.
- Si algún matiz falta (p. ej. el corte "top-10 causas" exacto), abrir un follow-up chico en el hogar canónico —
  **no** preservar analytics por eso.
- Agregar cross-links salientes donde aporte (p. ej. `DetailDrawer.tsx:320` debe pasar a apuntar a Panorama mismo o
  a `/gob/mortalidad`, no a analytics).

---

## Fase C — Retiro de la ruta 🟨 (repunta 6 links + nav + 308)

> **Solo después de A (migración) + B (paridad). Commits aislados.**
1. **Repuntar los 6 links entrantes** a su destino canónico:
   - `admin/page.tsx` + `admin/sistema/page.tsx`: "Analítica nacional" → **`/admin/programa`** (exec) y, para lo
     espacial, **`/admin/panorama`** (dos links claros en vez de uno ambiguo).
   - `app/gob/page.tsx` (×4): a `/gob/vigilancia`, `/gob/mortalidad`, `/gob/censo` o Panorama según el contexto de
     cada card (revisar cada uno; no repuntar todos al mismo lugar).
   - `components/panorama/DetailDrawer.tsx:320`: al hogar canónico del dato del drawer.
2. **Quitar la entrada de nav** `nav-presets.ts:229` + actualizar `nav-presets.test.ts` (237/250-251/347) y
   `shell-nav-phase-b.test.ts:37` (invariante "ningún href perdido" — ahora el href se retira intencionalmente).
3. **Reemplazar `app/gob/analytics/page.tsx` por un 308** (`redirect`/`permanentRedirect`) → destino canónico
   (§AR-D1). Mantener la ruta como redirect un ciclo para no romper bookmarks/links externos.
4. **Borrar** `app/gob/analytics/export/*` + `app/gob/analytics/_components/*` que no se migraron, y `lib/govt-exports.ts`
   si queda huérfano.

---

## Fase D — Cleanup & docs 🟢

- Borrar lib huérfana solo tras confirmar 0 referencias: `lib/analytics-ranking.ts` (si A3 lo movió a otro módulo),
  `lib/govt-exports.ts`. **Verificar con grep antes de borrar.** `fetchAcquisitionTrend` y `fetchAnalyticsMetrics`
  quedan en `lib/govt-dashboards.ts` si otros los usan.
- `README.md`: quitar (o marcar "Retired → 308") la fila `/gob/analytics` de la tabla "Portal surfaces".
- `lib/metrics/targets.ts:10`: actualizar el comentario que referencia `/gob/analytics`.
- Comentarios `D1.3`/Item 22 en `trends.ts` / `analytics-ranking.ts`: re-anclar al nuevo hogar.

---

## Decisiones abiertas

- **§AR-D1 — destino del 308.** Una ruta redirige a un solo lugar. Recomendado: **role-aware vía middleware**
  (admin → `/admin/programa`, govt → `/gob/vigilancia`); si se quiere estático y simple, 308 → `/gob/panorama` (la
  consola es el sucesor espiritual para "explorar"). Decidir.
- **§AR-D2 — ¿sobrevive algo?** Depende de Fase 0: si E/F ya cubren adquisición-método y tasa-de-adopción, **no hay
  Fase A** y esto es borrado puro + repunte de links. Confirmar contra los planes E/F antes de migrar (evitar migrar
  algo que E/F van a construir igual → doble trabajo).
- **§AR-D3 — timing.** Ejecutar **después** de que E/F aterricen (para tener destino) y **fuera** de la ventana de
  grabación de la demo (el recorrido no usa `/gob/analytics`, así que no bloquea la demo).

## Criterios de aceptación (resumen)

1. Fase 0 documenta, panel por panel, kill vs migrate (con sesgo a kill y chequeo contra E/F).
2. Todo panel "migrate" aparece en su hogar canónico con parity verificada antes de cualquier borrado.
3. Los 6 links entrantes repuntan a destinos canónicos; la nav y los 2 snapshots se actualizan.
4. `/gob/analytics` queda como 308 al destino acordado; export y componentes huérfanos borrados.
5. Sin pérdida de señal (Fase B); README/targets/comentarios actualizados; sin lib huérfana colgando.
