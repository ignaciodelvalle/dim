# MiMAR · Organizations portal (`/org/[orgToken]/*`) — UX/quality audit

> **Fecha:** 2026-07-04 · **Ground truth:** `integration/all-20260703` @ `346b44cb` (`git rev-parse --short HEAD`).
> **Método:** lectura de código canónico (read-only, sin browser en vivo) sobre las ~37 rutas de `app/org/**`, `components/layout/nav-presets.ts` (`buildOrgNav`), `components/ui/dashboard/*`, y `app/org/[orgToken]/layout.tsx`. Contrastado contra el smoke-test critique de 2026-07-03 (`docs/design/handoffs/critiques-smoke-2026-07-03/critique-org-admin-2026-07-03.md` + round2) para verificar qué hallazgos previos siguen vigentes.
> **Audiencia:** operadores de refugios, clínicas, redes de rescate y autoridades sanitarias — frecuentemente personal no técnico manejando 200+ animales.

---

## A. Resumen ejecutivo (peores bloqueadores para el staff de refugio)

1. **🔴 Sin paginación/búsqueda en las listas de mayor tráfico.** `mascotas` (custodia, la lista central de un refugio), `transferencias` (ambas direcciones), `voluntarios`, `voluntarios/propuestas`, `miembros` y `servicios` traen **todas** las filas sin `LIMIT`/`?q=`/filtro alguno — ni siquiera un filtro client-side. A 200+ animales o miembros esto es una lista plana e inmanejable. El propio código ya resolvió esto bien en `adopciones`/`casos` (fetch N+1 + bandera `truncated` + `OpBulkBar`) — es el patrón correcto, solo falta aplicarlo a las otras 6 rutas.
2. **🔴 El filtro de censo hacia mascotas está roto.** `censo/page.tsx` genera links `?species=dog|cat|other`, pero `mascotas/page.tsx` nunca lee ese parámetro — un click en "Ver perros" muestra la lista completa sin filtrar (`censo/page.tsx:93,106,119` vs `mascotas/page.tsx:34-41,76-80`).
3. **🔴 Dos bugs de coherencia de navegación** que confunden "¿en qué pantalla estoy?": `Censo` no tiene entrada en `SEGMENT_LABELS`, así que el breadcrumb del topbar cae a "Panel" mientras el sidebar resalta "Censo" (`OrgBreadcrumbs.tsx:10-32`); y `Permisos` tiene **tres** rótulos distintos simultáneos (topbar "Admin", breadcrumb propio de página "Administración > Permisos", H1 "Solicitudes de permisos") (`admin/permisos/page.tsx:161-167`).
4. **🟡 Fuga de i18n en la ruta más usada del portal.** `OrgMascotasBulkList.tsx` reimplementa un mapa de especies local e incompleto (dog/cat/other) en vez de usar el helper compartido `speciesLabel()` (`lib/utils/format.ts`) que sí cubre conejo/cobayo/hurón y que otras rutas del mismo portal (`intake`, `transferencias/nueva`, `transitos`, `voluntarios`) ya usan correctamente.
5. **🟡 Acciones destructivas/terminales sin confirmación**: "Devolver" un caso de maltrato al gobierno (terminal, con consecuencia legal) y "Eliminar" una regla de agenda de servicio solo piden un campo de texto, sin diálogo de confirmación — inconsistente con `CapabilityMatrix`/bulk-reject de adopciones, que sí confirman.
6. **🟡 El tipo de organización no gobierna la navegación.** `buildOrgNav` filtra únicamente por capability, nunca por `organization.orgType` — una autoridad sanitaria o una clínica ven permanentemente "Tránsitos" y "Voluntarios" en el sidebar aunque el concepto no les aplique (degradan a empty state, no rompen, pero son clutter persistente).
7. **🟡 `voluntarios/propuestas` filtra en memoria después de un `LIMIT(200)`** — un tab de estado puede mostrar menos filas de las que realmente existen sin ninguna señal de truncamiento; pérdida silenciosa de datos.
8. **🟢 Ningún `loading.tsx`/`error.tsx` anidado** en `intake`, `transferencias`, `mascotas`, `checkins`, `censo`, `transitos` — solo existe a nivel raíz de `/org/[orgToken]`, así que la navegación entre secciones no muestra feedback visual.
9. **🟢 `DashboardFreshnessFooter` no está montado en ningún lugar de `/org/*`** pese a existir como componente — el staff no tiene forma de saber si un KPI está fresco o stale.
10. **✅ Buenas noticias verificadas:** el crash histórico de Adopciones/Operaciones (Server Components error en adopciones activas) está **genuinamente arreglado** en ambas capas (lista y detalle), con un test de regresión repo-wide (`__tests__/projection-payload-uuid-guard.test.ts`) que impide reintroducirlo. La confusión de nombres "Maltrato/Bienestar/Investigaciones" también está resuelta (un solo nombre en todo el portal). El gating de capability en `mordedura/nuevo` (bug de vet sin `bite.report`) está corregido con re-chequeo server-side.

