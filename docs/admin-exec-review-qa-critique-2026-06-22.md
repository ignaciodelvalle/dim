# Design Critique — Portal Admin · QA de la remediación ejecutiva (branch integrado)

> Pasada de QA **en vivo** sobre `qa/admin-exec-review-integrated` corriendo en `localhost:3000`,
> logueado como cuenta institucional **admin** (SUPERADMIN · UNIVERSAL), + review estático del código committeado (HEAD `465e4b97`).
> Complementa el code-review por-PR: acá el foco es el **resultado integrado en runtime**, que es donde aparecen cosas que cada PR aislado no muestra.
> Fecha: 2026-06-22 · Método: Claude in Chrome (navegación + árbol de accesibilidad + consola) sobre el server local del usuario.

---

## Overall Impression

La remediación de los 40 hallazgos está, a nivel de código, **bien hecha**: helpers puros y testeados, allowlist de privacidad, keyset con cursor endurecido, guard de último-admin reescrito con un flag de DB. Pero la pasada en vivo destapó una **incoherencia de integración seria** (un middleware preexistente que nadie tocó vuelve inalcanzables dos de las pantallas remediadas) y un **problema de performance** en las dos colas de triage más importantes del rol. Ninguno de los dos se ve revisando PR por PR: sólo aparecen con los 10 mergeados y la app corriendo.

Resumen: el código de la remediación es sólido; **el integrado todavía no es demo-ready** por 1 bug de routing y la latencia de `auditoría`/`casos`.

---

## 🔴 Bugs (roto en runtime)

| Hallazgo | Evidencia | Severidad | Recomendación |
|---|---|---|---|
| **`/admin/cola`, `/admin/usuarios` y `/admin/organizaciones` redirigen 308 → `/gob/*`.** El `middleware.ts` (líneas 40-55) hace redirects permanentes "legacy /admin work-surface paths → /gob". Es de un commit viejo (`af4f6fd1`, Slice 4 rebrand) y **ningún PR de la remediación lo tocó.** Verificado en vivo: navegar a `/admin/cola` termina en `/gob/cola` ("No hay solicitudes pendientes **en tu scope**"). | Navegación en vivo + `middleware.ts:40` | 🔴 Crítico | Decidir la verdad y alinear **routing + páginas + copy + nav + KPI** (ver abajo). |
| **PR-1 / C1 queda como código muerto.** La `/admin/cola` con keyset pagination + `count(*)` separado (`app/admin/cola/page.tsx`, `lib/admin-approval-queue.ts`) **nunca se renderiza** — el middleware intercepta antes. El fix de la cola universal no tiene efecto en runtime. | mismo redirect | 🔴 Crítico | Si el admin opera su cola: borrar el redirect de `/admin/cola`. Si no: borrar la página y mover el keyset a `/gob/cola`. |
| **PR-5 / C18 tampoco se ve.** El copy "Buscar por nombre" de `/admin/usuarios` redirige a `/gob/usuarios`, así que la corrección de placeholder no se muestra desde el portal admin. | mismo redirect | 🟡 Moderado | Igual que arriba: resolver el destino de `usuarios`. |
| **C25 sigue sin cerrarse de verdad.** El landing reescribió el copy a *"la cola… son tuyas y abarcan todas las jurisdicciones"*, y tanto el ítem **"Cola"** del riel como el KPI **"Cola pendiente"** del dashboard linkean a `/admin/cola` → que rebota a la superficie **acotada** de Gobierno. El copy dice una cosa y el routing hace la otra: exactamente la contradicción que C25 debía eliminar. | landing `ref` KPI/nav `href="/admin/cola"` + redirect | 🔴 Crítico | Parte del mismo fix. El nav/KPI del admin no deberían mandar a `/gob`. |

**Cómo cerrar el bug 🔴 (una decisión, dos capas):**

- **Opción A — el admin opera sus colas universales:** eliminar los 3 redirects de `middleware.ts`. Quedan vivas las páginas remediadas (`/admin/cola` con keyset, `/admin/usuarios` con copy corregido). Es lo coherente con el copy nuevo del landing.
- **Opción B — las colas viven en `/gob`:** borrar las páginas muertas `app/admin/cola/**` y `app/admin/usuarios/**`, mover el keyset de PR-1 a `/gob/cola`, y reapuntar copy + nav + KPI del admin a `/gob`.

