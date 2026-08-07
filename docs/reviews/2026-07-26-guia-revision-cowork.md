# Guía de revisión para COWORK — jornada del 2026-07-26

> **Premisa del PO, textual**: *"se honesto con el manejo del git. Asumamos que si o si
> necesitamos pasar por cowork antes de validar todo por cerrado, va a volver con hallazgos."*
>
> Este documento **no es un cierre**. Es el mapa que le entregamos a un revisor externo para
> que encuentre lo que nosotros no vimos. Está escrito asumiendo que va a volver con hallazgos,
> y una parte de él existe justamente para decirle **dónde buscarlos**.

## Cómo leer este documento

- **[VERIFICADO]** — lo comprobé contra el repo, con el comando al lado.
- **[CORREGIDO]** — el brief que originó este documento afirmaba algo; la historia real dice
  otra cosa. Va la afirmación original y lo que efectivamente pasó.
- **[NO VERIFICADO]** — hipótesis. No la comprobé y digo por qué.

Todo lo que no lleva marca es opinión mía sobre dónde mirar, no un hecho.

---

## 0. Antes que nada: el árbol se sigue moviendo

Mientras escribía esta guía, `HEAD` avanzó **dos veces**: `e1c0d396` → `8e72f7cf` (14:09) →
`c9687c9b` (14:13). **[VERIFICADO]** — `git reflog --date=iso`.

**Consecuencia para COWORK**: no revises "hasta HEAD". Fijá el rango por SHA al empezar y
trabajá sobre ése:

```powershell
git log --oneline 9c7392ef..c9687c9b     # 24 commits al momento de escribir esto
```

El límite inferior es **aproximado a propósito**. `9c7392ef` es de hoy 02:15; hoy hay
**30 commits desde medianoche** **[VERIFICADO]** — `git log --since="2026-07-26 00:00"`.
Los dos inmediatamente anteriores al rango (`3578da61`, `9c7392ef`, ambos 02:15) también son
de hoy, y **uno de ellos contiene uno de los seis hallazgos de la sección (c)**. Si el
objetivo es "la jornada", el rango honesto arranca antes.

---

## (a) Qué cambió, y por dónde empezar

24 commits. Agrupados por tema, no por orden cronológico. Los cuerpos de commit son largos y
están bien escritos: **son la mejor documentación de esta jornada** y valen más que este
resumen. `git log 9c7392ef..c9687c9b` con los bodies completos.

### Tema 1 — Fences nuevas de verificación (empezá por acá)

Tres compuertas que antes no existían y que ahora bloquean a todo el mundo. Una fence mal
hecha es peor que ninguna: da permiso.

| Commit | Qué agrega |
|---|---|
| `aa7b2573` | `lint:spine` — toda mascota debe tener su evento `pet_registered`. **Bloqueante desde el día uno, sin baseline de gracia** (decisión del PO). Única exención: `pets.seed_tag = 'perf'` |
| `f7ccde2a` | `lint:scope-authz` — deriva mecánicamente qué tablas gatea la capa de scope y exige que la base coincida. Detecta una política `USING (true)` abierta, que `lint:rls` **no puede ver** porque sólo cuenta políticas |
| `8e72f7cf` + `c9687c9b` | Smoke de cutover que maneja un navegador real. Seis superficies. Su premisa: *"un 200 prueba que la ruta resolvió, no que la pantalla funciona"* |

Ambos lints entraron a `pnpm verify`. **[VERIFICADO]** — `git show f7ccde2a -- package.json`.

### Tema 2 — Consolidación del scope de jurisdicción

| Commit | Qué hace |
|---|---|
| `bb680f48` | Rutea **52 de 54** predicados de jurisdicción escritos a mano por `dashboards/_scope.ts`. Baseline 54 → 2. Arregla de paso un defecto real: `fetchPerdidasMetrics` llamaba a `fetchLostPets` sin drill y filtraba en JS después, con un tope de 500 filas — un admin metido en una provincia chica promediaba sobre el top-500 **nacional** |
| `e1c0d396` | `ViewScopeDescriptor`: el scope de una vista como objeto serializable en lugar de una frase. Es lo que hace reproducible un artefacto exportado |