---

## B. Scorecard — ruta × patrón

Leyenda: ✅ presente y bien resuelto · ⚠️ presente con gap · ❌ ausente/roto · ➖ no aplica a esta ruta.

| Ruta | KPI/tono | Filtro URL | Paginación/queue | Bulk-con-razón | Chips estado | Empty+CTA | Audit trail | Breadcrumbs | Confirm destructivo | es-AR / i18n |
|---|---|---|---|---|---|---|---|---|---|---|
| `page.tsx` (panel) | ✅ | ➖ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ✅ | ➖ | ✅ |
| `intake` | ➖ | ⚠️ | ⚠️ limit(100) sin aviso | ➖ | ✅ | ✅ | ➖ | ✅ | ➖ | ✅ |
| `intake/match/[token]` | ➖ | ➖ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ |
| `transferencias` (nueva/recibidas) | ➖ | ➖ | ❌ limit(200) sin truncado | ➖ | ✅ | ✅ | ➖ | ✅ | ➖ | ✅ |
| `mascotas` (custodia) | ➖ | ❌ roto (censo→mascotas) | ❌ sin límite ni filtro | ✅ (bulk vacuna/elegibilidad) | ✅ | ✅ | ➖ | ✅ | ➖ | ❌ mapa local incompleto |
| `mascotas/[publicToken]` (hub) | ➖ | ➖ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ |
| `checkins` | ➖ | ➖ | ⚠️ limit(30) sin aviso | ➖ | ✅ | ✅ | ➖ | ✅ | ➖ | ✅ |
| `censo` | ✅ | ❌ (genera link roto) | ➖ | ➖ | ✅ | ✅ | ➖ | ❌ **breadcrumb roto** | ➖ | ✅ |
| `transitos` | ➖ | ➖ | ⚠️ limit(200) sin aviso | ➖ | ✅ | ✅ (por tab) | ➖ | ✅ | ➖ | ✅ |
| `pets/no-aptas` | ➖ | ➖ | ➖ (subset chico) | ➖ | ✅ | ✅ | ➖ | ✅ | ➖ | ✅ |
| `adopciones` + `[appEventId]` | ➖ | ✅ chips estado | ✅ **modelo a copiar** (N+1 + truncated) | ✅ (reject con razón + confirm) | ✅ | ✅ | ✅ PII audit | ⚠️ solo back-link | ✅ | ✅ |
| `voluntarios` | ➖ | ✅ facetado (especie/prov/loc) | ⚠️ limit(50) sin aviso | ➖ | ➖ | ✅ | ➖ | ❌ ninguno | ➖ | ✅ |
| `voluntarios/propuestas` | ➖ | ✅ chips estado | ⚠️ limit(200) + filtro en memoria (pérdida silenciosa) | ➖ | ✅ | ✅ | ➖ | ❌ ninguno | ➖ | ✅ |
| `maltrato/recibidos` + `nuevo` | ➖ | ✅ tabs | ⚠️ limit(100) sin aviso | ➖ | ✅ | ✅ | ⚠️ sin actor/timestamp visible | ✅ | ⚠️ "Devolver" sin confirm | ✅ (nombre unificado) |
| `mordedura/nuevo` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ (gating corregido) |
| `agenda` + `turnos/[token]` | ➖ | ✅ `?fecha=` | ➖ (día único) | ➖ | ✅ | ✅ | ➖ | ❌ falta en lista | ➖ | ✅ |
| `casos` | ➖ | ✅ | ✅ (reusa `CaseQueue`) | ➖ (por diseño) | ✅ | ✅ | ➖ | ❌ solo H1 | ➖ | ✅ |
| `servicios` (+ nuevo/detalle/agenda) | ➖ | ➖ | ❌ sin límite ni filtro | ➖ | ✅ | ✅ | ➖ | ✅ | ❌ "Eliminar" regla sin confirm | ✅ |
| `miembros` (+ invitar) | ➖ | ➖ | ❌ sin límite ni filtro | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ✅ |
| `admin/permisos` | ➖ | ➖ | ✅ (matrix + queue) | ➖ | ✅ | ✅ | ✅ | ❌ **3 rótulos en conflicto** | ➖ | ✅ |
| `configuracion` / `cobertura` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ⚠️ duplicado (redundante, no conflictivo) | ➖ | ✅ |
| `app/org/page.tsx` (org picker) | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ | ⚠️ tipo solo texto, sin ícono |

