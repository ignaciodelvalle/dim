# COWORK — hallazgos de la revisión externa (2026-07-26)

> Respuesta a `docs/reviews/2026-07-26-guia-revision-cowork.md`. La premisa del PO era
> *"va a volver con hallazgos"*. Volvió con hallazgos.
>
> **Rango revisado**: la jornada completa, `29ea2544..a1f0ec8f` (HEAD al fijar el rango,
> 14:56 ART) — es decir, la guía **más los 5 commits que aterrizaron después de escrita**
> (`ed884329`, `95f3d83a`, `634d0b91`, `1134f5a9` y el merge `a1f0ec8f`), que eran los
> menos revisados y tocan semántica de capas.
>
> **Método**: revisión estática + **ejecución real de las dos suites** en un entorno cloud
> limpio, + verificación empírica de los exit codes de las fences. No se tocó staging
> (decisión del PO para esta sesión). No se pusheó nada; este documento es el único output.

## Cómo leer este documento

- **[VERIFICADO]** — lo comprobé, con el comando o la evidencia al lado.
- **[VERIFICADO EN MI ENTORNO]** — comprobado acá; el entorno difiere del tuyo en lo que
  se declara en §0, así que trasladalo con ese grano de sal.
- **[NO VERIFICADO]** — hipótesis, con el motivo de por qué quedó sin verificar.
- Severidad: 🔴 corregir antes del cutover · 🟡 corregir pronto · ⚪ deuda registrada.

---

## 0. El entorno de ejecución, declarado antes de los números

Los registries de contenedores están bloqueados en este sandbox (ECR y Docker Hub, 403),
así que el stack Supabase real no era montable. Se reconstruyó el contrato de CI sobre
**Postgres 16 nativo en :54322** + un **shim de GoTrue** (~150 líneas, HTTP sobre
`auth.users` real, replicando la semántica INSERT-then-UPDATE de `app_metadata` que
documenta la migración 0134) + `pnpm db:bootstrap` completo (los 4 pasos corrieron;
53 tablas, triggers, storage, 6 usuarios de test).

Tres diferencias con tu entorno que explican TODO el ruido de la primera corrida:

1. **Catálogo INDEC incompleto**: el import vivo devolvió 403 acá y cayó al fixture de
   muestra (53 localidades). El script lo avisa fuerte y honesto — buen diseño.
2. **Sin `seed:demo`** — ver hallazgo H3, porque esto resultó ser un hallazgo, no un detalle.
3. **GoTrue es un shim** — sin flujos de token reales.

### Resultado de suites @ `a1f0ec8f`

| Suite | Resultado | Nota |
|---|---|---|
| `unit` (paralela, sin DB) | **6.706 / 6.706 verde** (478 archivos, 218s) **[VERIFICADO]** | limpio de punta a punta |
| `db` (serial), 1ª corrida | 5.597 verde / 60 rojo (578 archivos, 553s) **[VERIFICADO EN MI ENTORNO]** | **los 60 rojos son ambientales** |
| `db`, 2ª corrida (entorno corregido por etapas) | 5.637 verde / **20 rojo** (553s) | el residuo es exactamente lo no-emulable |

La atribución no es una expresión de deseo: se corrigió el entorno por etapas
(localidades faltantes, endpoint `generate_link` del shim, usuarios fixture filtrados por
corridas abortadas previas) y los rojos **convirtieron a verde en cada etapa** — archivos
en aislamiento: 34 → 8 → 2 → 0 salvo catálogo; corrida completa: 60 → 20. Los 20
residuales se descomponen limpio: 8 = `seed-demo-scenario` (sin `seed:demo`, ver H3),
8 = catálogo INDEC de muestra / cube sin refrescar / mis propias filas `manual`,
3-4 = estado filtrado entre corridas (la misma clase que documenta §(c)). Ninguna falla
sobrevivió a la fidelidad del entorno. **Cero fallas de código real detectadas a HEAD.**

---

## (a) Lo que la guía pedía verificar — veredictos