### Tema 3 — Panorama: honestidad de lo que la pantalla afirma

El grupo más numeroso. Todos son la misma clase de defecto: **la pantalla decía algo que los
datos no sostenían.**

| Commit | El defecto |
|---|---|
| `44b84d92` | El desierto veterinario contaba sólo `vet_visit_logged`: 29.123 vacunaciones, 17.817 esterilizaciones y 19.742 microchips contaban como **cero** actividad veterinaria. 85 eventos decidían un mapa de 24 provincias |
| `d6915571` | Tres defectos de consola: "sin datos por unidad" era la cámara (banda de puntos por zoom), no una ausencia; el ranking titulaba "PEORES 10" un orden por volumen y coronaba a la mejor jurisdicción como la peor; la pestaña "Referencias" abría sobre un panel vacío |
| `0a7f9a35` | El ranking asumía que más = peor. Falso en las dos capas donde más es mejor. Polaridad declarada en la capa. Huérfanas 2 → 1 |
| `9861b872` | La cabecera imprimía la vista 3× y el scope 3× en cuatro líneas |
| `a3070f1a` + `5cf45f73` | Un frame temporal se destruía al inspeccionarlo (cambiar de tab lo borraba) |
| `280cdf20` + `7da1e389` | La brecha vs meta faltaba en el CSV, y después faltaba en la tabla en pantalla |
| `537cc8f3` | Extracción del modelo de la tabla Registros y de los modos de mapa. `PanoramaConsole.tsx` 5190 → 5009 |

### Tema 4 — Seed y spine: invariante #3 en serio

| Commit | El defecto |
|---|---|
| `760d4dd8` | Las 12 mascotas demo no tenían `pet_registered`, y la "reparación" era **sintetizar el evento desde la fila `pets`**. Eso es el invariante #3 corriendo al revés: promueve el cache a **origen** del hecho. Las mascotas fueron borradas y regeneradas por `registerPet` |
| `21b8f2f2` | El seed de historia elegía fecha y mascota con sorteos independientes: **45% de los eventos** caían antes del `pet_registered` de su propia mascota. 1623 de 3579 muertes ocurrían antes de que el animal existiera |
| `854f1361` | Dos tests dejaban mascotas huérfanas en cada corrida: 83 y 83 acumuladas |

### Tema 5 — Pantallas de gobierno y admin

`5bd64b4a` (el callejón "sin localidades" ahora dice cómo salir) · `438e40cb` (la columna
Intentos dice su cero en vez de parecer vacía) · `7f6c8c41` (la lista de decomisos aclara que
el selector de período no la filtra) · `0c86d632` (tokens de texto).

### Tema 6 — Documentos

`f70a4710` (evaluación de cutover a staging) · `a8b267e1` (seis items derivados de ViewScope).

### Los tres archivos por los que yo empezaría

1. `lib/analytics/dashboards/_scope.test.ts` — **14 tests para 52 call sites reescritos**
   **[VERIFICADO]** — conteo de `it(`. Es la relación más floja del rango sobre el código más
   sensible: si un predicado de scope se rompió, se rompió la autorización.
2. `scripts/check-scope-authz.ts` (548 líneas, nacido hoy) — una compuerta de seguridad recién
   escrita. Su cuerpo de commit afirma que *"una derivación vacía es una falla, no un pase"*.
   Verificá que esa afirmación tenga un test que la sostenga.
3. `760d4dd8` completo — es el commit que **borró y regeneró datos**. Todo lo demás es código.

---

## (b) La historia de git: cómo se hizo, y qué salió mal

Esto no es un anexo. **Cambia cómo hay que revisar el rango.**

### El error de origen

**Cuatro escritores trabajaron en simultáneo sobre UN solo checkout compartido**, contra la
norma explícita de este proyecto (`CLAUDE.md`: *"Parallel writers only in worktrees — a 2nd
writer runs ONLY in its own git worktree with disjoint file territory"*).

La evidencia de la simultaneidad está en el reflog **[VERIFICADO]** — `git reflog --date=iso`:

- 4 commits en **23 segundos**: 11:51:14, 11:51:21, 11:51:28, 11:51:37
- 3 commits en **20 segundos**: 03:13:38, 03:13:49, 03:13:58
- 2 commits en **9 segundos**: 12:38:28, 12:38:37

Y está admitida por escrito en el propio cuerpo de `f7ccde2a`:

> *"file-size baseline: PanoramaConsole.tsx 5117 → 5064, its measured size (**the file is under
> concurrent edit**; 5064 held stable for ~27 minutes…)"*