**Tenencia (org-scope):** ✅ resuelto en toda la superficie — `OpScopeChip` en el topbar de `layout.tsx` es inequívoco en cada ruta; `requireOrgAccessByToken` devuelve `notFound()` sin filtrar existencia del org. El único riesgo residual de tenencia es el hallazgo #6 de la tabla de abajo (marcador de identidad inconsistente dentro de "Administración" para staff con 2+ orgs).

---

## C. Hallazgos priorizados

| # | Finding | file:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| 1 🔴 | Censo enlaza `?species=` pero `mascotas` nunca lo consume | `censo/page.tsx:93,106,119` · `mascotas/page.tsx:34-41,76-80` | Refugio con 200+ animales de varias especies hace click en "Ver perros" y ve la lista completa sin filtrar | S | Leer `sp.species` en `mascotas/page.tsx` y aplicar `eq(pets.species, sp.species)` |
| 2 🔴 | `mascotas` (lista central de custodia): sin `.limit()`, sin `?q=`, y el client component tampoco compensa con filtro alguno | `mascotas/page.tsx:76-80` · `OrgMascotasBulkList.tsx:142-165` (sin filter state) | Refugio de 300 animales carga todas las filas siempre; "Seleccionar todo" bulk se vuelve riesgoso sin forma de acotar primero | M | Filtro texto/estado/especie client-side como stopgap; luego paginación real server-side (`?q=`) |
| 3 🔴 | `Censo` no está en `SEGMENT_LABELS` → breadcrumb del topbar cae a "Panel" mientras sidebar dice "Censo" | `components/layout/nav-presets.ts:90-96` vs `components/ui/dashboard/OrgBreadcrumbs.tsx:10-32` | Alto para staff no técnico — rompe la única señal de "dónde estoy" | XS (1 línea) | Agregar `censo: "Censo"` al mapa |
| 4 🔴 | `admin/permisos` con 3 rótulos simultáneos en conflicto (topbar "Admin", in-page "Administración > Permisos", H1 "Solicitudes de permisos") | `OrgBreadcrumbs.tsx:31` + `admin/permisos/page.tsx:161-167` | Medio-alto — activamente confuso, no solo inconsistente | S | Eliminar el `OpCrumbs` de página (confiar en el topbar) o corregir `SEGMENT_LABELS["admin"]` para emitir el subpath completo |
| 5 🔴 | `miembros` y `servicios`: listas sin `.limit()`/`.offset()` ni filtro; no existe ningún primitivo de paginación en `components/ui/dashboard` (confirmado por grep) | `miembros/page.tsx:53-65` · `servicios/page.tsx:34-38` | Alto a escala — red de rescate o autoridad municipal grande obtiene una lista gigante sin índice | M | Agregar límite/offset + filtro texto; o extraer un `OpList`-con-pager compartido (beneficia también a admin/gob) |
| 6 🟡 | `OrgMascotasBulkList` reimplementa un mapa de especies local incompleto en vez de `speciesLabel()` | `OrgMascotasBulkList.tsx:94-98,113-115` | Fuga de inglés crudo (`guinea_pig`, `ferret`, `rabbit`) en la ruta de mayor tráfico del portal — exactamente lo que el critique de 2026-07-03 marcó, todavía reproducible acá específicamente | XS | Importar `speciesLabel` de `@/lib/utils/format` |
| 7 🟡 | `transferencias` (ambas direcciones): `.limit(200)` sin bandera de truncamiento, a diferencia de `adopciones` en el mismo portal | `transferencias/page.tsx:69` · `transferencias/recibidas/page.tsx:113,158` | Red con >200 transferencias históricas pierde visibilidad de las más viejas sin ningún aviso | S | Copiar el patrón `LIMIT 201` + `truncated` de `adopciones/page.tsx:97-100,140-143` |
| 8 🟡 | `voluntarios/propuestas`: `.limit(200)` y **luego** filtra por estado en memoria | `voluntarios/propuestas/page.tsx:35-48` | Pérdida silenciosa de datos en un tab de filtro — staff puede creer que un estado tiene 0/pocas filas | S–M | Empujar `status` al `WHERE` de SQL antes del `LIMIT`, o adoptar el patrón `truncated` |
| 9 🟡 | "Devolver" (maltrato, terminal) y "Eliminar" (regla de agenda) sin diálogo de confirmación | `maltrato/recibidos/InterventionActions.tsx:70-72,104-111` · `servicios/[offeringToken]/agenda/page.tsx:176-182` | Un click erróneo en una acción legal/operacionalmente consecuente sin "¿estás seguro?" | S | Reusar el patrón confirm ya existente en `CapabilityMatrix`/bulk-reject de adopciones |
| 10 🟡 | `buildOrgNav` no filtra por `organization.orgType`, solo por capability — "Tránsitos"/"Voluntarios" aparecen siempre, incluso para autoridad sanitaria/clínica | `nav-presets.ts:69-211` (líneas 97-108 sin gate) | Clutter permanente para tipos de org donde el concepto no aplica (degrada a empty state, no rompe) | M | Agregar gate opcional por `orgType` a `OrgNavItem`, igual forma que `requiredCapability` |
| 11 🟢 | Ningún `loading.tsx`/`error.tsx` anidado en las 6 subrutas de mayor uso | Ausencia en `intake/`, `transferencias/`, `mascotas/`, `checkins/`, `censo/`, `transitos/` | Sin feedback visual al navegar entre secciones (agrava el lead de "org pages lentas") | S–M | `loading.tsx` con `OpCardSkeleton`/`OpKpiSkeleton`, priorizando `mascotas` y `censo` |
| 12 🟢 | `DashboardFreshnessFooter` no se usa en ninguna ruta de `/org/*` (0 matches) | n/a (ausencia) | Staff no puede saber si un KPI/censo está stale tras un query lento | S | Montar en `page.tsx` (panel) y `censo/page.tsx` |
| 13 🟢 | Marcador de identidad de org inconsistente dentro de "Administración" (`servicios` tiene eyebrow con nombre de org; `miembros` lo embebe en H1; `admin/permisos` no lo muestra en absoluto) | `servicios/page.tsx:44-47` vs `miembros/page.tsx:134-137` vs `admin/permisos/page.tsx` (ausente) | Riesgo de confusión de tenencia para staff que coordina 2+ orgs (rol nombrado en otra parte del código) | S | Estandarizar el patrón eyebrow en las 5 páginas de la sección Administración |
| 14 🟢 | Org picker: 4 tarjetas sin diferenciación visual por tipo (solo texto), sin chevron | `app/org/page.tsx:16-22,77-94` | Bajo-medio — solo afecta a usuarios con 2+ membresías, pero es justo el caso multi-tenant confuso | S | Ícono/pill por tipo (reusar `OpPill`/`Icon`) + chevron |
| 15 🟢 | `voluntarios` (limit 50) sin aviso de truncado; `intake`/`checkins` (limit 100/30) ídem, menor severidad | `voluntarios/page.tsx:27-34` · `intake/page.tsx:78` · `checkins/page.tsx:103,128` | Menor — listas normalmente acotadas por recencia, pero mismo punto ciego | XS | Mismo patrón truncated que #7 |
| 16 🟢 | Sin búsqueda de texto libre en `adopciones`/`voluntarios` (solo filtros por chip/select) | `AdoptionQueueList.tsx` · `voluntarios/page.tsx` | Fricción moderada a escala, no bloqueante | M | Campo de búsqueda por nombre wireado al querystring de filtros |
| 17 🟢 | Deriva de rótulo nav vs H1 (nav "Servicios" / H1 "Mis servicios"; nav "Cobertura" / H1 "Zonas de cobertura") | `servicios/page.tsx:48` · `cobertura/page.tsx:40` | Bajo — breadcrumb y nav concuerdan, solo el H1 diverge | XS | Alinear texto de H1 con el rótulo de nav |
| 18 🟢 | `agenda` (vista día) sin `OpCrumbs`, `voluntarios`/`voluntarios/propuestas`/`casos` sin breadcrumb en absoluto | `agenda/page.tsx:169-177` y rutas mencionadas | Gap menor de consistencia de navegación | S | Agregar `OpCrumbs` |
| 19 🟢 | `maltrato/recibidos` no muestra actor/timestamp de quién tomó/devolvió el caso en la UI (aunque el audit trail de backend existe) | `maltrato/recibidos/page.tsx:252-271` | Debilita accountability visible en un flujo legalmente sensible | S | Mostrar actor + timestamp junto al pill de intervención |

