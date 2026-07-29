# Plan de ejecución nocturno — 2026-07-29

> **Este archivo es el estado, no mi contexto.** En una corrida larga me compacto;
> todo lo que haga falta para retomar en frío tiene que estar acá. Cada unidad se
> cierra sola: `pnpm verify` + suite + commit propio. Una unidad que falla NO
> bloquea las siguientes — se marca abajo y se sigue.

## ACUERDO DE TRABAJO (PO, 2026-07-29 — tras una noche de rendimiento pobre)

La corrida de anoche cerró 2 de 10 unidades. El diagnóstico NO fue el entorno:

1. **Puse adelante lo más caro.** Tres de las primeras cuatro unidades dependían
   de e2e o de navegar la app viva — el trabajo 5-10x más lento que hay acá.
2. **Teoricé antes de leer la evidencia que la app ya había escrito. Tres veces.**
   Playwright deja una captura en CADA fallo; en crisis-seams y en C.4 la
   respuesta estaba ahí desde el primer intento y llegué después de descartar
   dos hipótesis en cada caso.
3. **Diagnostiqué una unidad entera contra un servidor con `.next` clobbereado**
   y tuve que retractar la conclusión. Trabajo neto negativo.
4. **Hice fallar el gate por cosas de 3 segundos** (orden de imports, variable sin
   usar). Cada `verify` fallado son 5-8 minutos.

**Dos decisiones del PO que cambian el método:**

- **Gate en BATCH de 3-4 unidades.** Implementar 3-4, correr UN gate completo,
  commitear cada unidad por separado igual. Si algo rompe se bisecta entre 3-4
  commits — barato, porque cada unidad sigue siendo su propio commit.
