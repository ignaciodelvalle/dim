# Pendiente de la tanda de resiliencia — handoff

**Fecha:** 2026-08-09 · **Rango trabajado:** `9fa5d978..ca6f7213` (25 commits) · **Rama:** `integration/all-20260703`

> **ESTADO: CERRADO (2026-08-09, misma jornada).** S3, S5, S7, S8 y S9 están resueltos —
> el detalle de cada uno quedó al pie de su sección. Lo que sigue abierto es el
> **barrido** (P3, copy, especies, `IntakeForm`, flakes) y los **datos**, que no son
> deuda de este documento sino decisiones del PO.
>
> Tres hallazgos NUEVOS salieron de cerrarlo, y ninguno estaba en la lista original:
>
> 1. **S5 tenía diez páginas, no seis.** `CampanasScreen`, `AlcanceScreen` y
>    `MaltratoQueueScreen` tienen el mismo degradado que descarta la barra. Las tres
>    se arreglaron en la misma pasada.
> 2. **El fence certificaba cinco archivos que NUNCA llamaron a un wrapper.** Al
>    exigir una llamada real (S8), `admin/sistema/page.tsx`,
>    `sistema-sections.tsx`, `worklist-io.ts`, `load-audit-data.ts` e
>    `inteligencia-panels.tsx` pasaron a rojo. Dos eran falsos positivos míos
>    (llamada con argumento de tipo genérico); **tres estaban registrados por error**
>    y sólo pasaban por el substring de sus comentarios.
> 3. **El scan de descubrimiento encontró cuatro superficies que nadie había mirado**,
>    entre ellas la credencial pública (`CredentialStreamedSections`) y las dos rutas
>    de export de `/gob`, que corren los mismos agregados que páginas acotadas hace
>    una semana. Las cuatro se acotaron.

Todo lo de acá salió de **revisiones de contexto fresco** (subagente de sólo lectura, el instrumento que reemplazó a cursor-agent por decisión del PO). Ninguno lo encontró el autor. Están verificados leyendo código, con file:line y escenario de falla.

> **Antes de tocar nada:** `pnpm test:verified` — no `pnpm test`. El código de salida de la suite miente en las dos direcciones y `scripts/check-suite-coverage.ts` es el veredicto real.
>
> **…y ese consejo era, en Windows, imposible de seguir (hallado 2026-08-09).** El script era
> `vitest run … --outputFile=.vitest-report.json; tsx scripts/check-suite-coverage.ts …`.
> El `;` es deliberado: el veredicto TIENE que correr aunque vitest salga distinto de cero,
> porque el código de salida de vitest es exactamente lo que ese veredicto desconfía. Pero
> `;` es separador de POSIX, y pnpm ejecuta los scripts con el shell de la plataforma —
> `cmd.exe`. Ahí no separa nada: la cola entera se volvió ARGUMENTOS de vitest, el reporte se
> escribió en un archivo llamado literalmente `.vitest-report.json;` y **el veredicto nunca
> corrió**.
>
> Se descubrió porque una corrida local dio verde con **338 archivos de 1225 reportados**:
> 887 nunca reportaron —murió un worker y se los llevó— y vitest salió 0 igual. Es la falla
> exacta que `check-suite-coverage` existe para atrapar, y en la máquina del PO llevaba
> saltada quién sabe cuánto. CI (bash) no estaba afectado, y por eso no se notó: el gate
> funcionaba en todas partes menos donde más se lee.
>
> Ni `;` ni `&` son portables entre `sh` y `cmd`. Ahora es `scripts/run-verified-suite.ts`,
> que además emite el reporter `default` junto al `json` — antes, el precio del veredicto era
> perder la salida legible, que es un mal canje: desalienta correr el comando seguro.
>
> **Queda abierto:** CI corre `pnpm test:coverage`, no el veredicto. Un worker muerto que se
> lleve 800 archivos pasaría CI mientras los umbrales de cobertura no se desplomen — un
> guardia accidental, no uno diseñado.

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

**RESUELTO** — pero eran **diez** pantallas, no seis. Las cinco listadas más `app/admin/page.tsx`, más tres que este documento no vio (`gob/campanas/CampanasScreen`, `gob/outreach/AlcanceScreen`, `gob/maltrato/MaltratoQueueScreen`) y `gob/perdidas`, que tenía el mismo degradado mientras esta sección lo trataba sólo como un problema de cotas.

