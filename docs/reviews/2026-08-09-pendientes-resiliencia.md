# Pendiente de la tanda de resiliencia — handoff

**Fecha:** 2026-08-09 · **Rango trabajado:** `9fa5d978..ca6f7213` (25 commits) · **Rama:** `integration/all-20260703`

Todo lo de acá salió de **revisiones de contexto fresco** (subagente de sólo lectura, el instrumento que reemplazó a cursor-agent por decisión del PO). Ninguno lo encontró el autor. Están verificados leyendo código, con file:line y escenario de falla.

> **Antes de tocar nada:** `pnpm test:verified` — no `pnpm test`. El código de salida de la suite miente en las dos direcciones y `scripts/check-suite-coverage.ts` es el veredicto real.

---

## S5 — El degradado descarta la barra de filtros (5 páginas) · **el más importante**

| Archivo | Línea del fallback |
|---|---|
| `app/gob/adopciones/page.tsx` | ~167 |
| `app/gob/mortalidad/page.tsx` | ~283 |
| `app/gob/sistema/page.tsx` | ~464 |
| `app/gob/vigilancia/brotes/page.tsx` | ~503 |
| `app/gob/decomisos/page.tsx` | ~237 |

Los cinco hacen `if (!load.ok) return <AnalyticsLoadFallback…>`, descartando `ScreenHeader`, `ViewScopeCaption`, `OpFilterBar` y —en adopciones— el href de "Exportar CSV". **Ninguno de esos depende de la consulta que falló**: `OpFilterBar` se arma con `allowedProvinces` / `localities`, que vienen de `resolveJurisdictionScope`, un `await` separado ya resuelto antes.

**Escenario, determinista:** un admin entra a `/gob/adopciones` sin provincia elegida → ocho agregados nacionales → timeout a los 10s → pierde el selector de provincia. `analyticsRetryHref` reemite **la consulta nacional idéntica**. Cada reintento vuelve a expirar. La página es irrecuperable sin editar la URL a mano — y la barra de filtros era justamente el control que habría abaratado la consulta.

**El patrón correcto ya existe en el repo:** `app/gob/censo/CensoScreen.tsx:213-223` iza `header` y `filtersRow` a variables **antes** de la carga y los conserva en el degradado. Copiar esa forma.

`app/admin/page.tsx:57` es el caso más leve (sus cinco agregados sí alimentan el cuerpo, y `app/admin/layout.tsx` mantiene el rail vivo), pero sigue tirando el `ScreenHeader` en la primera pantalla que ve un admin al iniciar sesión.

---

## S3 — Gemelos y otros fan-outs sin cota

**`app/admin/adopciones/page.tsx:90`** — mismo set de 7 fetchers que `app/gob/adopciones/page.tsx:154`, que sí se acotó. Sin cota y sin registrar en el fence. **Tercer pase consecutivo en que el gemelo es lo que se escapa**, y el propio comentario de `check-db-budget.ts` nombra esa lección.

Otros, ninguno cubierto por revisiones previas:
- `app/(public)/perdidas/page.tsx:71` — 4 conteos sitewide en página `force-dynamic` + `no-store`
- `app/org/[orgToken]/page.tsx:246, 356, 364` — tres etapas secuenciales sin envolver
- `app/(app)/mis-mascotas/page.tsx:123, 163`
- `app/org/[orgToken]/checkins/page.tsx:62` — predicado sobre payload JSON en `pet_events`, **sin LIMIT**
- `app/org/[orgToken]/mascotas/page.tsx:117` — sin `LIMIT` SQL, capeado sólo en JS

---

## S7 — `gob/perdidas` todavía tiene un await suelto

`app/gob/perdidas/page.tsx:287` — `aggregateRowsByDepartment(selectedProvince.code, …)` queda **fuera** del bloque acotado. Emite una consulta real contra `ar_localities` (`lib/analytics/subregion-aggregate.ts:61`). Con provincia elegida —el camino común del operador— la página todavía puede colgar.

---

## S8 — El fence no prueba lo que dice

`scripts/check-db-budget.ts:112` — `referencesBudgetWrapper` es `src.includes(w)`: **substring, en cualquier lado, incluidos comentarios e imports sin usar.**

Dos agujeros, ambos vivos:
1. `app/gob/perdidas/page.tsx` está **verde hoy** con el await de S7 y el pie de S1 sin cota. El trinquete certifica exactamente la propiedad que no sostiene.
2. `listBudgetTargets()` (:118) hace `DASHBOARD_PAGES.filter(p => globSync(p).length > 0)` — una ruta renombrada o borrada **se cae de la lista en silencio**, no falla. El único guardia es `targets.length === 0`. El historial del archivo documenta **cuatro** reubicaciones, así que renombrar es el evento esperado y la respuesta del fence es dejar de enforzar. Debería fallar duro ante una ruta faltante.

