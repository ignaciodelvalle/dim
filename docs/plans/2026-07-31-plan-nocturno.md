# Plan de ejecución nocturno — 2026-07-31

> **Este archivo es el estado, no el contexto del agente.** Todo lo necesario para
> retomar en frío está acá. Cada unidad se cierra sola: tests dirigidos durante,
> gate completo por BATCH, un commit por unidad. Una unidad que falla NO bloquea
> las siguientes.
>
> **CERO decisiones intermedias del PO.** (1) Si hay decisión PO previa o
> precedente en el repo, se aplica. (2) Si las opciones son equivalentes, el
> agente decide y DOCUMENTA. (3) Si es visible de producto, se implementa la
> lectura recomendada, se deja evidencia, y va a RATIFICACIÓN. Nunca se frena.
>
> **El escape hatch se mantiene, y es obligatorio**: si al abrir el código la
> intención documentada contradice lo que este plan dice, **gana la intención
> documentada** — se anota y se sigue. La corrida del 30 lo usó TRES veces
> (B3, B2, el fence de A3). Sin esa cláusula la noche produce trabajo prolijo en
> la dirección equivocada.

## Decisiones PO vigentes (no re-preguntar NADA de esto)

| Tema | Decisión |
|---|---|
| **D.9 verbo** | **"Registrar" es EL verbo del acto de alta, en todas las superficies.** Supersede el "Cargar mascota" de D.8 |
| D.3 canon | Verbo del acto en el botón, NUNCA "Confirmar". Fricción por CONSECUENCIA |
| D.4 anatomía | Gana la de `CaseQueue` por medición; se adoptan sus ÁTOMOS, no se fuerza `<table>` |
| Pasada 703 | UNA pasada completa: codemod + capturas por superficie + suite |
| **SC-7** | **Unidad PROPIA, con capturas y guard/baseline propios. NO se foldea en B1** |
| **Prioridad** | **El bug del estado por defecto del panorama va PRIMERO**, por encima de B1 |
| D7 cutover | TODO el backlog gatea. Al cerrar la tabla, PROPONER fecha |
| B3 libreta | Las 3 rutas quedan colapsadas (ADR-10). Los chips van ADENTRO del timeline único |

## Entorno (verificado 2026-07-30 — no re-diagnosticar)