| Pedido de la guía | Veredicto |
|---|---|
| `MapDataTable.test.tsx` — contá los tests | **12 tests / 4 describes** [VERIFICADO] — sin daño residual del clobber |
| stash: diff de `aggregate-to-department.test.ts` puro reformateo | **[VERIFICADO]** en tu máquina — colapso de argumentos a una línea, cero semántica |
| `check-scope-authz`: "an empty derivation is a failure" tiene test que lo sostenga | **PARCIAL** — ver H6 |
| spine fence: `PERF-` en `public_token` NO exime | **[VERIFICADO]** — `check-spine-integrity.test.ts:35` cubre exactamente eso, con 3 tokens-señuelo (incluido `name: "perf"`) y sólo `seed_tag` eximiendo. Tres esquinas del 2×2 pinneadas. Sólida. |
| `_scope.test.ts` — 14 tests / 52 call sites | La relación es mejor de lo que sugiere el número: `describe.each` × 3 helpers ejecuta 28 grupos, y la cobertura de call-sites vive aparte en `govt-dashboards.test.ts` (drift sweeps con DB real, buenos). Gap chico real: ver H8 |
| los dos tests que fallan sólo en corrida completa (§d.4) | **NO REPRODUCIDO** acá — ver §(c) |

---

## (b) Hallazgos nuevos

### H1 🔴 CI está roto en diferido, dos veces — y nadie lo puede ver porque CI no corre desde el 12-06

`ci.yml` sólo dispara en push/PR a `main`/`develop`. El último push a `main` fue
`02fb1a5d` (2026-06-12). **Todo lo construido desde entonces — 794 commits, las tres
fences nuevas, la suite entera — jamás corrió en CI.** Y cuando esta rama llegue a
`main`, CI va a fallar dos veces, por motivos que no tienen nada que ver con el código
que se esté mergeando:

1. **El job `check` corre `pnpm lint:rls` sin servicio de Postgres.** Medido acá:
   `lint:rls` sin DB alcanzable **sale 1** (sin skip elegante — coincide con lo que
   documentó el readiness doc §B4). El step se agregó en `69f8a133` (2026-07-04), en esta
   rama; el `ci.yml` de `main` es del 12-06: **el step nunca se ejecutó en CI**. [VERIFICADO]
2. **El job `test` no puede pasar en una DB fresca**: ver H3.

Además, la paridad CI ↔ `pnpm verify` que el propio `ci.yml` declara ("Keep CI in parity")
volvió a driftear: `verify` hoy incluye `lint:scope-authz` y `lint:spine`; `ci.yml` no
tiene ninguna de las dos. Las dos fences de seguridad nacidas hoy son exactamente las que
CI no correría. [VERIFICADO — `package.json` vs `ci.yml`]

**Para Claude Code**: (i) darle a `check-rls-coverage.ts` el mismo skip-elegante-y-ruidoso
de sus hermanas (o mover `lint:rls` al job `test`, que sí tiene stack); (ii) agregar
`lint:scope-authz` + `lint:spine` al job `test`; (iii) considerar disparar CI también en
`integration/**` para que esta clase de rotura se vea antes del merge.

### H2 🔴 La séptima instancia de "verde por el motivo equivocado" — en el módulo nacido hoy

La guía documenta seis casos del patrón. Acá va el séptimo, en
`lib/ui/view-scope-descriptor.ts` — el módulo cuya promesa entera es la reproducibilidad
de un artefacto exportado:

**El round-trip de `parseViewScope` no puede detectar que el parser DESCARTE
`basis`, `verifiedOnly` o `encoding`** — porque el fixture usa exactamente el valor
que el parser pone por defecto cuando el campo falta. [VERIFICADO]

| Aserción (`view-scope-descriptor.test.ts`) | Valor del fixture (:72–:76) | Fallback del parser (`:363–:367`) | ¿Falla si el parser tira el campo? |
|---|---|---|---|
| `:97` `rebuilt.basis` | `"valid"` | `?? "valid"` | **NO** |
| `:99` `rebuilt.verifiedOnly` | `false` | `=== true` → `false` | **NO** |
| `:101` `rebuilt.encoding` | `null` | `?? null` | **NO** |

La tabla de mutaciones (`:230–:239`) muta esos tres campos pero sólo compara **strings
serializados** — el lado serialize está custodiado, el lado parse no. Borrá las lecturas
de las líneas 363 y 367 del módulo y las dos suites quedan verdes. Es el caso #5 de la
guía (fixture débil) con disfraz nuevo: el fixture igual al default.