Las diez izan `header` + `filtersRow` antes de la carga y los conservan en el degradado, copiando `CensoScreen`. Donde la barra lleva una acción derivada de las filas (el `CsvExportLink` de perdidas y maltrato), `filtersRow` es una función que la recibe por parámetro: el degradado renderiza la barra **sin** el export, en vez de ofrecer la descarga de nada.

**Sin fence.** Nada prueba hoy que una página nueva conserve su barra al degradar — está verificado leyendo, no por un test. Ver la propuesta de fence en el batch de reviews.

---

## S3 — Gemelos y otros fan-outs sin cota

**`app/admin/adopciones/page.tsx:90`** — mismo set de 7 fetchers que `app/gob/adopciones/page.tsx:154`, que sí se acotó. Sin cota y sin registrar en el fence. **Tercer pase consecutivo en que el gemelo es lo que se escapa**, y el propio comentario de `check-db-budget.ts` nombra esa lección.

> Ese tercer pase es la razón por la que S8 dejó de confiar en una lista a mano. Un scan que mira la FORMA del código no tiene gemelos favoritos.

Otros, ninguno cubierto por revisiones previas:
- `app/(public)/perdidas/page.tsx:71` — 4 conteos sitewide en página `force-dynamic` + `no-store`
- `app/org/[orgToken]/page.tsx:246, 356, 364` — tres etapas secuenciales sin envolver
- `app/(app)/mis-mascotas/page.tsx:123, 163`
- `app/org/[orgToken]/checkins/page.tsx:62` — predicado sobre payload JSON en `pet_events`, **sin LIMIT**
- `app/org/[orgToken]/mascotas/page.tsx:117` — sin `LIMIT` SQL, capeado sólo en JS

**RESUELTO.** Los siete acotados, con dos decisiones que vale registrar porque no eran mecánicas:

- **`(public)/perdidas` lleva DOS presupuestos, no uno.** El listado ES la página: cota completa y tarjeta de error honesta. Los tres conteos son decoración sobre todo el universo: cota corta y, si no llegan, **no se renderizan**. Nunca caen a `0` — "0 activas ahora" en esa pantalla se lee como buena noticia y sería mentira. Las dos carreras arrancan juntas, así que el split no cuesta wall-clock.
- **`org/mascotas` separa el `LIMIT` del conteo.** Poner un `LIMIT` a secas hacía que el subtítulo ("N animales bajo custodia activa") y el banner de truncado citaran el tamaño del fetch en vez del de la organización — justo para la organización grande a la que ese banner le habla. El fetch tiene techo (`CUSTODY_FETCH_CAP`), el número sale de su propio `COUNT`.
- **`org/checkins` NO lleva `LIMIT`** en la consulta sobre payload JSON, a propósito: un cap ahí descarta adopciones del listado sin nada en pantalla que lo diga. Se pasó a `selectDistinct` (el dedup que ya hacía en JS ahora lo hace Postgres) y el bound honesto es la cota de tiempo.
- `org/[orgToken]` y `org/checkins` además dejaron de serializar etapas que no dependían entre sí.

---

## S7 — `gob/perdidas` todavía tiene un await suelto

`app/gob/perdidas/page.tsx:287` — `aggregateRowsByDepartment(selectedProvince.code, …)` queda **fuera** del bloque acotado. Emite una consulta real contra `ar_localities` (`lib/analytics/subregion-aggregate.ts:61`). Con provincia elegida —el camino común del operador— la página todavía puede colgar.

**RESUELTO.** Entró al bloque, en la segunda ronda del `Promise.all` (depende de `lostPets`).

---

## S8 — El fence no prueba lo que dice

`scripts/check-db-budget.ts:112` — `referencesBudgetWrapper` es `src.includes(w)`: **substring, en cualquier lado, incluidos comentarios e imports sin usar.**

Dos agujeros, ambos vivos:
1. `app/gob/perdidas/page.tsx` está **verde hoy** con el await de S7 y el pie de S1 sin cota. El trinquete certifica exactamente la propiedad que no sostiene.
2. `listBudgetTargets()` (:118) hace `DASHBOARD_PAGES.filter(p => globSync(p).length > 0)` — una ruta renombrada o borrada **se cae de la lista en silencio**, no falla. El único guardia es `targets.length === 0`. El historial del archivo documenta **cuatro** reubicaciones, así que renombrar es el evento esperado y la respuesta del fence es dejar de enforzar. Debería fallar duro ante una ruta faltante.

