# Run nocturno 2026-07-19 — reporte de cierre

> Ejecución autónoma del backlog nocturno. Todo lo de abajo está **commiteado,
> verificado (`pnpm verify` verde + fresh review adversarial SHIP-READY) y
> pusheado** a `integration/all-20260703`. El cutover a `main` quedó SIN apretar —
> es tuyo.

## 1. Resumen

Se ejecutaron **9 tandas** en el rango `7d84def9..aafe34e2`, cada una implementada por un writer con contexto fresco y verificada (typecheck + biome + tests targeted) antes de commitear. Cierre: `pnpm verify` completo verde (typecheck + toda la cadena de lints + build + tests) y un fresh review adversarial de los 8 commits del run → **cero CRITICAL/HIGH**, los cambios riesgosos (PF3 acceso, foster ownership) confirmados sanos.

## 2. HECHO (commiteado + pusheado)

| Commit | Tanda | Qué |
|---|---|---|
| `67512383` | 🔥 Bug prod | **500 en /notificaciones** (client-fn llamada desde server) — 19 hits en staging. Función pura extraída fuera del boundary client. |
| `488ce2fd` | Honestidad H1/H2 | Mortalidad + reunificación: KPIs 0% ya no pintan rojo/verde falso sin datos → "—" neutral. |
| `004ed43f` | Honestidad H3/H5/H6/H7/V10 | Export a fiscalía como link visible (no window.open que el popup-blocker mata); revoke refresca el SSR; alarma de síntomas acotada en tiempo+rabia; PDF de libreta en es-AR + con correcciones aplicadas. |
| `6be910f4` | Filtros/standard | perdidas usa `resolveAnalyticsPeriod` (los chips 12m/ytd ya no son no-op); empty-states → `LnEmptyState` (inteligencia/programa/maltrato); presets single-sourced. |
| `e0e9c3d2` | Vuelta de tuerca | adopción desbloquea rechazados; devolución sin loop de propuestas muertas; tarjeta rábica renombrada honesta + jump-links repointeados; CTAs sin `<button>` en `<a>`; credencial degradada con `<h1>`. |
| `c5994e62` | A11y | `inert` en 10 wizards / 30 steps inactivos (WCAG 4.1.2). |
| `2c34485c` | Foster + V8 | **CustodyKindToggle restaurado en el alta** (estaba vivo pero solo en modo edición → nunca aparecía; toda mascota se registraba como owner) + select opcional de método de adquisición. |
| `aafe34e2` | PF3 + V9 | Libreta a server-`<Suspense>` reusando el acceso ya resuelto (elimina el re-auth por perfil, sin filtrar acceso); combobox de orgs en reasignar decomiso + verify en disputas. |

Más los **6 quick-wins de performance** ya pusheados antes del run (crons N+1, mortality headline, perfil Promise.all, rabies denom compartido, census cache en memoria, perdidas count-only) + LOW-1.

## 3. NO HECHO — y por qué (para destrabar)

| Ítem | Por qué NO | Qué necesita |
|---|---|---|
| **Viaje transfronterizo** (feature fachada) | **Decisión de PO** — vos elegiste "dejarlo por ahora". | Decidir: construir el form "Registrar viaje" (tren dedicado) o esconder `/viaje` tras flag. |
| **Filtros "sin reload" total** (nivel Panorama) | **No alcanzable barato.** El reload es un fix intencional del bug Next 15.5.18 (router-drop); los 17 dashboards son server-components sin API route. Igualarlo = rewrite per-page (~17×) o subir Next. El "doble reload" de la personalizada YA estaba arreglado. | Decisión de PO: pilotear el rewrite de 1-2 dashboards, o apostar a un upgrade de Next.js, o aceptar el hard-nav. |
| **PF1 — consolidar el fan-out de queries** (`~40-48` count() FILTER / pool de 2) | **Delicado**: cambia cómo se agregan métricas; un error mueve NÚMEROS del dashboard. Merece un tren dedicado con verificación de paridad número-por-número, no un fix apurado de noche. Los quick-wins ya bajaron ~13 queries. | Tren dedicado con tests de paridad. |
| **PF2 — globals.css skins a CSS Modules** | **Bajo impacto / riesgo alto**: el propio perf-audit corrigió la magnitud a ~10,5 KB gz (no el titular que parecía), y mover skins CSS sin verificación visual runtime arriesga romper estilos en muchas pantallas. Malo el trade de noche. | Tren dedicado con verificación visual. |
| **Cutover a `main` (PR #760)** | **Es tuyo** — mergear a main puede disparar deploy de producción. | Confirmar si dispara prod + apretar el merge (todo listo, MERGEABLE). |

## 4. EN OBSERVACIÓN (LOW, no bloquean — tu ojo)

- **Reasignación de decomiso lista orgs a nivel NACIONAL**, no scopeada por jurisdicción (`decomisos/page.tsx`). No es regresión (antes era UUID libre + el server re-valida), pero si la política es reasignar solo dentro de la jurisdicción, ese guard va en el use-case. **Decisión de política tuya.**
- **AddPartyForm** permite submit de un target verificado-pero-inactivo (el server es el boundary real, sin impacto de seguridad; inconsistencia de UX menor).
- **CTAs de mis-mascotas** copian las clases de `LnButton` inline (fix a11y correcto, pero las clases pueden divergir si el estilo del botón cambia — mantenibilidad).
- **Flags de writers**: `MpfExportGate.tsx` tiene el mismo bug de `window.open` que arreglamos en `MpfExportButton` (follow-up); `item14-owner-hub.test.ts` tiene un `formatEventLabel` en inglés duplicado stale (test-as-doc desactualizado, no roto).

## 5. Delta de reviews (re-corridas)

Re-corriendo el deep review de promesas de AGENTS.md **fresh sobre el código nuevo** para medir cuánto movimos la aguja. Resultado + comparación contra la corrida de anoche → se agrega abajo cuando termine.

*(pendiente — completar con el delta)*