- `:3000` tiene un zombi inmatable de otro contexto de seguridad. TODO en `:3001`.
- Bootstrap: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1 -Port 3001`
- **Orden sagrado**: matar servidor → `pnpm build` → `qa-up` → guard verde → recién ahí medir.
- DB scripts: `node --conditions=react-server --import tsx scripts/<x>.ts`.
- cursor-agent: `C:\Users\ignac\AppData\Local\cursor-agent\cursor-agent.cmd -p --output-format text`.
- Cuentas semilla: `scripts/seed-test-users.ts` — password compartida `Test1234!`.
  `govt@dim.test` (operador), `alejo@dim.test` (**0 mascotas**), `owner@dim.test` (2).
- El mapa expone `window.__PANORAMA_MAP__`. Para medir píxeles reales:
  `readPixels` DENTRO de un handler `map.once('render')`.
- **`ppp-compliance` es la FUENTE de métricas; el id de capa es `ppp`.** Un
  `layers=` desconocido resetea a vacío EN SILENCIO — otra forma de "no hay
  datos" que en realidad es "escribiste mal el parámetro".

## Reglas de la corrida (todas pagadas con sangre)

1. `pnpm biome check --write` SIEMPRE antes de verify. Gate por batch.
2. Fallo de e2e → **abrir la captura ANTES de hipotetizar**.
3. Mutación para probar dientes → `grep`/Read para VERIFICAR que aplicó, **sobre
   el elemento correcto** (no contar prosa ni comentarios).
4. Un grep que dice "no existe" sobre algo que una pantalla afirma → desconfiar
   del grep (case, glob, naming).
5. Fence de tamaño → SIEMPRE partir, **nunca re-baselinear**.
6. `text-[var(--text-*)]` es un font-size MUERTO (compila a color).
7. Código de privacidad a medias es peor que ninguno: si no cierra entero
   (datos + render + leyenda + **divulgación** + tests), se revierte.
8. Cambios visuales: verificar en **PÍXELES COMPUTADOS**. El gate es ciego al CSS
   que no aplica, y una clase presente en el markup no prueba nada.
9. Suite en background sin `| tail`; el exit code MIENTE en las dos direcciones —
   leer CONTEOS. `cube-parity` nunca concurrente.
10. Hijos en background: pollear dentro del propio turno.
11. Actualizar la tabla de estado de ESTE archivo al cerrar cada unidad.

### Reglas nuevas (aprendidas el 2026-07-30)

12. **`git commit` commitea el ÍNDICE ENTERO.** Con escritores en paralelo eso
    roba trabajo ajeno y **se disfraza de revert voluntario** (la víctima aparece
    limpia en `git status`). Usar SIEMPRE `git commit -m "..." -- <paths>`.
    Decirle al subagente "stageá solo lo tuyo" NO alcanza: no lo protege del
    commit de otro.
13. **La suite completa se mide con el servidor de QA APAGADO** — para ELIMINAR
    UNA VARIABLE, no porque el servidor sea la causa. (Primero escribí que la
    contención con `:3001` arriba causaba el worker muerto. **Falso**: se
    reprodujo con el servidor abajo. Ver "El worker que muere" abajo.)
14. **Máximo 3 escritores concurrentes**, con territorio de archivos ENUMERADO en
    el brief de cada uno. Tres funcionó; el cuarto fue donde empezó a costar más
    de lo que rendía.
15. **Un test que pinnea el defecto es una CLASE DE FALLA, no una anécdota** —
    seis en una sola noche. Cuando un test afirma algo sorprendente, sospechar
    del test antes que del código.
16. **Los casts (`as unknown as X`) se filtran por debajo de "que el compilador
    enumere los callers".** Si se usa esa técnica, greppear los casts también.
17. **Antes de cazar un uncaught de CI: `gh run view <id> --log-failed`.** Nombra
    el archivo en "Unhandled Errors". El 30 se gastó una hora de timebox
    instrumentando algo que ya estaba impreso desde el día anterior.
18. **Un problema de copy no es un problema de forma.** Volver un prop
    obligatorio enumera call sites que lo OMITEN, no call sites que pasan la
    palabra equivocada. Para copy, el instrumento es un guard por grep.

---

## ⚠ ESTADO DEL GATE AL CERRAR EL 2026-07-30 — LEER ANTES DE PUSHEAR

**Hay trabajo commiteado localmente y NO pusheado.** `6ce14723` (D.9, el verbo
"Registrar") + los commits de docs/script posteriores. Los 20 commits anteriores
SÍ están en `origin` (`460d4df9..6575d0f6`).

**Por qué no se pusheó**: el gate no está verde. `pnpm verify` da exit 0 y **los
12.647 tests pasan, cero fallan** — pero un worker muere y la suite sale exit 1
con "1 error".

### El worker que muere — lo que SÉ y lo que NO

Medido en cinco corridas:

| corrida | servidor QA | archivos | tests | errors |
|---|---|---|---|---|
| 1 (antes de los 3 fixes) | abajo | 1076 | 12646 | 0 |
| 2 (después) | **arriba** | 1075 | 12635 | **1** |
| 3 (después) | abajo | 1076 | 12646 | 0 |
| 5 (tras el verbo) | abajo | 1075 | 12647 | **1** |
| 6 (tras el verbo) | abajo | 1075 | 12634 | **1** |

**Lo que sé:**
- La firma es `Worker exited unexpectedly`, **sin causa y sin nombrar archivo**.
- **CERO ocurrencias de `window is not defined`** → NO es el bug que A1 arregló.
- El reporter JSON dice que **los 1077 archivos pasaron**, incluido el que la
  consola no cuenta. O sea: **el worker muere DESPUÉS de que el archivo termina
  sus tests, en el teardown.** Misma familia que A1, sin el mensaje.
- Es intermitente: 3 de 5.

**Lo que NO sé, y no voy a afirmar:**
- Cuál archivo. El JSON no lo delata porque el archivo figura como pasado.
- Si el cambio de verbo lo empeoró. Post-verbo es 2 de 2, pre-verbo 1 de 3 — el
  patrón inquieta pero **tres muestras no distinguen eso de un flake preexistente**.
- Descartado: `owned-pets-count-deceased.test.tsx` (el archivo nuevo del cambio
  de verbo) usa `renderToStaticMarkup`, que es SÍNCRONO y no monta root ni agenda
  passive effects. No es el perfil de A1.

**Por qué no se pusheó igual**: el criterio se fijó ANTES de ver el resultado
("desempate sucio → no se pushea"). Honrar un criterio pre-registrado es
justamente lo que evita racionalizar a las 6 de la mañana. Y el paso 1 del
protocolo de cierre pide gate verde; no lo está.

### ACTUALIZACIÓN 2026-07-31 — A0 corrió y DESCARTÓ su propia hipótesis

A0 se aplicó (`ec4aafde`) y es un arreglo real de un defecto latente real, pero
**no arregla la muerte del worker**: 2 de 3 después, contra 3 de 5 antes.
Sin cambio. A0 queda descartada como causa.

**Y el hallazgo que vale más que el arreglo**: cada corrida que falla pierde
exactamente UN archivo del conteo de consola, pero **un número DISTINTO de
tests** — una perdió 10, otra perdió 2. **Muere un archivo diferente cada vez.**

Consecuencias, las dos importantes:
1. **No hay archivo culpable, y la bisección del proyecto `db` NO va a converger.**
   El párrafo anterior de este plan decía justamente eso; era falso y queda
   anulado.
2. El stack **no tiene un solo frame de código nuestro**:
   `[vitest-pool]: Worker forks emitted error` → `Caused by: Worker exited
   unexpectedly` → `ChildProcess.emitUnexpectedExit`. Es una **carrera en el
   teardown del pool de forks de vitest**, no un test malo.

### ACTUALIZACIÓN A0b — el fork MUERE NATIVAMENTE. Es Windows, y CI es Linux.

A0b parcheó temporalmente `node_modules/vitest/.../cli-api.js` (con backup, y
**restaurado** — árbol limpio) porque **vitest tira a la basura el `code` y el
`signal` del hijo**: por eso el error no tiene causa. Los logueó.

```
[A0B-DIAG] emitUnexpectedExit code=3221226505 signal=null state=started poolId=1 project=db
[A0B-DIAG] runner error for files: __tests__/admin-proposals.test.ts | isRejected=false
```

**`3221226505` = `0xC0000409` = `STATUS_STACK_BUFFER_OVERRUN`**, el código de
fail-fast de Windows. Controles medidos en la misma máquina: `process.abort()`
→ 134, OOM de V8 → 134, `child.kill()` → `signal=SIGTERM`. **Ninguno da
0xC0000409.** El stderr del hijo SÍ se propaga (llegan los "Not implemented" de
jsdom) y no hay ningún `FATAL ERROR`: **el fork muere nativa y silenciosamente.**

**DOS COSAS QUE YO HABÍA ESCRITO ACÁ QUEDAN FALSIFICADAS:**
1. **NO es una carrera de teardown.** `state=started` y el resolver del archivo
   sin settlear (`testfileFinished` nunca llegó): el fork muere **mientras corre
   el archivo**, no cerrándolo. Yo lo había inferido de los conteos del reporter
   JSON; la instrumentación directa gana sobre mi inferencia.
2. **No es el pool de postgres.js.** El `afterAll` de drenaje de `setup.ts` corre
   estrictamente DESPUÉS del punto donde el proceso ya no existe.

**Y una propuesta mía que era directamente inejecutable**: `poolOptions.forks.singleFork`
**no existe en Vitest 4.1.6** — `poolOptions` fue removido (cero ocurrencias en
`dist/`). Su traducción a v4 es `isolate: false`, y ahora es mala idea: no ataca
un crash nativo y mete los 588 archivos en un proceso donde el crash se lleva el
proyecto entero en vez de un archivo.

**Lo más importante, y que nadie se había preguntado**: `0xC0000409` es un status
de Windows NT. **CI corre en `ubuntu-latest`** (`.github/workflows/ci.yml:17`).
Ese crash **no puede ocurrir en Linux**. Fuerte sospecha de que esto es un
artefacto LOCAL de Windows y no un riesgo de envío — pero se confirma con una
corrida verde de CI, no razonándolo.

### RESUELTO 2026-07-31 — CI en Linux dice verde. El crash es local de Windows.

Re-lancé el CI del head pusheado (`6575d0f6`, run 30521116031) porque **los dos
runs originales habían quedado `cancelled`** — nunca hubo veredicto de Linux para
lo que ya está en `origin`.

**`Tests (vitest)` → SUCCESS en `ubuntu-latest`.** También verdes: migraciones,
drift de schema, lint/typecheck/build, auditoría de dependencias.
**El `0xC0000409` no reproduce en Linux. Es un artefacto local de Windows y NO
es riesgo de envío.** Medido, no razonado.

### HALLAZGO NUEVO (preexistente) — E2E en CI se muere por timeout

El job `E2E (Playwright)` tiene `timeout-minutes: 30` (`ci.yml:488`) y **lleva al
menos 3 corridas consecutivas agotándolo** (30521116031, 30521111221,
30513536370): el paso "Run Playwright e2e suite" sale `cancelled`, no `failure`.
**Este proyecto no tiene veredicto de e2e en CI**, y no lo tiene desde antes de
la corrida del 30. Va al backlog como unidad propia.

### Verificación local del e2e de D.9 — los locators FUNCIONAN

Como CI no puede dar el veredicto, se corrió local (build `NvrNivLPpe_Sh51u8wSx9`,
guard verde). Sonda sobre el DOM vivo:

```
mainContent:1  tabBar:1  tabBarInsideMain:0
altaLinksWholePage:2  altaLinksInBody:1  altaLinksInTabBar:1
```

Partición por contención **exacta**. La validación estática contra `AppShell.tsx`
era correcta. 9 pasan / 3 fallan, y los 3 son **preexistentes y rastreados**:

1. **Tests 1 y 2 — `pet-carousel-dots` ya no existe.** Eliminado en `73e4d955`
   (2026-07-24, "replace PetSwitcherDots with an avatar group"), **seis días
   antes de D.9**. El testid aparece en exactamente UN archivo: el spec.
   **Y acá está el séptimo caso del patrón**: los tests 8 y 9 afirman
   `pet-carousel-dots` `toHaveCount(0)` → **pasan vacuamente y no guardan nada.**
2. **Test 6 — drift de semilla.** El spec documenta `carla@dim.test` como dueña
   sin mascotas; tiene 4 (dos `QA7-*` del 2026-07-17, DIM-DEMO-0002/0008 del
   2026-07-26). Un barrido encontró que **no queda ningún dueño personal con cero
   mascotas** (lucas tiene 0 pero es `govt`). Arreglarlo exige que la semilla
   garantice uno.

**Trampa de config para la próxima**: `playwright.config.ts` apunta a **3333** y
trae su propio `webServer` que buildea y arranca — habría clobbereado el servidor
vivo. `playwright.local3000.config.ts` es el de reusar servidor pero **hardcodea
3000** y esta versión de Playwright no soporta `PLAYWRIGHT_TEST_BASE_URL`.
Arreglo de una línea pendiente: `process.env.QA_PORT ?? 3000`.

### Números de referencia (para quien lo retome)
- Proyecto `db` limpio: **588 archivos / 5786 tests**. Roto: pierde un archivo
  entero y sus tests.
- Proyecto `unit`: **6 de 6 corridas limpias** → descartado (a tasa base ~60%,
  p ≈ 0,4%). El fork muere en `db`.
- ~13 min por corrida de `db`; reproduce ~1 de 2.

### Siguiente candidato, ya razonado
`pool: "threads"` — si la muerte está en la capa `child_process` (Node 24 +
Windows + IPC `serialization: "advanced"`) o en código nativo dentro del fork,
worker_threads cambia el mecanismo entero. **Antes de gastar corridas**:
re-aplicar el parche de stderr-tail que dejó A0b (bufferea el stderr crudo del
hijo y lo vuelca en `emitUnexpectedExit`) — debería nombrar el error fatal
directamente. Logs en `scratchpad/a0b/`.

**Presupuesto medido**: **~12 min por corrida de suite completa** (730 s, de los
cuales 698 s son el proyecto `db` serial). Con una tasa base de 3 de 5, distinguir
un arreglo del ruido pide 3 corridas como mínimo → **~40 min por hipótesis.**
Presupuestarlo, no improvisarlo.

## A0 — RTL cleanup estructural (VA PRIMERO Y SOLO, antes de todo lo demás)

**Timebox: 45 min.** Si destapa un pantano, se revierte y se documenta.

`vitest.config.ts` no setea `globals: true`, y RTL instala su auto-cleanup solo
si existe un `afterEach` global. Por lo tanto **ningún test con RTL en este repo
limpia automáticamente**. 114 archivos usan RTL; en el proyecto `db` son 45, de
los cuales **12 no llaman `cleanup()`**. El 30 detonó el único que era
asíncrono (`use-asof-frame`) y puso CI en rojo con "1 error / 0 tests fallando".
Los otros 11 son síncronos y **hoy** no muerden.

Arreglo: `afterEach(cleanup)` guardado por `typeof document !== "undefined"` en
`__tests__/setup-env.ts`, o `globals: true`.

**Por qué va PRIMERO y SOLO**: cambia el comportamiento global de los tests. Si
se corre con tres agentes en vuelo, cada corrida dirigida de ellos queda
contaminada y no se sabe qué rompió qué. Si destapa tests que hoy dependen de
DOM filtrado, se quiere saber ANTES de que nadie más escriba.

Verificación: proyecto `db` completo, con el servidor apagado, contra árbol limpio.

## BLOQUE A — sin servidor (paralelo, máx 3 escritores)

### A1. El bug del estado por defecto del panorama — **PRIORIDAD #1 DEL PO**

En `/gob/panorama?layers=ppp` sin parámetro `level` — donde un funcionario con
alcance efectivamente aterriza — el cliente pide `level=province`, **aborta ese
request**, y refetchea `/api/panorama/ppp` **sin ningún parámetro**, así que el
servidor cae a `level=locality`. El mapa queda en modo provincia (`pano-prov-fill-ppp`
montado, chip "Provincias") pero recibe features de localidad:

- `fill-color` colapsa a `#e7eaed` plano
- `provinceNoDataFilter` se vuelve constante `true`
- `pano-prov-suppress-ppp` nunca se crea