En el mismo módulo, acumulado: el default de `grain` faltante → `"province"` (`:360`)
**contradice la doctrina "refusing beats defaulting"** que el propio archivo declara
(`:319`) — un descriptor sin `grain` reproduce silenciosamente un choropleth de provincia
donde se firmó uno de departamento, que es literalmente el escenario que el test de
divergencia C3 dice prevenir; 6 de los 7 throw-paths de `parseViewScope` sin test; las
ramas admin de `describeViewScope` / `isNarrowedBelowMandate` sin test; 5 de las 6 líneas
del header CSV sin aserción; el período `custom` sin round-trip (dos rangos custom
distintos serializando igual pasarían inadvertidos); `parseViewScopeFromCsv` promete
"a malformed block still throws" en su docblock y no tiene ningún test. [VERIFICADO]

**Para Claude Code**: fixture con valores ≠ default (`basis: "transaction"`,
`verifiedOnly: true`, `encoding` no-nulo), aserciones parse-side en la tabla de
mutaciones, y decidir con el PO si `grain` faltante debe tirar (yo diría que sí — es la
doctrina escrita).

### H3 🔴 `pnpm test` verde no es reproducible desde `db:bootstrap` — la DoD depende de estado manual

`__tests__/seed-demo-scenario.test.ts` (11 tests) afirma artefactos del seed demo
(mascotas `DEMO-`, suscripciones de alerta de `admin@dim.test`, `event_amended` en CABA)
que **ni `db:bootstrap` ni el propio archivo crean**, y **no tiene ningún guard de skip**.
[VERIFICADO — acá fallaron 8/11 contra una DB recién bootstrapeada; no hay `skipIf` ni
`beforeAll` que siembre; `seed:demo` no aparece en `ci.yml`]

Consecuencia: la evidencia de la DoD ("pnpm test verde") sólo es alcanzable en una DB
donde alguien corrió `pnpm seed:demo` a mano — hoy, tu stack local de larga vida. El
recetario de CI (supabase start → db:bootstrap → test) produce rojo. Es la versión
suite-entera del caso #3 de la guía (la matriz RLS que sólo pasaba con la tabla vacía):
**un verde que depende de estado que nadie declaró.**

**Para Claude Code**: o `db:bootstrap` gana un paso demo-seed, o la suite gana un
`describe.skipIf(sin datos DEMO)` con un log fuerte, o los 11 tests se mueven a un
target aparte (`test:demo`). Cualquiera de las tres, pero decidido y escrito.

### H4 🟡 El smoke de cutover no puede morder: `qa-vis.ts` sale SIEMPRE 0

La guía presenta el smoke (`8e72f7cf` + `c9687c9b`) como fence: *"una fence mal hecha es
peor que ninguna: da permiso"*. Medido contra el código del driver:

- el loop de steps hace `catch` → loguea `STEP FAILED` → **continúa** (`qa-vis.ts:278–:285`);
- los `eval` (canvas>0, `rawFourDigit`, `protegido`) **sólo se imprimen** — no hay step
  de aserción en el vocabulario del driver (goto/wait/shot/hover/click/sleep/text/eval);
- el final es incondicional: **`process.exit(0)`** (`qa-vis.ts:301`). [VERIFICADO]

El diseño documentado es honesto ("Read every PNG" — es un harness de evidencia para
humanos), pero el título del commit ("make the cutover smoke's checks actually bite") y
su lugar en la lista de fences invitan a confiarle un rol de gate que no cumple: metido
en un pipeline, es verde con las seis superficies rotas.

Dos detalles más del mismo archivo: `"out": "C:/Users/ignac/.claude/jobs/ef3dba5c/tmp/cutover"`
— una ruta absoluta de TU máquina, atada a un job-hash efímero, commiteada al repo
[VERIFICADO]; y el requisito "run this step signed OUT" del paso `/login` vive sólo en un
`_why` — el runner no lo fuerza.

**Para Claude Code**: un step `"assert"` en el driver (expr + expected, exit 1 al final si
alguno falló — manteniendo el catch-and-continue para que el reporte sea completo), `out`
relativo al repo, y un flag de contexto fresco para el paso anónimo.