Un commit que documenta que está midiendo un archivo que otro agente está escribiendo al mismo
tiempo. Eso no es un detalle: es la firma del problema.

### Los incidentes, uno por uno, contra la historia real

#### 1. El `git reset --hard` y el stash — **[CORREGIDO]**

**Lo que decía el brief**: un `git reset --hard HEAD` borró ~10 archivos trackeados de otro
agente, recuperados desde `stash@{0}`; y aparte un `git stash` se comió trabajo en 11 archivos.

**Lo que dice el repo** **[VERIFICADO]** — `git stash list`, `git stash show --stat`,
`git reflog`:

- Hoy hay **cuatro** resets en el reflog: 11:35:45 (`HEAD~1`), 12:35:01 (`HEAD`),
  12:35:56 (`HEAD`), 12:38:18 (`HEAD~1`).
- `stash@{0}` es de hoy **12:35:01** — el mismo segundo que el primer reset. Tiene
  **17 archivos**, 443 inserciones. **No 10 y no 11.**
- `stash@{1}` es del **2026-07-03**, 21 archivos. **No es de hoy**, es de hace tres semanas.
- **No existe ningún stash de 11 archivos.** O fue popeado (lo que borra la entrada del
  reflog de stash, que sólo conserva 2) o el número está mal. **No se puede verificar
  desde acá.**

**Lo importante, y es bueno**: `stash@{0}` **sigue ahí, sin aplicar**, y el árbol de trabajo
está limpio. Comparé el stash contra HEAD **[VERIFICADO]** — `git diff HEAD stash@{0}`:

- Las únicas diferencias son (i) archivos creados **después** de la base del stash,
  (ii) **38 líneas de reformateo de Biome** en `aggregate-to-department.test.ts` — leí el diff
  entero, es puro colapso de argumentos a una línea, **cero cambio semántico** — y
  (iii) `file-size-baseline.json`: 5117 en el stash, 5064 en HEAD.
- **Nada semántico quedó varado en el stash.** Todo su contenido llegó a HEAD por otra vía.

**Lo que COWORK debería decidir, no yo**: ese stash sigue colgado. Borrarlo es una decisión,
no una tarea de limpieza.

#### 2. `package.json` reescrito desde una copia vieja — **[CORREGIDO]**

**Lo que decía el brief**: `package.json` fue reescrito desde una copia stale, borrando un
script de lint recién agregado.

**Lo que dice la historia** **[VERIFICADO]** — `git log 9c7392ef..HEAD -- package.json`:

- Sólo **dos** commits lo tocan: `aa7b2573` agrega `lint:spine`, `f7ccde2a` agrega
  `lint:scope-authz`. **En la historia commiteada nunca se perdió ningún script.**
- Más: `git diff HEAD stash@{0} -- package.json` sale **vacío**. El `package.json` del stash es
  idéntico al de HEAD y **contiene los dos scripts**.

O sea: **el incidente pasó en el árbol de trabajo y se recuperó antes de commitear.** No dejó
rastro en git. Que no haya rastro no significa que no pasó — significa que git no es el lugar
donde buscarlo.

#### 3. El archivo de test clobbeado dos veces (12 → 8) — **[CORREGIDO]**

**Lo que decía el brief**: un test fue pisado dos veces, borrando en silencio un bloque
`describe` (12 → 8 tests), y *una corrida verde no revela tests borrados*.

**Lo que busqué** **[VERIFICADO]** — recorrí **cada** archivo `*.test.ts(x)` tocado en el rango
y conté `it(`/`test(` en **cada commit que lo tocó**, buscando una caída:

> **No hay ni una sola caída de conteo de tests en todo el rango.**

El candidato obvio, `components/panorama/MapDataTable.test.tsx`, fue en la dirección contraria:
8 tests / 3 describes desde `bb680f48` hasta `44b84d92`, y **12 tests / 4 describes** desde
`7da1e389`. El describe que aparece es `"MapDataTable — Brecha vs meta column"`. HEAD tiene los
12.