Además: la lista es hardcodeada, así que el fence **nunca puede atrapar una página pesada nueva**. S2 y S3 son exactamente lo que cuesta ese punto ciego.

**RESUELTO — y fue el hallazgo más caro de la jornada.**

1. **`referencesBudgetWrapper` exige una LLAMADA.** El fuente pasa primero por `stripNonCode` (una máquina de estados que saca comentarios y el contenido de los literales de texto, conservando los `${…}`) y después por `\b<wrapper>\w*\s*(?:<…>)?\s*\(`. El paso por `${…}` y el permitir argumentos de tipo genérico no son adornos: sin ellos, `withDbBudget<WorklistItem[] | null>(…)` —como lo escriben dos módulos registrados— daba rojo falso.

   **Al encenderlo, cinco sitios registrados se pusieron en rojo.** Dos eran mis falsos positivos (los genéricos, ya corregidos). **Tres estaban registrados por error y sólo pasaban por el substring de sus propios comentarios**: `admin/auditoria/_lib/load-audit-data.ts` e `inteligencia/inteligencia-panels.tsx` **delegan** su presupuesto a un llamador que sí está registrado, y `admin/sistema/page.tsx` llama a `budgetedOrDegraded` (ahora en `BUDGET_WRAPPERS`). Registrar un archivo que delega era el substring en su forma más pura: el fence reportaba enforcement sobre un archivo que estructuralmente no puede cumplir la regla.

2. **Una ruta registrada que desaparece es falla dura.** `missingRegisteredPages()`, con `existsSync`. Renombrar obliga a MOVER la entrada, no a perder el enforcement.

3. **Scan de descubrimiento** (`discoverFanOuts`): cualquier server component bajo `app/**` o `components/**` con un `Promise.all([…])` de 4+ elementos y sin llamada a un wrapper es ofensor, con trinquete contra `scripts/db-budget-baseline.json`. **El baseline quedó en cero: nada necesitó exención.** El trinquete también falla si una entrada del baseline dejó de ofender — un baseline con entradas muertas es un trinquete que dejó de agarrar.

   Encontró cuatro superficies en su primera corrida, todas acotadas en la misma pasada: la **credencial pública** (`CredentialStreamedSections`, que tenía try/catch — el eje que lanza — y nada para el eje que **cuelga**), el **perfil de mascota del dueño** (7 concurrentes), y las **dos rutas de export de `/gob`**, que corren los mismos agregados que páginas acotadas hace una semana y se llegan desde el botón de esas mismas páginas.

**Lo que sigue sin poder detectar un linter de regex:** un único `await` sin cota dentro de un componente hijo compartido. Es la forma exacta del `DashboardFreshnessFooter`. El scan cubre la mitad de fan-out ancho; el resto es trabajo de review.

---

## S9 — Mi afirmación sobre `gob/perdidas` era parcialmente falsa

El comentario en `app/gob/perdidas/page.tsx:175-179` (y su copia en `check-db-budget.ts`) dice que "metrics y caseCodesByPet dependen de lostPets". Leyendo `:210-214`: **la dependencia de `metrics` es CONDICIONAL** — sólo se le pasa `lostPets` cuando no hay ningún filtro de display activo. Y `reunification` (`:226`) **no depende nunca**: su contexto se arma sólo con `actor` / `filteredJurisdictions` / `period`.

**Regresión de comportamiento real:** cuatro viajes que antes eran cada uno ilimitado ahora deben caber **colectivamente** en 10s, con uno o dos serializados innecesariamente. Con una base apenas lenta (4s por consulta) la página vieja rendereaba en 16s; la nueva expira a los 10 y cae en el degradado de S5, que es el menos recuperable. Izar `reunification` (y `metrics` en la rama filtrada) a un `Promise.all` dentro del IIFE no cuesta nada y recupera el margen.

**RESUELTO.** La cadena quedó en **dos rondas**, su profundidad real de dependencia: ronda 1 `lostPets` ∥ `reunification` ∥ `metrics` (sólo en la rama con filtros, donde no depende de `lostPets`); ronda 2 `metrics` (rama sin filtros) ∥ `caseCodesByPet` ∥ `subregionData`. El comentario que afirmaba la dependencia falsa se reescribió enumerando qué depende de qué y por qué.

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