### H5 🟡 El replay `asOf` del desierto veterinario viaja en el tiempo sólo con el numerador

`634d0b91` (post-guía). La nueva métrica es correcta y está bien testeada en lo esencial
[VERIFICADO — leí `vet-desert-unattended.test.ts`: floor real del período, exclusión de
fallecidas con el fixture 6+4 que reportaría 40% si diluyera, COUNT DISTINCT por mascota,
k-anon sobre el universo activo, scope en numerador Y denominador]. Pero el claim
"`asOf` moves `until`, replaying the share as of t" sobreafirma:

- el **numerador** sí viaja (eventos filtrados a `[since, until=asOf]`);
- el **denominador** es la población activa **DE HOY** (`pets.status` actual, sin cota
  temporal): una mascota registrada ayer integra el denominador de un replay de hace
  6 meses, y una fallecida la semana pasada queda excluida de un replay en el que estaba
  viva. [VERIFICADO — condiciones de `loadVetDesertByProvince`; el test `:225` ("nobody
  attended yet" → 100%) pasa precisamente porque las mascotas del fixture existen HOY]

Con los frames temporales como feature de primera clase desde `a3070f1a`, la pantalla
está afirmando un replay que los datos sólo sostienen a medias — la clase de defecto que
esta jornada se dedicó a cazar (Tema 3 de la guía). No es grave hoy (la demo no explota
esa esquina); es exactamente el tipo de deuda que este repo registra en vez de heredar.

**Para el PO**: decidir el encuadre — (a) denominador as-of-t (mascotas registradas antes
de t y no fallecidas a t: más caro, replay honesto), o (b) que el caption del frame no-live
diga "población actual, actividad a la fecha del frame". La (b) es una línea de copy.

### H6 🟡 "An empty derivation is a failure, not a pass" — la mitad del claim no tiene test directo

El `exit 1` con derivación vacía **existe en el script** (`check-scope-authz.ts:432–:441`)
[VERIFICADO], pero vive en `runCheck()`, que ningún test ejecuta. Lo que el test pinnea
(`check-scope-authz.test.ts:124` "the fence's live derivation") es el ESPÍRITU: deriva
sobre los archivos reales y exige `pets` + `pet_events` presentes — si un refactor vacía
la derivación, ese test cae. Cobertura razonable, pero si `runCheck` algún día divergiera
de la secuencia que el test replica (leer otra lista, tragarse el caso vacío), los tests
seguirían verdes. Nota menor adicional: el heurístico de `isUnconditionalRead` normaliza
`true`/`(true)`/null pero un `USING (1=1)` lo evade — pg lo almacena tal cual.

Del mismo par de fences, una asimetría que vale la pena cerrar: **`lint:scope-authz`
rechaza hosts remotos sin `--allow-remote`; `lint:spine` no tiene ese guard** — audita lo
que diga `DATABASE_URL`. Una consola con el pooler de staging seteado (el runbook te la
deja así, §B4 del readiness) que corra `pnpm verify` va a ver `lint:spine` consultar
staging y **fallar con las 13 huérfanas del seed viejo** — media hora de fantasma nueva,
misma clase que la trampa B4. [VERIFICADO — `check-spine-integrity.ts` usa el URL crudo
sin chequeo de host]

### H7 🟡 Fence de disciplina de scope: `govt-home-kpis.ts` quedó fuera del territorio

`check-scope-discipline.ts` escanea **sólo** `lib/analytics/dashboards/*.ts`
[VERIFICADO — glob en `:202`]. `lib/analytics/govt-home-kpis.ts` (los KPIs del home de
/gob, sobre `cases`) define su propio `casesScopeClause(ctx)` privado con el drill de
admin escrito a mano — el patrón exacto que C3 mató en los otros cinco módulos, un
directorio más arriba de donde la fence mira. La rama de subsunción sí delega en el
helper compartido, así que hoy no hay bug de visibilidad; pero los predicados de ese
archivo pueden driftear sin que ninguna fence lo note. Extender el glob (o mudar el
helper a `_scope.ts`) es barato.

### H8 ⚪ Ampliaciones de la lista (c) de la guía — tests que no presionan lo que titulan

Del barrido sobre los archivos que la guía priorizó (verificado por partida doble:
subagente de auditoría + spot-checks míos):

1. **`presets.test.ts:332`** ("a framing value… is a valid PresetFraming shape") — **el
   cuerpo del loop nunca se ejecuta**: los 15 presets son `national` o sin framing; el
   único `kind: "bbox"` del módulo es la unión de tipos. El test afirma exactamente nada.
   [VERIFICADO — grep: 1 sola ocurrencia de `kind: "bbox"` en `presets.ts`]
2. **`aggregate-to-department.test.ts`** — el describe "non-widening invariant" (`:186`)
   **restatea** el invariante en vez de presionarlo: no existe fixture con un departamento
   fuera-de-grant que NO deba aparecer; "conserves the total count" pasaría con las tres
   provincias colapsadas en un blob nacional; el test multi-eje de `:227` nunca afirma los
   counts por celda. La única aserción que de verdad presiona el ensanchamiento es la de
   `:59` (orphan bucket), que vive FUERA del describe de seguridad. El header de seguridad
   (`:170–:184`) promete más de lo que la suite prueba.
3. **`MapDataTable.test.tsx:93`** ("omits the column entirely…") — pasa con tabla vacía
   (el empty-state no renderiza ningún columnheader) y su fixture difiere en DOS ejes del
   positivo (gap Y cantidad de capas): si `showGapColumn` se acoplara alguna vez al conteo
   de capas, nadie lo vería. Anclarlo con un positivo (`Unidad` presente) + un fixture
   `GAP_ROWS` sin `gap` lo arregla. El resto del archivo está bien — celdas renderizadas,
   no tooltips: el antídoto de `438e40cb` se respetó.
4. Menores: `layers.test.ts:333` titula "all 8 point layers" y son 9; `presets.test.ts:241`
   titula "all 6 presets" y recorre 15; `presets.test.ts:634` usa `toBeFalsy()` donde sus
   vecinos pinnean exacto.

**Lo fuerte, para que conste**: el pin de huérfanas es **igualdad exacta contra `[]`**
(`presets.test.ts:551–:556`) — el claim "zero orphan layers" del merge está genuinamente
enforced, una capa nueva sin vista rompe el pin; y la polaridad es un **set exacto**
(`layers.test.ts:239–:246`: `["acceso-veterinario", "indice-territorial"]`). `ed884329`
además cierra de verdad el motivo por el que `acceso-veterinario` no podía tener vista
(el call-site tiraba el flag `invert` al piso; ahora se propaga a ramp, ranking y tabla,
con tests). [VERIFICADO]

### H9 ⚪ `_scope.test.ts`: dos helpers exportados quedaron fuera del `describe.each`

`casesScopeClause` y `petsCurrentJurisdictionClause` se exportan de `_scope.ts` y no
están en `HELPERS` (:53–:57). Tienen cobertura indirecta real (drift sweeps DB-backed en
`govt-dashboards.test.ts`, `jurisdiction-pair-clause.test.ts`), así que no es un agujero —
pero agregar `casesScopeClause` a la tabla cuesta una línea y le compra las 7 garantías
contractuales (drill inerte para govt incluida) al helper de la tabla más sensible.

### H10 ⚪ Robustez de `db:bootstrap`: un push a medias sigue como si nada

Observado acá: `drizzle-kit push` puede fallar a mitad de la aplicación (en mi caso,
`public.immutable_unaccent` inexistente en una DB virgen — la función nace en la
migración 0146, el schema declara índices que la usan: huevo-y-gallina que el stack real
no ve porque el replay de migraciones lo tapa) **y aún así salir 0**; el bootstrap
declara "FATAL" sólo con exit ≠ 0 y sigue. En CI lo rescata el replay del paso 2; el modo
de falla es invisible. Barato de cerrar: contar tablas esperadas vs creadas al final del
paso 1, o al menos grep del stderr de push por `PostgresError`.

---

## (c) Los dos tests de §d.4 — lo que se pudo y no se pudo

**No reproducido.** [NO VERIFICADO — y el motivo importa: mi corrida completa tuvo 60
rojos ambientales que contaminan cualquier señal de orden; sin los nombres de los dos
tests, "falla en full run / pasa aislado" no es distinguible del ruido de catálogo]

Lo que sí dejó esta corrida, y es evidencia **a favor** de la clase de hipótesis:
`__tests__/govt-assignments-locality-integrity.test.ts` falló acá por una fila
`TEST-SS-SoleCov` que un archivo ANTERIOR de la corrida dejó viva al abortar — un test
que falla **por lo que otro archivo escribió antes**. El mecanismo (estado compartido de
la corrida serial filtrándose entre archivos) es exactamente el que la guía hipotetiza
con los cleanups de `withMutationOverride` sobre `audit_log`; 148 archivos de test usan
ese helper. [VERIFICADO EN MI ENTORNO]

**El experimento sigue siendo el que la guía escribió** (correr los dos aislados +
`--sequence.shuffle` + comparar counts de `audit_log` antes/después), y necesita tu
stack, donde los dos tests tienen nombre. Si me pasás los nombres la próxima sesión, lo
cierro.

---

## (d) Decisiones que quedan en tu cancha

1. **`stash@{0}`: borralo.** La guía lo dejó como decisión abierta; desde entonces hay un
   dato nuevo que la resuelve: el reframing del desierto (`634d0b91`) **superó** el
   contenido del stash — hoy contiene el test viejo (`vet-desert-recency`, 171 líneas que
   ya no existen en HEAD) y la implementación anterior del loader. Ya no es "nada
   semántico varado": es código activamente obsoleto que un `stash pop` distraído
   aplicaría sobre la implementación nueva. `git stash drop 'stash@{0}'`.
   [VERIFICADO — `git diff HEAD stash@{0} --stat` en tu máquina, hoy]
2. **La Fase 0 del cutover (RLS de staging) sigue abierta** — no la toqué por tu decisión
   de esta sesión. Nada de lo que vi cambia la recomendación del readiness doc: antes del
   cutover, no después.
3. **H5**: encuadre del replay `asOf` (denominador as-of-t vs una línea de copy honesta).
4. **H3**: cuál de las tres salidas para `seed-demo-scenario`.

## (e) Orden sugerido para Claude Code

| # | Qué | Por qué primero |
|---|---|---|
| 1 | H1 — CI: skip elegante en `lint:rls` (o moverlo al job `test`) + `lint:scope-authz`/`lint:spine` en CI + trigger en `integration/**` | Es lo único que está roto *hacia adelante*: el primer PR a main nace rojo |
| 2 | H2 — fixtures ≠ default en `view-scope-descriptor` + throw-paths + decisión `grain` | Módulo de hoy, promesa central, séptima instancia del patrón |
| 3 | H3 — contrato de `seed-demo-scenario` | Hace la DoD reproducible; desbloquea el verde real de CI |
| 4 | H4 — step `assert` en `qa-vis` + `out` relativo | Antes de que el smoke se use en el cutover real |
| 5 | H6 — guard remoto en `lint:spine` | Una consola staging-contaminada corriendo `verify` es un incidente que ya casi pasa (§B4) |
| 6 | H7, H8, H9, H10 | Deuda registrada, barata, ninguna urgente |

---

## Anexo — reproducir lo de arriba

```powershell
# H1: el exit code de lint:rls sin DB (apagá el stack primero)
pnpm lint:rls ; echo $LASTEXITCODE        # → 1 (sus hermanas: lint:spine=0, lint:scope-authz=0)

# H1: el step nunca corrió en CI
git log -S 'lint:authz && pnpm lint:rls' --format='%h %ad' -- .github/workflows/ci.yml   # 69f8a133 2026-07-04
git log -1 --format='%ad' origin/main -- .github/workflows/ci.yml                        # 2026-06-12

# H2: el fixture igual al default
#   lib/ui/view-scope-descriptor.test.ts:72-76  vs  lib/ui/view-scope-descriptor.ts:363-367

# H3: la suite demo contra una DB sin seed:demo
#   __tests__/seed-demo-scenario.test.ts — no hay skipIf/beforeAll; ci.yml no menciona seed:demo

# H4: el exit incondicional
#   scripts/qa-vis.ts:278-285 (catch→continue) y :301 (process.exit(0))

# H8.1: el loop que nunca entra
rg -c 'kind: "bbox"' src/modules/panorama/domain/presets.ts    # 1 (la unión de tipos)

# (d).1: el stash superado
git diff HEAD 'stash@{0}' --stat | tail -3
```