- **Todo lo barato primero.** El bloque que no necesita servidor ni navegador
  (H.1, H.2, D.5, #38, D.1) va de corrido. Todo lo de e2e/UI viva se junta en
  una pasada aparte, reconstruyendo el servidor UNA sola vez al principio.

**Reglas mecánicas que salen de esto:**
- `pnpm biome check --write` SIEMPRE antes de `verify`. 3 segundos contra 8 minutos.
- Ante un fallo de e2e: **abrir la captura ANTES de formular ninguna hipótesis.**
- Nunca dejar un spec rojo commiteado. Si no se cierra, se borra y se documenta.

## La restricción que manda: el costo del gate

Medido en esta sesión, no estimado:

| Paso | Duración |
|---|---|
| `pnpm verify` (typecheck + 45 lints + build) | 5–8 min |
| Suite completo (12.4k tests) | 15–18 min |
| **Ciclo mínimo para dejar una unidad commiteada** | **~25 min** |

En 8 horas eso da **~19 ciclos teóricos**. Con implementación y lectura de código
en el medio, el ritmo real de esta sesión fue **~40 min por unidad landeada**
(8 commits). Presupuesto honesto: **10–12 unidades**, no 18.

**Regla de eficiencia**: correr el suite completo UNA vez por unidad, al final.
Durante la implementación, sólo los archivos afectados. El gate completo es lo
caro; los tests dirigidos cuestan segundos.

## Orden, y por qué

### Bloque 0 — arreglar el instrumento (primero, sí o sí)

**SC-5 — `rederivePetCache` no deriva el tatuaje del spine.**
Hace toda la sesión que el suite cierra en "1 rojo" y ese rojo es siempre el
mismo. Un suite permanentemente rojo **no distingue una rotura nueva de la
vieja** — cada corrida me obliga a leer el nombre del test para saber si rompí
algo. Es un instrumento roto, y se arregla antes de medir con él.
Falla sólo local (en CI pasa), lo que apunta a deriva del seed local más que a
un bug de la función. Empezar por reproducir con una mascota concreta.

### Bloque 1 — lo barato y bien especificado (alto rendimiento por hora)

| # | Unidad | Por qué es autónoma |
|---|---|---|
| 1 | **#32 fuga de `create-pet`** | Un test deja mascotas sin foto en `owner@dim.test` y rompe `crisis-owner-lost-flow`. Higiene de fixture, sin decisión. |
| 2 | **#31 crisis-seams (b)** | La firma de vacuna en Atender no encuentra su botón. Selector, acotado. |
| 3 | **C.3 — frame nacional → `AR_BBOX`** | El plan nombra la solución ya aplicada en `SituationalMap.tsx:1036-1044`. Es replicarla en el path de presets. Además destraba el pin de composición que dejé en `presets.test.ts` (hoy `bbox: 0`). |
| 4 | **C.4 — affordance de drill** | **Probablemente ya esté**: el revisor de panorama confirmó `<select>` reales y etiquetados, y se retractó de su primer hallazgo. Verificar y, si está, lo que falta es el TEST ("y testeable" es parte del enunciado). Si el test ya existe, cerrar la unidad como verificada. |
| 5 | **D.6 — credencial 390px + fallback de foto + OSM** | Tres cosas medidas: el header se pisa a sí mismo exactamente en 390px (`clientWidth 2px` vs `scrollWidth 58px`), falta `onError` en la foto, falta atribución OSM visible (esto último es licencia, no cosmética). |
| 6 | **D.5 — suelo perceptual del mapa** | Los ΔE ya están medidos: clase-1 vs sin-datos = 4,62; sin-datos vs fondo = **2,61**; entre clases adyacentes = 10,77. Separar lienzo/tierra/clase-1/sin-dato hasta que el piso supere el umbral. |
| 7 | **H.1 restante** | La decisión D6 ya está tomada: `grain` faltante **tira**. Más los 6 throw-paths sin test y las ramas admin de `describeViewScope` / `isNarrowedBelowMandate`. |
| 8 | **H.2 — contrato del seed demo** | Ampliado a SC-3. La fence de nombres de vacuna que escribí es el precedente del patrón. |
| 9 | **#38 lista de "recuperadas" por evento** | La definición ya existe y está documentada (`dashboards/perdidas.ts:217`, la que usa el KPI `recoveredMonth`). Falta la query de LISTA equivalente. |

### Bloque 2 — las grandes, de a una, cada una con su commit

| # | Unidad | Riesgo |
|---|---|---|
| 10 | **#40 k-anon por provincia** (decisión PO tomada) | `ProvinceChoroplethCell` (`build-features.ts:581`) NO tiene `suppressed`. Hay que agregarlo y enhebrarlo por `buildProvinceChoroplethFeatures` → `ProvinceChoroplethProps` → fill del `SituationalMap`, para que salga **rayada** (convención del grano departamental), no desaparecida. **Trampa**: en capas de TASA el umbral aplica al DENOMINADOR, no al `value` — Santa Cruz publica 100% sobre 11 mascotas y el `value` es 100, no 11. |
| 11 | **D.3 — una gramática de confirmación** | Seis gramáticas + dos caminos sin confirmación. La asimetría está al revés: reasignar un decomiso pide modal + "no se puede deshacer", y **cerrar una denuncia Ley 14.346** recibe un "Confirmar" genérico inline. Canon propuesto: el botón lleva el VERBO del acto. |
| 12 | **D.4 — anatomía única de chips** | Cinco anatomías en seis colas (4 ubicaciones de conteo, 4 formatos de fecha, 4 tratamientos de estado, 4 de código). Elegir la dominante y aplicarla. |
| 13 | **D.1 — codemod de radios + escala h1** | Mecánico pero toca muchos archivos; el riesgo es el volumen del diff, no la lógica. |
| 14 | **SC-6 — urgencia ordena la cola, no la página** | Medido: el server trae `openedAt DESC LIMIT 50` y la urgencia es un sort de cliente SOBRE esa página. Están invertidos (pág. 1 máx 76, pág. 12 máx 184, disputas de 650 días puntúan 1300). Necesita rework del cursor keyset. |
| 15 | **C.1 — libreta del dueño a la vista owner** | Peor de lo descrito: no hay chips de filtro (tres tiles, dos deshabilitados) y `/libreta` `/vacunas` `/historial` son **byte-idénticas** (md5 verificado). |
| 16 | **C.2 — transferencia saliente en la IA** | El link a `/transferencias` está gateado en un conteo **sólo de entrantes** con `hideWhenZero`: con 0 entrantes la ruta queda huérfana. Y `TransferSenderForm.tsx:117` promete "podés cancelarla". |
| 17 | **#41 detalle de caso** (decisión PO tomada) | La más grande. Sumar parte + cerrar con motivo, sobre la gramática de D.3 — **por eso va después de D.3**. |
| 18 | **D.8 — las tres partes que faltan** | Cerré sólo el verbo. Faltan: loop de "Asentar" con 0 mascotas, vacío que vende la credencial, éxito con descarga/impresión del QR. |

## Lo que NO puedo hacer solo

| Qué | Por qué |
|---|---|
| **D1 — remediación RLS en staging** | Requiere correr contra staging. Ignacio-gated por CLAUDE.md. |
| **D7 — fecha de cutover** | Decisión de negocio. |
| **Aplicar migraciones a una DB remota** | Escribir el archivo es trabajo mío; aplicarlo es Ignacio-gated. |
| **`"Inscripto/a"` → `"Registrado/a"` en la credencial** | Copy de la credencial pública insignia. El acto ya dice "Registrar"; si el estado debe seguirlo es decisión del PO. |
| **E2E rojo en CI** | `failed to start docker container "supabase_db_DIM"` — colisión de puertos en el runner de GitHub. Infra, no código. No lo persigo. |

## Reglas de la corrida

1. **Una unidad = un commit.** Nada de commits que mezclan dos unidades: si una
   hay que revertirla, tiene que salir sola.
2. **Probar por mutación, y verificar que la mutación se aplicó.** Tres
   mutaciones quedaron en no-op en la sesión anterior (reformateo de biome, regex
   con 0 reemplazos, cascada CSS). Un verde sobre mutación no aplicada es
   indistinguible de un test vacuo. `grep -c` el token mutado antes de leer el
   resultado.
3. **Nadie corre `build` mientras haya algo usando `:3000`** — y ANTES de correr
   cualquier e2e local, rebuildear y reiniciar. Un `verify` deja el servidor
   sirviendo chunks viejos (400, MIME `text/html`), la página no hidrata y TODO
   e2e falla por la razón equivocada. Mordió 4 veces en una sesión, la última
   costó un diagnóstico entero que hubo que retractar.
4. **Buscar case-insensitive cuando el selector lo es.** Un `rg 'Crear mascota'`
   no encuentra `/crear mascota/i` — 25 selectores invisibles hasta correr tests.
5. **Si `lint:spine` marca una mascota huérfana** creada por la propia corrida:
   es residuo de test, se borra con
   `SET LOCAL app.allow_event_mutation='true'` + `app.allow_event_mutation_actor`
   vía psql (el cascade a `pet_events` lo bloquea el trigger append-only).
6. **Al terminar cada unidad, actualizar la tabla de estado de abajo.** Ese es el
   punto de retome en frío.

## Hallazgo sistémico abierto — fixtures que dejan mascotas sin spine

`lint:spine` atrapó TRES veces en una sesión mascotas sin `pet_registered`
creadas por fixtures de test: `TRNS-TEST-0001`, `DDXTEST-RABIES-…` y las de
`create-pet`. No son tres accidentes: son fixtures que insertan mascotas
directo, salteando el circuito de alta, y no limpian. Cada una obliga a un
borrado manual con el GUC antes de poder commitear.

El arreglo sistémico va en **H.2** (contrato de seed/fixture): o pasan por el
circuito real, o llevan `seed_tag` (que la fence exime por diseño), o limpian
en su `afterAll`. Elegir una y aplicarla a todas.

## #31 crisis-seams (b) — resuelto a medias, con el resto acotado

**Causa encontrada y arreglada** (`1ea0a95e`): no era el producto, era
`submitAndWait`. Su fallback #39 re-resolvía el botón por nombre DESPUÉS del
click, y un submit en vuelo lo renombra ("Registrar vacuna" → "Registrando…"),
así que el locator dejaba de matchear y reportaba "no encuentra su botón" sobre
un formulario que había aceptado el click. Ahora toma el handle antes del click
y, si el botón está deshabilitado o en estado pendiente, NO re-envía —
re-enviar sobre un spine append-only duplica un registro firmado.

**La captura estaba en disco desde el primer fallo** (`test-results/…/
test-failed-1.png`) y mostraba el botón diciendo "Registrando…". Teoricé dos
hipótesis equivocadas antes de mirarla. Método: leer la evidencia que ya existe
antes de generar hipótesis.

**Lo que queda**: el spec sigue rojo, ahora en `waitForURL` agotando los 45s
completos. A mano, el MISMO flujo sobre `DIM-PAMP-0001` firma y redirige en
segundos. Algo es específico de Rocco (`DIM-DEMO-0001`) en Clínica Veterinaria
Recoleta — probablemente la relación org↔mascota. Eso ya es señal de PRODUCTO,
no de test. Próximo paso: reproducir a mano con esa combinación exacta y leer la
respuesta del server action.

## C.4 — la affordance EXISTE (probado); el test no la alcanza (abierto)

**Lo que quedó probado con evidencia, contra la app viva:**
- Un script tsx propio (login govt → `/gob/panorama` → volcar todos los
  `<select>`) encuentra DOS: uno etiquetado **"Provincia"** con opciones
  `Todas | Tierra del Fuego | Santa Cruz | CABA`, y otro **"Localidad"**.
  Ambos reportan `139×44`, `display:block`, `visibility:visible`, **sin ancestro
  oculto**.
- La captura de la pantalla (`test-results/panorama-drill-affordance-…`) muestra
  el control de scope como un **chip desplegable** arriba a la izquierda —
  "Tierra del Fuego, Santa Cruz, CABA ▾".

**Conclusión sobre la UNIDAD**: la review tenía razón y mi grep del código estaba
mal — el camino visible de drill EXISTE. Lo que falta del enunciado es "y
testeable".

**Lo que NO logré, y es el próximo paso:** un spec de Playwright no encuentra
esos selects. Probado y fallido: `getByLabel` anclado, `getByLabel` laxo,
`getByRole("combobox", {name})`, fijar viewport 1440×900, y hacer click en el
chip antes de aserir. El spec quedó BORRADO en vez de commiteado en rojo.

La pregunta a responder primero, porque es rarísima: **mi script tsx los ve y el
spec no.** Diferencias que quedan sin descartar: el config
`playwright.local3000.config.ts` (¿storageState? ¿baseURL? ¿otro viewport?), y
si los selects viven en un portal que aparece sólo tras una interacción que mi
heurística de "click en el chip" no acierta. Volcar el HTML del panel en el
contexto del SPEC (no del script) lo separa en una corrida.

## D.5 — medido, y resulta SOBRE-RESTRINGIDO (necesita decisión de producto)

Calculé ΔE00 sobre los cuatro colores que compiten en el mapa:

| Par | ΔE00 | Lectura |
|---|---|---|
| sin-datos `#e7eaed` vs tierra `#eef1f4` | **1,48** | indistinguibles |
| clase-1 `#eff3ff` vs tierra `#eef1f4` | **4,21** | **casi indistinguibles** |
| sin-datos vs clase-1 | 4,62 | débil |
| sin-datos vs suprimido `#d1d5db` | 4,93 | débil |
| entre clases de datos adyacentes | 10,77 | esto sí separa |

**El hallazgo que la review no nombró**: `clase-1 vs tierra = 4,21`. Una
provincia CON datos en la clase más baja es casi indistinguible de una provincia
sin nada. Eso es peor que el piso de sin-datos, porque el mapa sub-reporta
cobertura que sí existe.

**Por qué no lo arreglé solo moviendo un color**: barrí todos los grises
achromáticos entre `#c8c8c8` y `#e6e6e6`. Para separarse de la tierra hay que
oscurecer (≥`#cbcbcb` da 8,67), pero ahí se choca con **suprimido `#d1d5db`**,
que ocupa esa misma banda de luminosidad (ΔE cae a 3-4). **Ningún gris supera 8
contra los tres a la vez.** Cuatro estados sobre un solo eje achromático no
entran.

**Opciones para el PO (ninguna es obviamente correcta):**
- **(a)** Re-espaciar los TRES: mover suprimido más oscuro y sin-datos al medio.
  Toca el token de suprimido, que hoy tiene su rayado y sus tests.
- **(b)** Dejar de pedirle todo al relleno: sin-datos con contorno/textura
  propia, como suprimido ya hace con el hachurado. Separa por forma, no por
  color, y saca la restricción del eje.
- **(c)** Aceptar que sin-datos ≈ tierra está BIEN —"sin datos" y "fuera del
  análisis" son conceptos vecinos— y gastar el presupuesto de contraste en
  **clase-1 vs tierra**, que es el que miente. El más barato y el que ataca el
  daño real.

Mi recomendación es **(c) + (b)**: subir el piso de clase-1 para que un dato
bajo se vea como dato, y darle a sin-datos una marca propia en vez de pelear el
eje de luminosidad.

## C.3 — lo verificado y lo que falta (un solo salto)

**Ya está bien, verificado:**
- `shouldEmitPresetFrame` SÍ está cableado — `PanoramaConsole.tsx` lo llama y
  setea `presetFrame` con un token incremental (~L2786).
- La **URL es determinística**: el commit escribe `period`, `layers`, `level` y
  `preset` explícitamente sobre los params vivos.
- `AR_BBOX` ya es el extent nacional ESTÁTICO que usa el camino de "← Volver"
  (`SituationalMap.tsx:1046`) y `MAX_BOUNDS` (`situational-map-config.ts:491`).

**Lo único que falta verificar (un salto):** cuando `presetFrame` llega al mapa
con `kind: "national"`, ¿resuelve a `AR_BBOX` o al snapshot de extent-de-datos
(`nationalBboxRef`)? Ese ref es la trampa que v2C ya arregló en el path de back:
en una sesión con cámara restaurada equivale a la vista regional, así que un
frame "nacional" reencuadra a la misma región — un no-op visible.

Rastrear `presetFrame` desde `PanoramaConsole` hasta su consumidor en
`SituationalMap` cierra la unidad. Si ya usa `AR_BBOX`, C.3 está hecha y sólo
falta el test; si usa el ref, es un cambio de una línea con el precedente ya
escrito al lado.

**Nota de método**: un `rg --glob '!*.test.*'` sobre varias rutas me devolvió
CERO y casi concluyo que el framing era código muerto. Es el segundo grep
defectuoso de la sesión (el otro: buscar `/Crear mascota` contra selectores
`/crear mascota/i`). Cuando un grep dice "no existe" sobre algo que el plan
afirma que existe, desconfiar del grep antes que del plan.

## Validación del batch (2026-07-29)

Cuatro unidades commiteadas (H.1, herramienta de limpieza, #38, C.3) y UN solo
gate completo, según el acuerdo: **`pnpm verify` exit 0 y 12.502 tests verdes,
cero rojos**. El batching funcionó — cuatro unidades por el precio de un suite.

**Tres tests encontrados pinneando su propio defecto** en lo que va de la ola:
el rollup de k-anonimato (`expect(rolled?.count).toBe(3)`), el `status='open'`
de las denuncias atrasadas, y el frame nacional de presets ("→ fitBounds to the
CAPTURED national bbox"). No es casualidad: cuando alguien arregla un síntoma y
escribe el test DESPUÉS, el test describe lo que el código hace, no lo que
debería hacer. Vale revisarlo como clase, no como tres accidentes.

## Validación del batch 2 (2026-07-29)

Tres unidades (D.5c, H.2, D.6) y UN gate: **`pnpm verify` exit 0** y
**12.523 tests passed, 0 failed**.

**Sobre el exit code del suite**: sale 1, y NO es un test rojo. Es el
`Worker exited unexpectedly` que `docs/ops/local-dev-runbook.md:73` ya documenta
como ruido de teardown de sockets de postgres.js — el `globalSetup` lo mitiga
pero no lo elimina. Confirmado ajeno a este batch corriendo los 4 archivos
nuevos/tocados solos: exit 0, 34 verdes. Vale dejarlo dicho porque un suite que
sale 1 por diseño vuelve a la trampa del instrumento roto: si un día hay un rojo
de verdad, el exit code no lo distingue. Candidato a unidad propia.

**El ratchet de design-tokens funcionó como corresponde**: mover markup viejo a
un archivo nuevo le sacó el grandfathering de `page.tsx` y falló el gate. La
salida correcta no era re-baselinear sino tokenizar — y eso destapó que el
rayado "sin foto" está hardcodeado en ~8 lugares con tres pares de hex distintos.

**Cuarto test pinneando su propio defecto** (van 4 en la ola):
`viz-scales.test.ts` aserraba `COLOR_NO_DATA !== SCALE_BLUE_SEQ[0]` — desigualdad
de strings. Pasaba verde con ΔE00 4,62, o sea con los dos rellenos indistinguibles.
El patrón ya no admite lectura de accidente: cuando el test se escribe DESPUÉS del
arreglo, describe lo que el código hace, no lo que promete.

## Pasada de UI viva (2026-07-29) — el entorno mintió primero

**El `:3000` estaba sirviendo un build zombi, y casi me come otra vez.** Primera
medición del header a 390px dio números imposibles (el escudo de `w-[26px]`
midiendo 374px). No era el fix: la página se había renderizado **sin CSS**.
Chunks con 400 y MIME `text/html`, `window.next` undefined.

Cómo se prueba, sin teoría: `.next/BUILD_ID` en disco pedía
`webpack-d0e1d711…` y la página pedía `webpack-518daa31…`. Distinto build.

`qa-up.ps1` **dijo** que reiniciaba el servidor viejo y no pudo: el proceso
corre en otro contexto de seguridad y `taskkill` devuelve *Access is denied*.
Workaround: `pnpm start -p 3001` y trabajar ahí.

**Esto es una unidad nueva, no una anécdota**: el guard de `qa-up.ps1` reporta
éxito sin verificar que el servidor viejo murió. Un guard que no puede fallar
ruidosamente es peor que no tenerlo, porque compra confianza que no tiene.

## Validación del batch 3 (pasada de UI)

`pnpm verify` exit 0. Suite: **1065/1065 archivos, 12.521 tests passed, 0 FAIL**.

**Dato honesto sobre el conteo**: `12541 total − 12521 passed − 4 skipped − 11
todo = 5` sin explicar (la corrida anterior dejaba 2 sin explicar). Ningún
archivo reporta fallo ni "did not complete", así que lo más probable es
colección variable (`describe.skipIf` que depende del estado de la DB). Pero
NO puedo afirmarlo con certeza, y esa incertidumbre es exactamente el costo de
un suite que sale 1 por diseño. Refuerza que arreglar el exit code es unidad
propia, no cosmética.

**El ratchet de tamaño de archivo cobró, y con razón**: el cambio del chip dejó
`PanoramaConsole.tsx` en 5106 líneas contra 5089 de baseline. Re-baselinear
hubiera sido la respuesta equivocada a un ratchet que existe para impedir eso.
Se extrajo `ScopePillSummary.tsx` y el archivo quedó en **5079** — más chico que
antes de tocarlo.

## Los instrumentos (2026-07-29) — arreglados a medias, y el resto acotado

| unidad | estado | commit |
|---|---|---|
| Pool de pg drenado por archivo | **hecha** — recuperó 5 tests perdidos; la aritmética cierra exacta por 1ª vez | `a6e5bb38` |
| Guard de `qa-up.ps1` | **hecha** — falla duro con el PID; verifica DESPUÉS de arrancar | `38bff022` |
| Runbook falsificado | **corregido** | `7b66c2d8` |
| `pnpm test` sale 1 | **abierto, pero acotado** | |

**Lo que se recuperó**: los pools quedaban abandonados esperando `idle_timeout`.
`db/index.ts` ya decía "per-file pool recycling" — nadie reciclaba. Al drenarlos,
**12521 → 12526 tests** y `12541 − 12526 − 4 − 11 = 0`. Se perdían tests con los
sockets, en silencio.

**Lo que quedó falsificado**: el runbook culpaba a postgres.js. Medido:
`--project unit` exit 0 (485 archivos), `--project db` exit 0 (581 archivos),
**cero errores de worker en cada uno**. El crash aparece SOLO con los dos juntos
→ es interacción entre los workers paralelos de unit y el serial de db. La
próxima sesión no tiene que volver a mirar el pool.

**Trampa nueva y cara** (rompió 45 archivos en un intento): el proxy de mock de
vitest tira al **LEER** la propiedad, no al llamarla. `mod.fn?.()` NO alcanza
sobre un módulo mockeado; hay que envolver en try/catch.

## Batch 4 (D.5b) — y el dato nuevo sobre el exit code

`pnpm verify` exit 0. Suite: **1066/1066 archivos, 12.533 passed, 0 FAIL,
`SUITE_EXIT=0`**, y la aritmética cierra (`12533 + 4 + 11 = 12548`).

**Pero cuidado con leer esto como "arreglado"**: la corrida anterior, con el
MISMO fix del pool, salió 1 con un error de worker. O sea que el crash es
**intermitente**, no determinista. El drenaje del pool recuperó tests perdidos
(eso sí es un hecho medido y reproducible) y probablemente redujo la ventana,
pero UNA corrida verde no prueba que la causa esté cerrada. Sigue abierto, y
sigue acotado a la interacción entre proyectos.

**El fence de tamaño cobró dos veces en la misma unidad** y las dos veces la
respuesta fue partir, no re-baselinear: salieron `no-data-pattern.ts` (el tile),
`no-data-overlay.ts` (las capas) y `map-pattern-images.ts` (el registro
compartido). `SituationalMap.tsx` terminó en **3398**, justo en su tope.

## D.1 — lo que "una línea" tenía adentro

`pnpm verify` exit 0. Suite: **1065/1065 + 1 arreglado, 12.533 verdes**.

**El encuadre del plan estaba mal, y en las dos direcciones.** No eran "22
archivos de UI": el radio vive en UNA línea de `LnButton`. Pero al girarla
aparecieron **119 botones crudos que habían copiado su 3px a mano**, más 26
anclas con look de botón — coincidían por accidente antes y habrían divergido
de su propio primitivo después. Codemod consciente de llaves, acotado a tags de
apertura y partido por la misma frontera de superficie que usa el fence.

**El fence es el entregable, no el fix.** Sin él esto se re-hace en tres meses:
la regla vivía solo en un comentario de CSS, y los comentarios no fallan builds.
`lint:buttons` estaba mirando este archivo todo el tiempo, guardando otra cosa.

**Lección de fence, aprendida en el intento fallido**: mi primera versión también
escaneaba `<a>`/`<Link>` y reportó **310 violaciones, casi todas legítimas** —
acá una ancla es muy seguido una CARD o un item de nav. Un fence que marca
código correcto termina allowlisteado y después ignorado. Lo acoté a `<button>`,
que es inequívoco.

**Un test rojo, y del tipo correcto**: `Button.test.tsx` pinneaba
`rounded-[3px]` literal y se puso rojo en el instante justo. Ahora pinnea la
FORMA de la regla (un token `--radius-*`), no el valor — la regla vuelve a
tener una sola casa.

## 🔴 HALLAZGO SISTÉMICO — 703 font-size muertos, y el fence los recomendaba

**`text-[var(--text-*)]` NO define un tamaño.** Tailwind v4 no puede saber si un
`text-[…]` arbitrario es tamaño o color, y con una CSS var pelada elige **color**.
Del CSS compilado, textual:

```css
.text-\[var\(--text-sm\)\]{color:var(--text-sm)}
```

El elemento recibe `color: 12px`, inválido, se descarta, y **se queda con el
tamaño que heredó**. La forma que funciona es la utilidad NOMBRADA de Tailwind
(`text-sm`, `text-3xl`), que compila a `font-size:var(--text-sm)` porque
`--text-*` ES su namespace de font-size.

**Alcance: 703 usos en 207 archivos.** `--text-sm` ×234, `--text-md` ×199,
`--text-xs` ×147, `--text-title` ×95.

**Por qué hay tantos**: `lint:tokens` lo documentaba como *"the correct token
form"*, lo eximía explícitamente de matchear, y su mensaje de error lo
recomendaba. El fence venía enseñando el patrón roto. Yo escribí mis 67 así por
ese mismo mensaje.

**Cómo apareció**: NO por el gate. `verify` exit 0 y 12.533 tests verdes sobre
67 headings rotos. Apareció midiendo un h1 en el navegador y viendo 16px donde
debía haber 28. **Ninguna aserción del suite mira un tamaño computado.**

**Estado**: cercado (regla 9, 703 ratcheteados) y los mensajes corregidos. NO
arreglado en masa a propósito — destrabar 703 declaraciones significa 703
elementos pasando de golpe a su tamaño real, o sea un cambio visible en toda la
app. Eso es una pasada deliberada con el PO, no un codemod silencioso.

## Estado (se actualiza durante la corrida)

| Unidad | Estado | Commit |
|---|---|---|
| SC-5 | **hecha** — suite verde de punta a punta por primera vez | `88dce3ba` |
| #32 create-pet | **hecha** — fuga cerrada + login por helper compartido. El spec sigue ROJO por un 3er problema aparte (cascada provincia→localidad), ya rojo antes | `05f4d43d` |
| #31 crisis-seams (b) | **parcial** — bug del helper arreglado; queda un cuelgue real específico de Rocco@Recoleta | `1ea0a95e` |
| C.3 | **hecha** — frame nacional usa el extent estático; el test que pinneaba el defecto, reescrito | `21495015` |
| C.4 (chip) | **hecha** — el rótulo nombra el acto ("Cambiar"), visible y encabezando el nombre accesible. PO eligió (c): panel cerrado por defecto. **Riesgo declarado y aceptado**: mitiga el hallazgo, no lo elimina | `e9e01c3c` |
| C.4 | **hecha** — el spec nunca falló por selectores: los selects viven en un `<details>` NATIVO cerrado (el locator resolvía y el elemento estaba hidden), y lo abre un `<summary>`, no un button. Hallazgo de producto abierto: en sesión fresca el operador nuevo no ve ningún control de drill | `fec3e9df` |
| D.6 | **hecha** — las tres. Header: el bloque de marca se aplastaba a 2px (era `flex-1 min-w-0` contra chips que no ceden) → `basis-[7rem]` hace wrappear. Foto: `CredentialPhoto` cliente con `onError` + 4 tests. Mapa: **el plan decía "falta atribución OSM" y estaba mal** — `LocationMap` ya la declara; `PublicLostSections` la RECORTABA (`h-40 overflow-hidden` sobre un mapa `h-64`, se perdían los 96px donde MapLibre la dibuja). Era licencia ODbL, no cosmética | |
| D.5 (c) | **hecha** — PO eligió (c)+(b). Rampa re-espaciada: clase-1 vs tierra 4,21 → **16,38**, pasos parejos. + `color-distance.ts` (ΔE00) y el 4º test que pinneaba su defecto, reescrito | `3aee0ccd` |
| D.5 (b) | **hecha** — puntillado propio para "sin datos" (provincia + división) + swatch de leyenda desde las mismas constantes. Verificado en vivo. **Falta**: CabaInset y MapChoropleth siguen con relleno plano | `9ec134bc` |
| H.1 restante | **hecha** — `grain` faltante TIRA (D6) + los 7 throw-paths con test (21 en total) | |
| H.2 | **hecha** — fence de precondición de seed. Medido antes de escribirlo: de 15 archivos que nombran un token de demo, 13 lo usan como fixture de render y 1 crea sus propias mascotas; **solo `seed-demo-scenario.test.ts` depende del seed, y ya lo declara**. El contrato ya se cumplía; faltaba el fence que lo mantenga | |
| #38 recuperadas | **hecha** — selector event-sourced + 3 tests | `17903555` |
| #40 k-anon provincia | pendiente | |
| D.3 | pendiente | |
| D.4 | pendiente | |
| D.1 (radio) | **hecha** — canon de dos reglas (ciudadano `--radius-pill`, operador `--radius-op-btn`), codemod de 145 sitios, y `lint:buttons` extendido con ratchet de radio. + el "Buscar" rojo migrado a `LnButton` | `e23ebca1` |
| D.1 (h1) | **hecha** — 4 pasos display nuevos + 67 headings tokenizados. Y destapó un defecto sistémico: `text-[var(--text-*)]` compila a `color`, no a `font-size` — **703 usos muertos** en 207 archivos, cercados en la regla 9 | `73c33104` |
| SC-6 | pendiente | |
| C.1 | pendiente | |
| C.2 | pendiente | |
| #41 detalle de caso | pendiente | |
| D.8 (resto) | pendiente | |