Además: la lista es hardcodeada, así que el fence **nunca puede atrapar una página pesada nueva**. S2 y S3 son exactamente lo que cuesta ese punto ciego.

---

## S9 — Mi afirmación sobre `gob/perdidas` era parcialmente falsa

El comentario en `app/gob/perdidas/page.tsx:175-179` (y su copia en `check-db-budget.ts`) dice que "metrics y caseCodesByPet dependen de lostPets". Leyendo `:210-214`: **la dependencia de `metrics` es CONDICIONAL** — sólo se le pasa `lostPets` cuando no hay ningún filtro de display activo. Y `reunification` (`:226`) **no depende nunca**: su contexto se arma sólo con `actor` / `filteredJurisdictions` / `period`.

**Regresión de comportamiento real:** cuatro viajes que antes eran cada uno ilimitado ahora deben caber **colectivamente** en 10s, con uno o dos serializados innecesariamente. Con una base apenas lenta (4s por consulta) la página vieja rendereaba en 16s; la nueva expira a los 10 y cae en el degradado de S5, que es el menos recuperable. Izar `reunification` (y `metrics` en la rama filtrada) a un `Promise.all` dentro del IIFE no cuesta nada y recupera el margen.

---

## Barrido que quedó afuera

- **P3** — seis formatos de fecha; `Sábado, 8 De Agosto` es `capitalize` sobre texto correcto (capitaliza preposiciones); el `·` pierde el espacio en tres componentes. **La hora NO se toca**: 24h verificado en los cuatro portales.
- **Lote de copy** — 9 items (S1-F09, S1-F10, S1-F13, S2-F07, S2-F09, S5-F03, S6-F03, S6-F04, S8-F03). S8-F03 es defecto real, no copy: el banner "Tu denuncia fue registrada" revive con sólo tener `?nueva=1` en la URL — misma clase que el `service_kind` ya arreglado.
- **Baseline de especies** — 11 archivos en `scripts/species-dictionary-baseline.json`. Nueve son mecánicos; **dos necesitan decisión del PO**: `"Perro/a"` (lenguaje inclusivo, `MinimalNewPetForm`) y `"Cobayo / Cuy"`.
- **`IntakeForm` → `OpField`** — 16 controles con `inputCls` propio. `db16c8a6` creó `OpField` para matar esas recetas y migró 92; ésta quedó afuera. Ya tiene el piso de 44px, pero sigue siendo receta a mano.
- **Flake `PanoramaConsole`** (y `org-invitations`) — falla en suite completa, 103/103 aislado. Mismo patrón que el flake de localities arreglado en `96b62207` (ventana de minuto de calendario).

---

## RESUELTO — `programa` y `padron`

**Cargan desde ambos portales** (verificado por el PO, 2026-08-09, sobre `ca6f7213`).

La explicación que mejor encaja con la evidencia es **S1: el `DashboardFreshnessFooter` sin cota**. Las cuatro pantallas de esos hubs (`AnalyticsScreen`, `ProgramaResumenScreen`, `CensoScreen`, `PoblacionScreen`) ya estaban acotadas a 10s vía `loadWithTimeout` y volvían bien; el pie —un `max()` sobre todo el spine, sin deadline y sin Suspense— colgaba el stream RSC después.

Eso explica el detalle que no cerraba durante el diagnóstico: **por qué estas páginas nunca aparecieron en los runtime errors mientras `/gob/denuncias` sí.** Denuncias lanzaba `57P01` (excepción → se loguea); programa y padron colgaban (no se loguea nada). Un hueco de observabilidad, no una diferencia de gravedad.

**Salvedad:** la ventana de actualización de Postgres en staging (17.6.1.141) también pasó en el medio, así que las dos causas cambiaron a la vez y no se pueden separar a posteriori. Pero el pie era una causa **estructural** — habría colgado igual con la base sana bajo suficiente carga — y ya no existe.

**Lo que esto deja probado:** el arreglo efectivo fue el hallazgo de la tercera revisión de contexto fresco, el mismo que invalidó el commit anterior del autor. Se habían declarado ocho páginas acotadas; seis seguían colgando por un componente compartido que ninguna fence miraba, porque `check-db-budget` lee el archivo de la página y el `await` vivía en otro lado. Ese punto ciego es S8 y sigue abierto.

---

## Datos

Ver `docs/plans/2026-08-09-datos-para-las-vistas-nuevas.md`. Resumen: **no** agregar más mascotas (32.430 alcanzan). Los tres huecos reales son `govt_business_rules` en **0** filas, **cero** turnos futuros, y **41** perdidas sobre 32.430.