**Verificación de leads previos (critique 2026-07-03):**
- **Crash de Adopciones/Operaciones**: ✅ **Arreglado** en ambas capas (lista vía `safePayloadUuid()`, `c95e9f4a`; detalle vía `isUuid()` guard, `f0e1f900`), con test de regresión repo-wide `__tests__/projection-payload-uuid-guard.test.ts` (13/13 passing) que impide reintroducir la clase de bug.
- **Fuga de especies en inglés**: ⚠️ **Mayormente arreglada** — `speciesLabel()` cubre el resto del portal correctamente; sigue reproducible solo en `OrgMascotasBulkList` (hallazgo #6 arriba), que es exactamente la ruta de mayor tráfico.
- **Maltrato/Bienestar/Investigaciones (3 nombres)**: ✅ **Arreglado** — un solo nombre "Maltrato" en sidebar/breadcrumb/H1, con paridad en `/gob/maltrato`.
- **Vet sin `bite.report` podía abrir el form de mordedura**: ✅ **Arreglado** — `requireCapability("bite.report", ...)` server-side antes de montar el form.
- **Org picker sin afordancia de tipo**: ❌ **Sigue vigente** (hallazgo #14).

---

## Top 5 fixes para `/org`

1. **Aplicar el patrón `LIMIT N+1 + truncated` (ya resuelto en `adopciones`/`casos`) a `mascotas`, `transferencias` (ambas), `voluntarios`, `voluntarios/propuestas`, `miembros` y `servicios`.** Es el hallazgo más recurrente (6+ rutas) y el de mayor impacto en escala multi-animal — y el fix ya existe en el propio código como referencia.
2. **Arreglar el filtro roto censo→mascotas** (`?species=` generado pero nunca leído) — barato, alto impacto visible.
3. **Arreglar los dos bugs de coherencia de nav**: agregar `censo` a `SEGMENT_LABELS` (1 línea) y resolver el conflicto de 3 rótulos en `admin/permisos`.
4. **Reemplazar el mapa de especies local de `OrgMascotasBulkList` por `speciesLabel()` compartido** — barato, corrige la fuga de i18n en la ruta de mayor tráfico del portal.
5. **Agregar confirmación a "Devolver" (maltrato) y "Eliminar" (regla de agenda)** — acciones legal/operacionalmente consecuentes sin gate, alto riesgo para personal no técnico con un solo click.