**La conclusión honesta es incómoda y hay que decirla igual**: el incidente es creíble, pero
**no dejó rastro en la historia commiteada**. Y eso *refuerza* la moraleja del brief en lugar
de debilitarla: **ni una corrida verde ni un historial limpio revelan un test borrado.**
La única defensa es que alguien lea el diff del test.

#### 4. Commits que se absorbieron hunks entre sí — **[VERIFICADO]**

Este sí está en la historia, y quedaron **dos commits huérfanos en el reflog** que lo prueban:

- **`a5c9e895`** (11:35:27), titulado `docs: six actionable items…`, contenía **8 archivos de
  código de producción**: `app/gob/decomisos/page.tsx` (209 líneas), `MapDataTable.tsx`,
  `PanoramaConsole.tsx` y 4 archivos de test. Un commit `docs:` que se tragó el trabajo de
  otro agente por el índice compartido.
  Reset a `HEAD~1` a las 11:35:45, recommiteado como **`a8b267e1`**: **1 archivo, 83 líneas,
  sólo documentación**. El código se fue a la tanda de las 11:51.
- **`ac37af7c`** (12:37:47), `fix(panorama): show the gap column…`, traía 7 archivos: la columna
  de brecha **más** `govt-roster.ts`, `app/admin/govts/*` y `aggregate-to-department.test.ts`.
  Reset a las 12:38:18, re-partido en **`7da1e389`** (2 archivos, la columna) y **`5bd64b4a`**
  (5 archivos, el arreglo de "sin localidades").

**[VERIFICADO]** — `git show --stat a5c9e895 ac37af7c a8b267e1 7da1e389 5bd64b4a`.

**Los dos son recuperaciones, no daño.** Alguien vio la absorción y la deshizo. Pero sólo se
ven en el reflog: en `git log` no queda nada.

#### 5. Un commit que no compila solo — **[VERIFICADO, y peor de lo que decía el brief]**

El brief decía "al menos un commit". **Son tres.**

`components/panorama/MapDataTable.tsx`, línea 20, en el commit `7da1e389`:

```ts
import { type ViewScopeDescriptor, viewScopeCsvHeaderLines } from "@/lib/ui/view-scope-descriptor";
```

`lib/ui/view-scope-descriptor.ts` **no existe en ese árbol**. Fue creado recién en `e1c0d396`,
**33 minutos después**. **[VERIFICADO]**:

```powershell
git log --oneline --diff-filter=A -- lib/ui/view-scope-descriptor.ts   # e1c0d396
git cat-file -e 7da1e389:lib/ui/view-scope-descriptor.ts               # fatal: no existe
```

Los árboles rotos son exactamente:

| Commit | Hora | Estado |
|---|---|---|
| `7da1e389` | 12:38:28 | **no typechequea** |
| `5bd64b4a` | 12:38:37 | **no typechequea** |
| `f7ccde2a` | 13:04:57 | **no typechequea** |
| `e1c0d396` | 13:11:11 | sana el import |

**Regla para COWORK**:

> **No esperes que `7da1e389`, `5bd64b4a` ni `f7ccde2a` construyan en aislamiento, y no uses
> `git bisect` en el rango `7da1e389..f7ccde2a`: te va a culpar al commit equivocado.**
> `HEAD` está verde. La revisión del rango tiene que ser **acumulativa**, no commit por commit.

Dos aclaraciones para no exagerar: los otros dos commits que agregan un script de lint
(`aa7b2573` y `f7ccde2a`) **sí** traen su propio archivo de script junto con la entrada de
`package.json` **[VERIFICADO]** — `git show --stat`. Y el escaneo de imports con alias `@/`
sobre los 24 commits devolvió **este único caso**.

#### 6. El baseline de file-size oscilando — **[PARCIALMENTE VERIFICADO]**

**Lo que decía el brief**: 5028 → 5056 → 5064 → 5028 → 5064 mientras dos agentes escribían el
mismo archivo.