Hoy conviven **ambas mitades** y se contradicen. La remediación shippeó las páginas pero no removió (ni reconcilió) el middreware.

---

## 🟡 Mejoras (performance + coherencia)

| Hallazgo | Evidencia | Severidad | Recomendación |
|---|---|---|---|
| **`/admin/auditoría` no pinta en ~40s** (server recién reiniciado, sin errores en consola). El default sin filtro hace `ORDER BY performed_at DESC, id DESC LIMIT 201` sobre `audit_log`, y **no hay índice con `performed_at` como columna líder**: los índices existentes son `(actor_user_id, performed_at)` y `(action, performed_at)`. Postgres no puede usarlos para el orden sin filtro → full sort de la tabla seedeada. | vivo: 4 lecturas en "Cargando…"; `db/schema.ts:2074,2080` | 🟡 Moderado | Agregar índice `(performed_at DESC, id DESC)` en `audit_log`; o bajar el page-size default; o no traer la vista sin filtro de entrada. Filtrando por actor/acción **sí** usa los índices compuestos. |
| **`/admin/casos` tampoco asienta (>25s).** Default sin filtro trae `ADMIN_CASOS_PAGE_LIMIT = 500` (+1) filas con joins de detalle. A escala de seed es caro de primer pintado. | vivo; `app/admin/casos/page.tsx:14,53` | 🟡 Moderado | Default a `status=open` (lo que el triador realmente quiere), o bajar el cap, o paginar con keyset como la cola. Los filtros de PR-9 ya existen — usarlos como default. |
| **El banner de SLA y el badge del nav: confirmar paridad numérica.** En vivo el banner mostró **"12 items en incumplimiento"** y la tabla traía exactamente 12 filas INCUMPLIMIENTO en las últimas 25 — con este dataset banner page-local y global coinciden, así que no distingue. El código sí garantiza fuente única (`countOutboxBreaches()` en `layout.tsx:25` y `outbox/page.tsx:155`). | vivo + código | 🟢 Menor | Para una prueba que distinga, seedear breaches en página 2 y verificar que banner == badge. La lógica ya es correcta. |

> **Nota honesta sobre la latencia:** estoy midiendo en **dev mode** (compile en frío + queries sin optimizar), que infla los tiempos. Un `next build` sería más rápido. Pero el *contraste* es la señal: `outbox` (LIMIT 25, índice `outbox_sla_due_idx`) pinta en ~12s y `auditoría`/`casos` no asientan — eso apunta a costo de query, no sólo a compile. El índice faltante en `audit_log` es real y verificable sin correr nada.

---

## 🟢 Polish (detalles)

| Elemento | Detalle | Recomendación |
|---|---|---|
| Columna "EVENTO ORIGEN" en `/admin/outbox` | Ahora **linkea** a `/p/{token}` (✓ C14 resuelto), pero el texto visible sigue siendo un fragmento de **UUID crudo** ("c24b5a51…"). | Mostrar el `publicToken` legible (DIM-/PANO-/SURVTEST-…) como label, no el UUID del evento. |
| Headers de tabla en mayúsculas | "JURISDICCION", "ACCION", "EVENTO" sin tilde en el outbox (y probablemente otras tablas). | Pasada es-AR: en mayúsculas igual se acentúa (JURISDICCIÓN, ACCIÓN). Cierra el C37. |
| Skeleton "Cargando…" persistente | En `auditoría`/`casos` el fallback de Suspense se queda largo rato sin señal de progreso. | Si las queries van a tardar, un skeleton con filas fantasma o un hint de "consultando histórico…" comunica mejor que un único "Cargando…". (Secundario al fix de perf.) |

---

## Verificado en código (review estático) — OK, pendiente de confirmar en vivo

El server en dev no me dejó renderizar varias pantallas en tiempo razonable, pero el código committeado de estos fixes lo revisé y está correcto. Quedan **pendientes de confirmación visual**:

- **C2** — `countOutboxBreaches()` como fuente única del banner y el badge (allowlist de predicado idéntico). *Confirmado en vivo el banner = 12; falta cruzar con el badge del nav.*
- **C11/C12** — `lib/audit-entry-view.ts` arma una vista **allowlist** (sólo `label/reason/evidenceCount/resetMethod`); `magic_link` no puede filtrarse estructuralmente. Target-link vía `lib/audit-target-link.ts`.
- **C30** — dropdowns de actor + acción en `auditoría` construidos desde la página actual (no un `distinct` global caro). Bien pensado.
- **C20 (PR-6)** — `MagicLinkResultPanel` arranca enmascarado (`revealed=false`), copia desde **estado** (funciona oculto), TTL derivado de `MAGIC_LINK_TTL_SECONDS`, feedback de error de copia, `select-none`.
- **C21/C22 (PR-7)** — guard de último-admin cuenta sólo `is_system = false`, lockea el set completo con `FOR UPDATE`, dispara sólo para targets humanos. Migración `0109` aditiva/idempotente. El stopgap `display_name LIKE 'system:%'` de PR-1 quedó **totalmente removido** (grep limpio).
- **C36** — `registryByProvince` (`lib/metrics/census.ts`) **no** aplica k-anon (la coropleta provincial no suprime; k-anon k=5 es a nivel localidad vía `byLocality`); el footnote dice la causa real (mascotas **sin provincia asignada**) y `registryByProvince` filtra `province === null`, así que la cuenta de "unassigned" es honesta.
- **C23** — rosters de `admins` particionan por `profiles.is_system` (no por heurística de nombre).
- **C24** — badge de govt "sin localidades" en `lib/govt-roster.ts`.
- **C40** — caveat de tasa de retorno >100% en `adopciones`.
- **C4–C8** — confirmaciones tipadas / captura de motivo en reset-credentials, bulk-approve, positive-rabies, spam, delete-rule (revisado en componentes; no ejecutado para no disparar acciones destructivas).

> **Recomendación:** una vez resuelto el bug de routing y la perf, vale una segunda pasada en vivo (o un `next build && next start`) para confirmar visualmente C30/C23/C24/C40 y los modales destructivos, que esta vez no pude renderizar.

---

## What Works Well (no romperlo)

- **`/admin` (landing)** quedó coherente: abre con la tira KPI (no con las 3 tarjetas de cuentas), el copy contradictorio se reescribió, y el nav separa Analítica (panorama/programa/censo/adopciones/poblacion) de lo operativo (C26/C27 ✓ en vivo).
- **`/admin/outbox`** es el mejor ejemplo del estándar de la remediación: banner de breach con cue, filtros estado/destino/breach/provincia, y la columna de evento ahora **clickeable a `/p/`**. Pinta rápido. Es el patrón a replicar en las otras colas.
- **Disciplina de privacidad** intacta: el allowlist de auditoría y el enmascarado del magic link son defensivos de verdad, no cosméticos.

---

## Priority Recommendations

1. **Resolver el redirect de `middleware.ts` (bug 🔴).** Es lo que vuelve inalcanzable a PR-1 y reabre C25. Una decisión (Opción A o B) que toca routing + páginas + copy + nav + KPI. Sin esto, "C1/C18/C25 cerrados" no es cierto en runtime.
2. **Indexar/acotar `auditoría` y `casos` (perf 🟡).** Índice `(performed_at DESC, id DESC)` en `audit_log` y default a `status=open` en `casos`. Son las dos colas de triage del rol — si tardan 30-40s en pintar, el admin no las usa.
3. **Polish de labels (🟢).** UUID→publicToken legible en outbox, y la pasada de acentos en headers en mayúsculas. Barato y cierra C14/C37 del todo.

---

### Apéndice — método y límites

- Verificado en vivo (render real): `/admin` (landing), `/admin/cola` (→ redirect), `/gob/cola`, `/admin/outbox`.
- Slow/no-render en dev: `/admin/auditoría`, `/admin/casos` (root-cause en código).
- No renderizado (pendiente): `censo`, `poblacion`, `programa`, `adopciones`, `moderación`, `admins`, `govts`, modales destructivos — cubiertos por review estático, no por render.
- Aparte: el working tree del repo estaba **corrupto** (51 archivos truncados a mitad) y se restauró desde HEAD antes de esta pasada. No es parte de la remediación; era estado en disco roto.
