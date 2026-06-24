# Design Critique — Portal Admin (`/admin`) · MiMAR / DIM

> Revisión ejecutiva del perfil **admin** (scope universal). Foco: detalles faltantes, modelado y proyección de datos, usabilidad de dashboards y pantallas, y cosas que "no cierran". Read-only — no se modificó código.
> Fecha: 2026-06-22 · Alcance: 50 archivos / ~9.300 líneas en `app/admin/**`.

---

## ✅ Estado de remediación — TODOS los hallazgos cerrados (2026-06-22)

Los **40 hallazgos C1-C40** fueron remediados en **10 PRs** sobre `review/all-session-prs`
([plan](superpowers/plans/2026-06-22-admin-executive-review-fixes.md)). SDD test-first, `pnpm verify` + `pnpm test` verdes, cero regresiones.
Mergear en orden PR-1 → PR-10 (PR-7 supersede el stopgap de C22 de PR-1).

| Hallazgos | PR | Rama |
|---|---|---|
| ~~C1, C2, C3, C22~~ | [#714](https://github.com/ignaciodelvalle/dim/pull/714) | `fix/sec-admin-queue-counts` |
| ~~C4, C5, C6, C7, C8, C10~~ | [#715](https://github.com/ignaciodelvalle/dim/pull/715) | `fix/admin-destructive-confirmations` |
| ~~C11, C12~~ | [#716](https://github.com/ignaciodelvalle/dim/pull/716) | `fix/admin-audit-trail-body` |
| ~~C13, C14, C15, C16~~ | [#717](https://github.com/ignaciodelvalle/dim/pull/717) | `chore/admin-operator-data-cards` |
| ~~C17, C18, C19~~ | [#718](https://github.com/ignaciodelvalle/dim/pull/718) | `fix/admin-surface-boundaries` |
| ~~C20~~ | [#719](https://github.com/ignaciodelvalle/dim/pull/719) | `fix/sec-magic-link-handling` |
| ~~C9, C21, C23, C24~~ | [#720](https://github.com/ignaciodelvalle/dim/pull/720) | `fix/admin-rosters-evidence-scale` |
| ~~C25, C26, C27, C28~~ | [#721](https://github.com/ignaciodelvalle/dim/pull/721) | `fix/admin-ia-landing-nav` |
| ~~C29, C30, C31, C32~~ | [#722](https://github.com/ignaciodelvalle/dim/pull/722) | `fix/admin-filters-tables` |
| ~~C33, C34, C35, C36, C37, C38, C39, C40~~ | [#723](https://github.com/ignaciodelvalle/dim/pull/723) | `chore/admin-consistency-polish` |

> Nota C36: la causa real del <100% en la tabla de provincias era pets **sin provincia asignada**
> (la coropleta de provincia no aplica supresión k-anon — k-anon es a nivel localidad), no celdas suprimidas;
> el footnote agregado explica esa causa real, no la asumida en el cuerpo de abajo.

Los hallazgos quedan abajo en su forma original (read-only de la auditoría) como registro histórico.

---

## Overall Impression

El portal admin está **sorprendentemente sólido en disciplina de proyección y accesibilidad** — cada KPI declara `definition / formula / caveat`, hay supresión k-anon visible, estados vacíos, skeleton de carga y 404 branded. La materia prima es de calidad pública-sanitaria.

La oportunidad más grande **no es estética, es de coherencia**: (1) la arquitectura de información del portal se contradice a sí misma (el landing dice que media plataforma "vive en Gobierno" mientras el nav la lista bajo `/admin`), (2) las colas operativas — el corazón del trabajo del admin — se degradan justo cuando más se las necesita (sin límites, contadores que sólo miran la página actual), y (3) las acciones más destructivas tienen menos fricción que las menos destructivas. Para un ejecutivo curioso, el portal "se siente" potente pero deja preguntas abiertas sobre en qué número confiar y dónde se hace cada cosa.

---

## 1. Primera impresión (arquitectura de información)

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **El landing `/admin` se contradice con su propio nav.** El copy dice *"Las aprobaciones de cola, búsqueda de usuarios y verificación de orgs viven en el portal de Gobierno"* (`page.tsx:43-44`) y el callout final manda *"Ir a Gobierno →"* para la cola — pero el KPI "Solicitudes pendientes" linkea a `/admin/cola` (`:68`), el de usuarios a `/admin/usuarios`, y el nav lista Cola, Usuarios y Organizaciones bajo `/admin`. El admin no sabe si su cola vive en su portal o en Gobierno. | 🔴 Crítico | Decidir la verdad: o el admin opera sus propias colas (entonces reescribir el copy) o no (entonces sacar los ítems del nav). Hoy ambas afirmaciones coexisten. |
| **Tres tiras de KPI solapadas sin un "home" claro.** `/admin` (Dashboard), `/admin/sistema` y `/admin/programa` repiten Usuarios personales, Cola pendiente, Decisiones 7d y SLA ENO. El "Resumen ejecutivo" real (`programa`) — el más rico — está enterrado en la sección *Confiabilidad*, debajo de Censo. | 🟡 Moderado | Promover `programa` a la portada (o fusionarlo con Dashboard). El landing debería abrir con las North-Star, no con 3 tarjetas de cuentas. |
| **Taxonomía del nav mezcla analítica con fiabilidad.** La sección *Confiabilidad* contiene Programa, Censo, Adopciones, Población (analítica poblacional) junto a Sistema, Outbox, Auditoría (salud operativa). Son dos mentes distintas bajo una etiqueta. | 🟡 Moderado | Separar "Analítica / Programa" de "Operación / Confiabilidad". |
| **`/gob/analytics` se promociona dos veces como destino del admin** (`page.tsx:114`, `sistema:64`) con el comentario *"El admin no tiene charts propios todavía"*. El admin sale de su portal para ver su mapa nacional. | 🟢 Menor | Aceptable como puente, pero documentar que Panorama es la superficie integradora pendiente (ya anotado en código). |

---

## 2. Usabilidad

### Colas operativas (lo más crítico para el rol)

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **`/admin/cola` no tiene `LIMIT` ni paginación.** `cola/page.tsx:41-49` selecciona *todas* las filas `pending` y `BulkApprovalQueueList` las renderiza con checkbox + "Seleccionar todo". Es la única cola universal de todas las jurisdicciones — la más propensa a crecer sin techo. (Casos=500, Outbox=200 sí limitan.) | 🔴 Crítico | Paginar con keyset (patrón ya existe en `listOpenCasesForAdminPreview`, separa `count(*)` del fetch). |
| **El banner de breach de Outbox cuenta sólo la página visible.** `outbox/page.tsx:150` deriva `breachCount` de `rows` (≤200). La pantalla que existe para vigilar el SLA A7 **sub-reporta** el SLA cuando hay breaches más allá de la página 1. (El badge del nav en `layout.tsx:26-35` sí hace `count(*)` global — los dos números no coinciden.) | 🔴 Crítico | Usar un `count(*)` agregado para el banner, igual que el badge del nav. |
| **`casos` y `moderacion` no tienen filtros**, con cap de 500. Un admin triando incidentes de mordedura abiertos pagina entre 500 filas mixtas (abiertas + cerradas viejas). La vista org de casos sí soporta filtros kind+status; la de admin los descarta. | 🟡 Moderado | Agregar filtros status/kind/jurisdicción + búsqueda. |
| **Filtro `actor` de Auditoría existe en código pero no tiene input en la UI** (`auditoria/page.tsx:34` lo lee de `searchParams`, pero el `<form>` sólo expone "acción"). Sólo funciona editando la URL con un UUID a mano. Además el filtro de acción exige el código enum **en inglés** mientras la fila muestra la etiqueta traducida → filtrar por lo que se ve no matchea. | 🟡 Moderado | Cablear el input de actor (selector de usuario) y filtrar acciones por un dropdown de etiquetas conocidas. |

### Acciones destructivas — fricción invertida

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **"Resetear credentials" dispara en un clic, sin confirmación ni motivo.** `ResetCredentialsButton.tsx:52-64` rota las credenciales del operador vivo (lo desloguea) sin diálogo de confirmación ni captura de razón — mientras *toda* desactivación exige motivo + evidencia. | 🔴 Crítico | Modal de confirmación + campo motivo, consistente con las desactivaciones. |
| **Aprobación masiva sobre tipos heterogéneos en un clic.** `BulkApprovalQueueList` permite "Seleccionar todo" y aprobar matrículas vet, verificación de orgs y credenciales RUPGA juntas — pese a que el detalle dice que RUPGA requiere verificación CUD out-of-band. | 🟡 Moderado | Confirmar por tipo, o impedir bulk para tipos de alto riesgo. |
| **Cierre `positive_rabies` sin confirmación.** `CloseObservationForm.tsx:42-49` declara rabia positiva desde un `<select>` plano y dispara notificaciones al submit. Una declaración de salud pública de alto impacto con menos fricción que el flujo de fraude de microchip (que sí tiene bloque rojo). | 🟡 Moderado | Confirmación tipada para el resultado positivo. |
| **"Confirmar como spam"** (`ModerationActions.tsx`) y **borrar regla de jurisdicción** (`DeleteRuleButton.tsx`) marcan/eliminan sin captura de motivo, a diferencia del resto de acciones auditadas. Borrar una regla PPP des-flaggea mascotas. | 🟡 Moderado | Capturar motivo + confirmar en ambos. |
| **Guardar lista de razas PPP notifica masivamente a dueños sin gate de impacto.** `PppBreedListForm.tsx:79-82` avisa que al guardar se evalúan mascotas y se notifica a los dueños; el `RuleImpactBanner` es informativo, nada obliga a reconocer el conteo antes de disparar. | 🟡 Moderado | Confirmación que muestre "N mascotas / N dueños afectados". |

### Datos crudos filtrándose a una UI de operador

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **Las páginas de detalle de auditoría leen `payload` y `reason` pero sólo renderizan el código de acción.** `admins/[userId]` y `govts/[userId]` seleccionan `payload`/`revocationReason` y muestran sólo `action` + fecha (`:170-178`, `:209-217`). Se vacía el valor central del audit trail: quién, por qué, con qué evidencia. | 🔴 Crítico | Renderizar motivo, actor y evidencia en el detalle. |
| **`JSON.stringify(payload)` como única vista de aprobaciones vet/org** (`cola/[publicToken]/page.tsx:195-199`); UUIDs crudos como identificador de usuario (`usuarios:92`), de pet sujeto (`moderacion/[id]:173`) y de actor PII (`programa:368`); fórmulas **SQL crudas** y códigos de acción en inglés (`pii_queried`) en una UI en español (`adopciones`, `programa:371`). | 🟡 Moderado | Tarjetas estructuradas para payloads; traducir códigos; ocultar UUIDs o convertirlos en links. |
| **Magic link renderizado en texto plano, copiable, con expiración hardcodeada.** `MagicLinkResultPanel.tsx:56-74` muestra la credencial de aprovisionamiento en el DOM (sobrevive a screenshots/screenshare), con "expira en 24h" como string fijo no derivado del TTL real, y un `catch{}` de clipboard que no da feedback. | 🟡 Moderado | Ocultar tras "revelar", derivar el TTL real, feedback en fallo de copia. |

### PII / límites de superficie

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **`/admin/casos` linkea la mascota a `/mis-mascotas/[token]`** (`casos/page.tsx:77`) — la superficie privada del **dueño**. O 404ea para el admin (dead-end) o expone la vista privada. | 🟡 Moderado | Linkear a una vista de pet de operador, no a la del owner. |
| **`usuarios` promete "Buscar por nombre o DNI"** (`page.tsx:49,59`) pero `admin-search.ts` sólo busca por `display_name` (DNI se removió en Item 25a). Tipear un DNI devuelve "Sin resultados" sin explicación. | 🟡 Moderado | Corregir el copy a "por nombre". |
| **Logging de consultas PII es fire-and-forget** (`void logPiiQueryForAuthority(...)`, `usuarios:38`, `organizaciones:44`). Una promesa sin `await` puede perderse — la garantía de auditoría (Ley 25.326) queda débil. | 🟡 Moderado | `await` el log antes de devolver. |

### Escala y estados

| Hallazgo | Severidad | Recomendación |
|---|---|---|
| **`listUsers({ perPage: 200 })` como techo** en rosters de admins y govts (`admins/page.tsx:28`, `govts:45`). Más allá de 200 los emails quedan en blanco y rompe la heurística `email.startsWith("system:")` que alimenta tanto el filtro del roster como, indirectamente, el guard de "último admin". | 🟡 Moderado | Paginar; reemplazar la heurística `system:` por un flag en DB. |
| **Evidencia subida a Storage al elegir archivo, huérfana al cancelar.** Los 3 flujos con evidencia (desactivar admin/govt, revocar localidad) suben al bucket `revocations` antes del submit y no limpian en cancelar; namespaceadas por actor, no por target. | 🟡 Moderado | Subir en el submit, o limpiar en cancelar/expirar. |
| **Estados de éxito client-only sin `router.refresh()`** (deactivate, assign-locality, revoke). La fila vieja sigue mostrándose "Activo" con botones vivos hasta recargar a mano. | 🟢 Menor | `router.refresh()` tras la mutación. |

---

## 3. Jerarquía visual

- **Qué llama la atención primero:** en el Dashboard, las 3 tarjetas de cuentas — pero la información de mayor valor (North-Star, outliers, oversight PII) vive una pantalla más adentro en `programa`. El orden de importancia está invertido.
- **Tablas no accionables:** los rankings por provincia (`censo`, `poblacion`) y la tabla de outliers (`programa`) invitan a hacer drill-down pero no son clickeables. Un ejecutivo ve "Buenos Aires bajo meta" y no tiene a dónde ir.
- **Desajuste header/dato en el primer render:** todas las páginas con período defaultean a `windows.trailing12m()` cuando no hay params, pero el `PeriodPicker` muestra `defaultPreset="ytd"`. En la primera carga el chip dice "Año en curso" y los datos son de 12 meses móviles. Mismo problema en `adopciones`, `censo`, `poblacion`, `programa`.

---

## 4. Consistencia

| Elemento | Inconsistencia | Recomendación |
|---|---|---|
| Meta SLA ENO | `programa:196` usa el número mágico `95`; `sistema:128` usa `TARGETS.ENO_SLA_PCT`. | Usar la constante en ambos. |
| Cálculo `decisionsDelta` | La misma aproximación "prior 7d ≈ prior23d/23*7" está duplicada literal en `page.tsx`, `sistema.tsx`. | Extraer a un helper en `lib/metrics`. |
| Señalización de severidad | Revocar localidad usa amarillo (`RevokeLocalityRowActions.tsx:226`); desactivar admin/govt usa rojo — las tres son destructivas y con evidencia. | Unificar el color de "destructivo auditado". |
| Acentos / idioma | "Jurisdiccion", "Accion", "Matriculas" sin tilde vs "Matrícula" con tilde; "flagged"/"flagged" en inglés en `moderacion`. | Pasada de es-AR. |
| `% del total` provincial | En `censo`/`poblacion`, si hay provincias suprimidas por k-anon, los shares suman <100% sin nota. | Footnote "X% suprimido por privacidad". |

---

## 5. Accesibilidad — **mayormente fuerte** ✅

- **Contraste / semántica:** tablas con `<caption class="sr-only">`, `scope="col"`, `aria-labelledby` por panel, `figure/figcaption` para el embudo, `aria-label` descriptivos en filas y barras (barras `aria-hidden` con alternativa textual). Bien hecho.
- **Touch targets:** botones de suscripción en `programa` usan `h-11` (44px). Cumple.
- **Carga / error:** `loading.tsx` con skeletons + `aria-busy`, 404 branded en español. Cumple.
- **Pendiente menor:** los UUID en `font-mono` no aportan a lector de pantalla; convenir a links o esconder.

---

## What Works Well (para no romperlo)

- **Disciplina de proyección de primer nivel:** cada KPI lleva `definition / formula / caveat`, y los caveats son **honestos** ("subestima la natalidad real", "INDICADOR DIRECCIONAL, NO EXACTO", exclusión de `credential_scanned` por purga a 90 días). Raro y valioso.
- **k-anonimato visible:** "N períodos ocultos (privacidad)" en las series temporales.
- **Panel "Oversight de PII — ¿quién consultó qué?"** (`programa`): governance real, no decorativo.
- **Diagnóstico de crons honesto:** muestra el error inline y explica por qué *no* hay re-trigger automático (el `CRON_SECRET` no puede reconstruirse en el browser) en vez de fingir un botón.
- **Badge de breach inyectado en el nav** (`layout.tsx`) — feedback ambiental correcto.

---

## Priority Recommendations

1. **Resolver la identidad del portal (IA).** Decidir si el admin opera sus propias colas/usuarios/orgs o no, y alinear copy + nav + KPIs. Hoy el landing afirma lo contrario de lo que hace. *Es lo primero que confunde a un ejecutivo nuevo.*
2. **Arreglar los contadores de las colas de vigilancia.** `/admin/cola` sin límite y el banner de SLA de Outbox contando sólo la página son fallas de correctitud en las pantallas que existen para *no* perder backlog/breaches. Reusar el patrón `count(*)` + keyset que ya está en el repo.
3. **Igualar la fricción al impacto en acciones destructivas.** Confirmación + motivo para reset-credentials, bulk-approve por tipo, cierre positive_rabies, spam y borrado de reglas — al nivel que ya tienen las desactivaciones.
4. **Devolver el cuerpo al audit trail.** Renderizar `payload`/`reason`/actor (ya se traen de la DB) en los detalles de admin/govt; reemplazar `JSON.stringify`, UUIDs crudos y SQL/inglés por tarjetas estructuradas en español.
5. **Promover el Resumen ejecutivo y hacer las tablas accionables.** Llevar `programa` al frente, hacer drill-down clickeable en rankings/outliers, y alinear el `PeriodPicker` (ytd) con el período real (trailing-12m).

---

### Apéndice — "no cierran" (para verificar con datos)
- Badge de breach del nav (`count(*)` global) vs banner de Outbox (page-local): **darán números distintos**.
- Guard de "último admin" cuenta cuentas `system:` → podría permitir desactivar al último admin humano.
- Govt activo con 0 localidades se muestra "Activo" pero no puede entrar a `/gob` (necesita ≥1 `govt_assignments`) — cuenta muerta no marcada.
- "Tasa de retorno" de adopciones: numerador y denominador son conteos de períodos independientes → la KPI puede superar 100% (está disclaimer-eado, pero engaña en el titular).