**Lo que está en git** **[VERIFICADO]**: `scripts/file-size-baseline.json` fue tocado **una sola
vez** en el rango (`f7ccde2a`), de 5117 a 5064. **La secuencia del brief no está en la historia**
— pasó en el árbol de trabajo. Lo que sí está, y es evidencia directa del problema, es el
cuerpo del commit admitiendo el edit concurrente (citado más arriba).

**El estado final es correcto** **[VERIFICADO]**: `wc -l components/panorama/PanoramaConsole.tsx`
= **5064**, exactamente el baseline. El slack del gate es +25 (`GROWTH_SLACK` en
`scripts/check-file-size.ts`), o sea techo 5089. No hay ratchet aflojado.

### Resumen para el revisor

| Afirmación del brief | Veredicto |
|---|---|
| 4 escritores en un checkout | **[VERIFICADO]** — reflog + cuerpo de `f7ccde2a` |
| `reset --hard` borró ~10 archivos, recuperados de `stash@{0}` | **[CORREGIDO]** — el stash tiene 17 archivos, sigue sin aplicar, y nada semántico quedó adentro |
| Un stash se comió 11 archivos | **[CORREGIDO]** — no existe tal stash; `stash@{1}` es del 2026-07-03 |
| `package.json` perdió un script de lint | **[CORREGIDO]** — cero pérdida en la historia; los dos scripts están en HEAD y en el stash |
| Test clobbeado, 12 → 8 | **[CORREGIDO]** — ninguna caída de conteo en todo el rango; el archivo fue 8 → 12 |
| Commits se absorbieron hunks | **[VERIFICADO]** — dos huérfanos, `a5c9e895` y `ac37af7c` |
| Un commit no compila solo | **[VERIFICADO y ampliado]** — son **tres**: `7da1e389`, `5bd64b4a`, `f7ccde2a` |
| Baseline oscilando | **[PARCIALMENTE]** — la oscilación no está en git; el edit concurrente sí, admitido en el commit |

**Lo que esto significa de verdad**: de ocho incidentes, **cuatro no dejaron ninguna huella en
git**. Se recuperaron antes de commitear. El historial se ve razonablemente limpio, y esa
limpieza **es engañosa**: no es la prueba de que el proceso funcionó, es la prueba de que git
no registra los cuasi-accidentes. Por eso hace falta COWORK.

---

## (c) Dónde poner la atención más filosa

**La deuda característica de este repo es un test que pasa por el motivo equivocado.**
Apareció **seis veces en un día**. No es una coincidencia: es un patrón.

Los seis, cada uno con su evidencia:

| # | El caso | Dónde |
|---|---|---|
| 1 | Un test **pineaba `chevron-up` como correcto** cuando el chevron *era* el defecto: un chevron es la affordance universal de despliegue, y al lado de "-26%" el PO intentó clickearlo | `78d6f63a` (2026-07-25 20:14) — *"The existing test PINNED 'chevron-up'"* |
| 2 | Una aserción de orden chequeaba **`peakDate`** mientras el SQL ordenaba por **`last_seen`** — dos cantidades distintas que coincidían de casualidad. Un re-seed movió el RNG y la expuso: exactamente 1 par violando en 100 | `3578da61` — *"green for months while checking something the system never promised"* |
| 3 | Una **matriz de RLS afirmaba `deny`** con razones que describían una tabla vacía (*"no fixture transfers seeded"*), contradiciendo su propio header y la migración `0105`. Pasaba **sólo mientras la tabla estuviera vacía**; una transferencia real la expuso | `760d4dd8` |
| 4 | Una aserción satisfecha por texto en un **atributo `title` invisible**: el test buscaba "Sin intentos", que el em dash ya llevaba como tooltip — **verde mientras la pantalla estaba en blanco** | `438e40cb`. El antídoto está en `7da1e389`: *"Tests assert the rendered row CELLS rather than getByText"* |
| 5 | Un test de divergencia C3 **verde porque sus fixtures diferían en un segundo eje** (el grain renderizado), no en el que se estaba probando. El descriptor estaba roto y el test pasaba | `e1c0d396` — *"a weak fixture… the assertion passed for the wrong reason while the descriptor was broken"* |
| 6 | Un evento del spine **backfilleado DESDE el cache**: el `pet_registered` sintetizado desde la fila `pets`. La evidencia estaba en los datos — los 12 eventos compartían un `created_at` al microsegundo | `760d4dd8` |