**Resultado: el país entero se pinta "sin datos"** — incluida CABA, que reporta
40% a grano provincial, y Tierra del Fuego, que está protegida por k-anon.
Determinístico, reproducido en dos logins limpios, estable tras 5 s.

Sospechoso: `fetchLayersInto` / el estado `level` en
`components/panorama/PanoramaConsole.tsx` (~L1734 y ~L393).
Evidencia: `docs/reviews/results/2026-07-30-b4-visual/a2-04-*.png`.

**Diagnosticar desde el código PRIMERO** (barato). La verificación en vivo va al
Bloque B. Ojo con la regla 2 si aparece un e2e.

**Por qué es #1**: hace INALCANZABLE todo el k-anon de la corrida anterior en la
primera pantalla que ve el operador. Un mapa que miente al abrirlo invalida todo
lo que se construya encima.

### A2. B3 redefinida — los chips de filtro adentro del timeline único

**NO se diferencian las 3 rutas** (ADR-10, handoff "Una sola libreta", matriz de
tests en `pet-face-nav.test.ts:42-123`). La brecha real: el dueño no puede
contestar "¿cuándo fue la última X?" en un feed de hasta 250 eventos mezclados
(`critique-libreta.md` #3/#8).

El arreglo ya existe y está huérfano: `LIBRETA_FILTER_CHIPS`
(`lib/infra/libreta-sanitaria.ts:132-147`), 14 chips por tipo de evento, sin
ningún consumidor salvo su propio test. `EventTimeline.tsx:96` **ya acepta** el
prop de subconjunto. Cada fila de `past` ya trae `eventType`:
**no hace falta ninguna query nueva.**

No tocar `VacunasStatusBadges` (ver "Fuera de alcance").

### A2b. El limpiador de huérfanos cubre 4 de ~20 prefijos (chico, cerrado a medias)

`scripts/clean-test-orphans.ts` borra solo mascotas que matcheen un allowlist
EXPLÍCITO — y está bien que sea explícito: su propio comentario avisa que un
patrón `%TEST%` terminaría borrando una mascota real llamada "Testa".

El problema es la cobertura: `byToken` tiene **4 prefijos** y hay al menos
**veinte** generados por tests (`V05-TEST-`, `TAT-`, `ITAT-A/L/D-`, `AR-`,
`TEST-PEND/APPR/OWNR-`, `PET-ALC-`, `REEVALPAIR-`, `AEA-TEST-`, `CUST-`,
`SCALE-TEST-`, `AR-DRIFT-0N`, …). Cualquier worker que muera a mitad del archivo
equivocado deja una fila que `check-spine-integrity` va a rebotar en el próximo
`verify`, y que el limpiador NO sabe limpiar → investigación manual.

Pasó el 30 con `MC-DUP-` (el test tenía su `afterAll` correcto; el worker murió
por contención con el servidor de QA arriba). Se agregó ese prefijo — la
instancia, no la clase.

**Propuesta para cerrarla de verdad, que necesita revisión porque el script
BORRA**: en vez de crecer el allowlist a mano —que va a driftear— agregar un
segundo criterio mucho más fuerte que un prefijo de nombre: una mascota con
**cero `pet_events` Y cero `ownerships`** no es una mascota real por la
invariante #3 (toda mascota real tiene su `pet_registered`). Mantener el
allowlist como está y sumar ese predicado como modo aparte, nunca como default.
No se implementó el 30 a propósito: rediseñar un script destructivo al final de
una corrida larga y sin supervisión es exactamente cómo se borra data de verdad.

### A3. Caza sistemática de tests que pinnean el defecto

Seis en una sola noche. Ya no es anécdota.

Los seis del 30, como patrón de búsqueda: dos afirmaban que las provincias
"nunca se suprimen"; tres afirmaban que una celda DESAPARECE; uno sembraba
`suppressedCount: 3` sobre `EMPTY_FC` y exigía que el marcador de privacidad
fuera "SIEMPRE visible" — o sea, **exigía la mentira**.

Barrido dirigido, no exhaustivo: tests cuya aserción sea `not.toBe*`,
`toBe(0)`/`toBe(null)` sobre supresión, `.not.toBeInTheDocument()` sobre marcas
de privacidad, o comentarios del tipo "siempre"/"nunca" sobre un invariante que
el dominio no garantiza. Reportar cada uno con el veredicto: **pinnea el defecto
/ pinnea el contrato**. Arreglar solo los inequívocos; los dudosos a ratificación.

**Corolario, mismo barrido**: superficies de DIVULGACIÓN sin ningún test.
`all-suppressed-notice.tsx` — el gate que hizo visible el bug más grave del 30 —
no tenía un solo archivo de test. Las marcas de privacidad se construyeron con
cuidado y después se dejaron sin guardia. Enumerar cuáles siguen así.

## BLOQUE B — servidor UNA vez

Entrada: matar `:3001` → `pnpm build` → `qa-up` → guard verde. **La suite NO se
corre con el servidor arriba** (regla 13): apagarlo antes del gate.

### B1. Verificación en vivo del arreglo del panorama (A1)
El estado de aterrizaje debe pintar datos reales, CABA debe mostrar su 40%, y el
hachurado k-anon de TdF debe ser alcanzable sin tocar la URL. Píxeles, no DOM.

### B2. La pasada de los 703 — spec COMPLETA en `2026-07-30-plan-nocturno.md` §B1
No re-investigar: el inventario está medido y sin drift (703/207, idéntico al
baseline). Puntos que deciden el resultado:
- **Substitución literal por TEXTO CRUDO, no walk de AST**: ~14 usos viven fuera
  de un `className=` literal (mapas de variantes, constantes de módulo, defaults
  de parámetro). Un codemod por atributos JSX los saltea en silencio.
- **85 elementos van a CAMBIAR DE COLOR.** El cascade alfabético (`color` <
  `text`) hace que hoy la regla muerta le gane a la regla de color correcta. Es
  **corrección, no regresión** — pero quien lea las capturas sin saberlo va a
  reportar un bug donde hay un arreglo. Anotarlo EN las capturas.
- Regla 9 a baseline 0. Capturas por superficie. UN commit.

### B3. SC-7 — el gemelo sin fence
`font-[var(--font-ln-*)]`: **521 usos / 144 archivos**, font-family MUERTA por la
misma ambigüedad (`font-` resuelve a font-weight con una var pelada). Verificado
en el CSS compilado. Arreglo: `font-ln-mono` / `font-ln-serif` / `font-ln-sans`.

**Necesita guard y baseline NUEVOS**: `DEAD_TEXT_VAR`
(`scripts/check-design-tokens.ts:191`) matchea solo el prefijo `text-`.

Capturas propias: 349 elementos pasan a monoespaciada de golpe. Es el diseño
original, pero es un cambio grande.

## A4/A5/A6 — las tres roturas preexistentes que el PO metió al plan (31/07)

### A4. El E2E de CI muere por timeout — **el más grave de los tres**
`timeout-minutes: 30` (`ci.yml:488`) y al menos 3 corridas consecutivas lo agotan:
el paso sale `cancelled`, no `failure`. **Este proyecto no tiene veredicto de
e2e en CI.** Consecuencia para D7: ningún cambio de UI está cubierto end-to-end
en la barra del cutover, y nadie lo sabía porque un `cancelled` no se lee como
rojo.
Primero MEDIR dónde se va el tiempo (¿son todos los specs, o hay uno patológico?)
antes de tocar el número. Subir el timeout sin medir es apagar el detector.

### A5. La semilla no garantiza un dueño con cero mascotas
`carla@dim.test` está documentada en el spec como dueña sin mascotas y tiene 4
(dos `QA7-*` del 2026-07-17, DIM-DEMO-0002/0008 del 2026-07-26). Un barrido
confirmó que **no queda ningún dueño personal con cero mascotas** (lucas tiene 0
pero es `govt`). Rompe el test 6 de `owner-ia-p6` y hace imposible verificar
cualquier empty state de dueño sin fabricar un usuario a mano.
La semilla debe GARANTIZAR uno, con un tag que impida que una corrida de QA se lo
coma.

### A6. El config de Playwright hardcodea el puerto (una línea)
`playwright.local3000.config.ts` fija 3000 sin override por env, y 3000 tiene el
zombi inmatable. Además `playwright.config.ts` apunta a 3333 y trae su propio
`webServer` que buildea y arranca — usarlo por error **clobberea el servidor
vivo**. Arreglo: `process.env.QA_PORT ?? 3000`.

## STRETCH (solo si sobra reloj, en este orden)
- SC-6 (cursor keyset por urgencia — rework contenido, sin decisión).
- D.5(b) en `CabaInset`/`MapChoropleth` (calcar `no-data-overlay.ts`).
- #41 detalle de caso.
- crisis-seams (b): reproducir Rocco@Recoleta A MANO primero.

---

## FUERA DE ALCANCE — explícito, y por qué

Esto no es una lista de deseos postergados: cada línea es algo que **parece**
que habría que hacer y que hacerlo sería un error.

1. **Los 1.881 usos de `text-[var(--color-*)]`.** FUNCIONAN — el nombre de la var
   lleva `color-`, que es justo lo que deja a Tailwind inferir el tipo. Son **3×
   la población rota**. El regex del codemod debe matchear `--text-[a-z0-9-]+` y
   **jamás** `--color-`. Un regex flojo convierte una limpieza en una caída.

2. **Unir B2 y B3 (los 703 con SC-7).** Decidido por el PO. Serían 1.224 sitios en
   un commit y **cualquier regresión visual quedaría sin atribuir** a ninguno de
   los dos. Los deltas son de naturaleza distinta: uno suma tamaños (sutil), el
   otro cambia 349 elementos a monoespaciada (dramático).

3. **Cerrar la brecha del índice territorial.** Está DECLARADA en el loader, no
   olvidada. Cerrarla cambia una forma de datos que **`/admin/inteligencia` lee**
   — otro radio de explosión, con su propia revisión de consumidores. Sigue
   declarada, no cerrada.

4. **Re-abrir la consolidación de las 3 rutas de la libreta.** ADR-10 + el handoff
   "Una sola libreta" son decisiones ratificadas y **defendidas por una matriz de
   tests**. El 30 el plan pedía diferenciarlas y la evidencia lo dio vuelta. Los
   chips van ADENTRO del timeline único. No se revisita.

5. **"Habilitar" los tiles deshabilitados de `VacunasStatusBadges`.** No son una
   feature frenada: son botones de drill-down con `count === 0`, comportamiento
   correcto y decisión del PO del 2026-07-05. Convertirlos en chips de filtro
   rompe un acordeón que funciona.

6. **Prometer la chapita física en el copy del dueño.** El canal `printable_qr`
   está gateado por jurisdicción. Prometerlo le miente a un dueño de un municipio
   que no lo tiene habilitado.

7. **Cualquier feature nueva.** D7 gatea contra **todo** el backlog: scope nuevo
   mueve la fecha de cutover. Lo que aparezca va al backlog, no adentro de la
   noche.

8. **Un cuarto escritor concurrente.** Tres funcionó con territorio enumerado. El
   cuarto es donde la contención de índice y de CPU empezó a costar más de lo que
   rendía.

9. **Re-baselinear cualquier fence** (regla 5). Si el fence de tamaño dispara, se
   PARTE el archivo. Un baseline movido es un fence apagado.

10. **Trabajo de navegador en el Bloque A.** Es 5-10× más lento que todo lo demás
    (retro del 29). Todo lo que necesite el servidor se agrupa en UNA sesión.

11. **Proponer fecha de cutover antes de que la tabla cierre.** Es la regla D7 del
    propio PO. Una fecha sin la barra cumplida es una estimación disfrazada de
    compromiso.

12. **Arreglar los hallazgos "INFO" de la review del 30 solo porque están
    escritos.** Los dos WARNING reales ya se arreglaron. Lo demás es deuda
    documentada con dueño; tocarla sin decisión es scope creep.

---

## Protocolo de cierre (obligatorio, pase lo que pase)

1. Servidor **apagado**, después gate: `pnpm verify` + `pnpm test` (leer CONTEOS,
   no exit code; verificar que **no haya línea "Errors"**).
2. Review adversarial pre-push con cursor-agent sobre el rango completo. Los
   CONFIRMED se verifican A MANO antes de actuar y se arreglan como `fix(...)`.
3. Push SOLO si el PO lo autorizó para esa corrida. Si la review da DO NOT SHIP y
   el fix no es claro: NO pushear, veredicto arriba de todo en este archivo.
4. Actualizar este archivo: tabla de estado + LISTA DE RATIFICACIÓN.
5. `mem_session_summary` con el estado exacto para retomar en frío.

### Autorización de push
**PENDIENTE** — el PO la concede por corrida, no es permanente.

## LISTA DE RATIFICACIÓN

| # | Qué | Evidencia | Riesgo si se revierte |
|---|---|---|---|
| (vacío al inicio) | | | |

## Estado

| Unidad | Estado | Commit |
|---|---|---|
| A0 RTL cleanup (timebox 45') | **CERRADA** — arregla un defecto latente, NO la muerte del worker | `ec4aafde` |
| A0b pool de vitest (la muerte del worker) | en curso | |
| A1 bug estado por defecto panorama | pendiente | |
| A4 E2E de CI muere por timeout (PO 31/07) | pendiente | |
| A5 semilla sin dueño de cero mascotas (PO 31/07) | pendiente | |
| A6 puerto hardcodeado en config de Playwright (PO 31/07) | pendiente | |
| A2 B3 chips en timeline único | pendiente | |
| A3 caza de tests que pinnean el defecto | pendiente | |
| B1 verificación en vivo de A1 | pendiente | |
| B2 pasada 703 | pendiente | |
| B3 SC-7 | pendiente | |
| S1 SC-6 | stretch | |
| S2 D.5(b) inset | stretch | |
| S3 #41 | stretch | |
| S4 crisis-seams (b) | stretch | |

**Presupuesto honesto**: A1 y B2 son las caras. A0 es corta pero puede destapar
un pantano (por eso el timebox y por eso va sola). Expectativa realista: A0 + el
Bloque A entero + B1 + B2. B3 (SC-7) es probable pero no seguro; el stretch es
improbable. **Mejor 6 unidades cerradas con evidencia que 11 a medias.**