### Lo que le pedimos a COWORK

**Leé las suites verdes con sospecha.** La pregunta no es "¿pasa?" sino:

1. **¿Qué tendría que romperse para que este test falle?** Si la respuesta es "nada obvio",
   el test no está midiendo nada.
2. **¿La aserción chequea la misma cantidad que el sistema promete?** (caso #2)
3. **¿Pasaría igual con la tabla / el fixture vacío?** (caso #3)
4. **¿El texto que busca es visible, o vive en un `title` / `aria-label`?** (caso #4)
5. **¿Los dos fixtures que compara difieren en UN solo eje?** (caso #5)
6. **¿El dato que valida viene del log o del cache?** (caso #6 — invariante #3)

### Los archivos donde más dolería

En orden de daño potencial:

1. **`lib/analytics/dashboards/_scope.test.ts`** — 14 tests **[VERIFICADO]** pinneando el
   invariante de seguridad de **52 call sites reescritos** en `bb680f48`. Si acá hay un test
   que pasa por el motivo equivocado, lo que se rompió es la autorización. **Máxima prioridad.**
2. **`__tests__/check-scope-authz.test.ts`** (22 tests) + `scripts/check-scope-authz.ts`
   (548 líneas) — compuerta de seguridad nacida hoy. Su cuerpo promete *"an empty derivation is
   a failure, not a pass"*. Verificá que exista el test que lo sostiene: una fence que no
   gatea nada y sale 0 es peor que no tener fence.
3. **`__tests__/check-spine-integrity.test.ts`** (7 tests) + `scripts/check-spine-integrity.ts`
   — fence bloqueante con una exención (`seed_tag = 'perf'`). El commit dice que la exención es
   un valor nombrado y **nunca** un prefijo de token *"que cualquier test pueda acuñarse a sí
   mismo"*. Verificá que un `PERF-` en `public_token` efectivamente **no** exima.
4. **`lib/ui/view-scope-descriptor.test.ts`** — **10 tests para un módulo de 511 líneas**
   **[VERIFICADO]**. La relación más flaca del rango, sobre el módulo que define qué significa
   "reproducible" para un artefacto exportado.
5. **`src/modules/panorama/application/__tests__/aggregate-to-department.test.ts`** — el
   invariante de **no ensanchamiento** del fold k-anónimo: un regrupamiento de filas que ya
   pasaron el scope, nunca un ensanchamiento a una unidad que el operador no tiene concedida.
   Es seguridad disfrazada de agregación. Además es el archivo cuyo diff con el stash es puro
   reformateo — chequeá que efectivamente lo sea.
6. **`components/panorama/MapDataTable.test.tsx`** — el archivo en el centro de los incidentes
   de clobber. Hoy tiene 12 tests / 4 describes. **Contálos.**
7. **`src/modules/panorama/domain/__tests__/presets.test.ts`** (55) y **`layers.test.ts`** (41)
   — pinnean el conjunto de capas huérfanas y la polaridad. Si el pin de huérfanas es débil,
   una capa puede volver a quedar invisible sin que nadie se entere.

---

## (d) Lo que queda abierto a propósito

Si COWORK encuentra algo de esta lista, **es confirmación, no novedad**. Está acá para que no
gaste su atención en lo que ya sabemos.

### 1. Una capa huérfana: `acceso-veterinario` — **[VERIFICADO]**

`0a7f9a35` bajó las huérfanas de 2 a 1. `acceso-veterinario` queda afuera **a propósito**: su
polaridad está declarada y los dos mecanismos existen, pero las dos lecturas que la consumirían
no pasan ninguno, y no tiene una meta honesta para montarse. El motivo está escrito en el
preset `desierto-veterinario`. **Se está arreglando en un worktree ahora mismo.**

### 2. La exposición de RLS en staging — **abierta, con instrumento escrito**

27 de 53 tablas `public` con `relrowsecurity = false`. El REST anónimo devuelve **HTTP 206 con
filas completas** de `pets`, `profiles`, `pet_events`, `ownerships` y `audit_log`, incluido el
mail real de un usuario.

- Diagnóstico completo: `docs/reviews/results/2026-07-26-cutover-staging-readiness.md` §B1
- Remediación escrita y **NO ejecutada**: `scripts/ops/staging-rls-remediation.sql` +
  `scripts/ops/staging-rls-remediation.md`
- **Nadie corrió nada contra staging.** Lo corre el PO.
- La causa raíz **sigue sin identificarse**: `DISABLE ROW LEVEL SECURITY` no aparece en ningún
  lado del repo **[VERIFICADO]**. Está fuera del árbol.

### 3. El cutover a staging — no ejecutado

3 migraciones pendientes (`0158`, `0159`, `0160`, ninguna destructiva), la URL estable sirviendo
código de hace 7 días, y **7.089 de 7.099 denuncias con `PANO-` visible en el texto**. Todo en
`f70a4710` / el documento de readiness.

### 4. Dos tests que fallan sólo en corrida completa — **[NO VERIFICADO]**

Pasan aislados, fallan en el run completo. **Hipótesis**: nuestros propios cleanups de
`withMutationOverride` escriben las filas de `audit_log` sobre las que esos mismos tests
afirman.

**Por qué no está verificado y no lo voy a disfrazar**: mi encargo era explícitamente
read-only y sin correr `pnpm verify` ni `pnpm test`, así que **no ejecuté nada**. Tampoco
tengo los nombres de los dos tests. Lo que hay a favor de la hipótesis es circunstancial:
`854f1361` documenta que `pet_events` se alcanza vía `withMutationOverride`, *"the accountable
GUC escape hatch"* en `__tests__/_helpers/db-overrides.ts`.

**Lo que lo resolvería**: correr los dos tests aislados y después con `--sequence.shuffle`, y
comparar el conteo de `audit_log` antes y después. Si COWORK lo confirma, **es un hallazgo
legítimo, no una repetición.**

### 5. El desierto veterinario, después del arreglo — falsa tranquilidad conocida

`44b84d92` arregló el predicado, pero su propio cuerpo dice que el resultado **no des-satura la
capa: mueve la saturación al polo opuesto**, lo cual es *"una FALSA TRANQUILIDAD en vez de una
falsa alarma"*. Está registrado como defecto conocido de la capa. Re-encuadrarlo por mascota
cambia la base de la vista y **es decisión del PO**, no se tomó.

### 6. `stash@{0}` sigue colgado

17 archivos, del 2026-07-26 12:35, sin aplicar. Verifiqué que no contiene nada semántico que no
esté en HEAD. **Borrarlo es una decisión, no una limpieza.**

---

## Anexo — comandos para reproducir todo lo de arriba

Todos de sólo lectura.

```powershell
# El rango, fijado por SHA
git log --oneline 9c7392ef..c9687c9b
git log 9c7392ef..c9687c9b --format='%n===== %h %s%n%b'   # los bodies son la doc real

# La simultaneidad y los huérfanos (§b)
git reflog --date=iso -80
git show --stat a5c9e895      # el commit "docs:" con 8 archivos de código
git show --stat a8b267e1      # su reemplazo: 1 archivo, sólo docs
git show --stat ac37af7c      # el commit que traía dos cambios
git diff ac37af7c 7da1e389 --stat

# Los stashes
git stash list
git stash show --stat "stash@{0}"
git diff HEAD "stash@{0}" --stat
git diff HEAD "stash@{0}" -- package.json     # vacío = idéntico

# Los tres commits que no compilan solos
git log --oneline --diff-filter=A -- lib/ui/view-scope-descriptor.ts
git cat-file -e 7da1e389:lib/ui/view-scope-descriptor.ts       # fatal: no existe
git show 7da1e389:components/panorama/MapDataTable.tsx | rg -n view-scope-descriptor

# El baseline y su archivo
git log --oneline 9c7392ef..HEAD -- scripts/file-size-baseline.json
rg -n PanoramaConsole scripts/file-size-baseline.json
wc -l components/panorama/PanoramaConsole.tsx

# Conteo de tests por archivo tocado en el rango
git diff --name-only 9c7392ef..c9687c9b | rg '\.test\.(ts|tsx)$'
```
