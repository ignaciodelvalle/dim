# Loop de pulido pre-Cowork — brief de la mañana

**Corrida autónoma del 2026-08-09 (noche) al 2026-08-10.** 35 commits desde `6e9eb29b`.
Seis reviews adversarias de contexto fresco, un fence nuevo, un test nuevo, una migración.

---

> **Adenda — las cuatro decisiones se tomaron y se ejecutaron el 2026-08-10.**
> D2 (secuenciar los proyectos de vitest), D3 (`/gob/observaciones`), D4 (la
> deriva del padrón: era omisión del seed) y E-3 (el orden del hero: paga
> desktop) están cerradas, con el gate verde encima: **1227 archivos, 14792
> tests, exit 0**. Queda D1 — aplicar la migración `0171` — que es tuya, y E-2
> (el radio de chip), que sigue siendo decisión de diseño. Lo que sigue abajo es
> el registro de por qué se decidieron así.

> **Adenda 2 — segundo tramo del 2026-08-10 (noche).** D1 se aplicó (`0171` en
> staging, `db:doctor` limpio). E-2 se cerró, y **al revés de como estaba
> escrito**: el hallazgo medía archivos por su NOMBRE, no chips, y "converger
> todo a píldora" contradecía una decisión previa tuya (X2-S2, 29/07). Ver §5.
> Además cerró el **Lote E paso 2** (−12.955 B acumulados por ruta) y el **rojo
> de e2e**, que resultó ser un solo defecto con tres caras: **45 → 15 → 0
> esperadas**. Ver §6. Lo único que queda de tu lado es **desplegar staging**.

## 1. Lo que depende de vos

### D1 — Aplicar la migración `0171_avatars_bucket.sql` · **recomendada: sí, ya**

Subir la foto de perfil desde `/cuenta/editar` **nunca funcionó, para ningún usuario**: el bucket `avatars` no existe ni en local ni en staging. La migración lo crea privado con políticas por dueño. Escribir la migración es trabajo mío; aplicarla en remoto es tuyo.

> Lo que vale releer: el docstring del use-case dice *"If bucket is missing, uploadAvatarForUser fails gracefully"*. El autor **anticipó** el bucket faltante y construyó la degradación. Nadie creó el bucket, así que el camino degradado quedó como el único, y la falla fue silenciosa por diseño.

### D2 — Los proyectos de vitest corren en paralelo contra una posta serial

El rojo del `PanoramaConsole` no era flake: el proyecto `db` **solo** pasa entero (686 archivos, 6985 tests), y falla 2 de 2 en corrida completa. El proyecto `unit` corre en paralelo y satura la máquina mientras `db` tiene la posta. Puse una mitigación de 30s y lo dejé documentado con el bisect.

| Opción | Qué gana | Qué cuesta |
|---|---|---|
| **Secuenciar los proyectos** *(recomendada)* | El rojo desaparece de raíz; `db` obtiene el aislamiento que ya declaró querer | Más tiempo total de suite |
| Dejar la mitigación | Cero trabajo | El próximo que lo vea rojo va a subir el timeout una cuarta vez |

### D3 — `/gob/acciones` manda al funcionario a una pared

El botón "Cerrar" de una observación antirrábica emite `/admin/observaciones/...`. La **página** admite rol gobierno; el **layout de `/admin`** exige admin y lo rebota a la home antes de que la página corra. No existe `/gob/observaciones`.

| Opción | |
|---|---|
| **Crear `/gob/observaciones`** *(recomendada)* | Es la superficie que falta; el trabajo real es el layout, la página ya permite govt |
| Que el worklist no emita ese href para govt | Una línea, pero le saca al funcionario una acción que sí le corresponde |

Por ahora quedó **escrito en el brief de Cowork** (hito L5b) para que lo reporte como defecto del producto y no como error suyo.

### D4 — La deriva de caché del padrón

**2.733 mascotas (8,4%) tienen `death_recorded` en la espina y `status='active'` en la caché.** Vienen del seed `panorama-hist`. Dos consecuencias:

- El test de deriva escanea sólo tokens `DIM-%` — **43 de 32.430**. La clase excluida es exactamente la que deriva.
- El coropleta de mortalidad lee la caché (**352**) y la línea de tiempo de la misma pantalla lee la espina (**3.946**). Factor 10, misma etiqueta.

Necesito tu decisión sobre si los 2.733 son **intención del seed** o **omisión**: `scripts/seed-panorama.ts` dual-escribe en un camino (`:1955`) y no en otros (`:2131`, `:2222`). Según cuál sea, el arreglo es el seed o es el detector.

### D5 — Alcance del resto

Quedan **~40 hallazgos verificados sin arreglar** (sección 3). Ninguno bloquea a Cowork. Decime si querés que siga por el loop o que pare acá y larguemos el test.

---

## 2. Lo arreglado

### Bloqueaban a Cowork

| # | Qué estaba roto | Evidencia |
|---|---|---|
| 1 | **Ningún decomiso podía ejecutarse jamás.** `ATTACHMENT_BUCKET` apuntaba a `pet-attachments`, bucket inexistente en local **y** staging. La evidencia se sube antes de la transacción y es requisito duro server-side | El string aparecía en **un** lugar de todo el repo: la constante. Las 408 filas del seed las escribió un script, salteando la acción |
| 2 | **Los cuatro drivers de navegador no podían ni loguearse.** El botón "Mostrar contraseña" comparte el `aria-label` con el campo → strict-mode violation | `qa-vis`, `qa-panorama-vis`, `qa-panorama-chaos`, `report-panorama-a11y`. Nadie los había corrido desde que el toggle aterrizó |
| 3 | **V1 no lo podía ejecutar nadie.** Mi corrección de ayer (prohibirle a Alejo atender) chocó con que `appointment.manage` no está en las capacidades implícitas del vet | Se convirtió en dos hitos nuevos (V0/A-0) sobre el flujo de permisos, que no tenía ninguno |
| 4 | **La cuenta del funcionario estaba mal.** El brief decía `govt-local@`, que no cubre Recoleta. Lucas real es `lucas@` con cinco localidades de CABA | Verificado contra la base de staging |

### El fence nuevo, y los seis gemelos que encontró

`scripts/check-degraded-chrome.ts` — el blind spot que el repo confesaba por escrito. Diez pantallas se habían arreglado **a mano** el 9/8; el detector encontró **seis más** que ese barrido se salteó, todas la misma forma: un `OpFilterBar` que no depende de nada, tirado al degradar.

`/gob` · `/gob/analytics` · `/gob/vigilancia` · `/admin/censo` · `/admin/poblacion` · `/admin/programa` — más una séptima que el prototipo no vio: `/cuenta` perdía su `<h1>`.

Ancla en el binding del wrapper de presupuesto (no en el fallback), análisis de taint para distinguir ausencia legítima de bug, baseline de triples `(archivo, componente, chrome)` en vez de conteo, y piso duro de 25 ramas. **El piso atrapó un bug mío en la primera corrida.**

### Los fences que declaraban menos de lo que prometían

Seis más, sobre los cinco de ayer:

- **`check-ui-invariants`, regla de acentos** — el peor. `isCodeOnlyLine` descartaba la **línea entera** al ver `className=`. En un codebase Tailwind eso es **32,4% de las líneas .tsx**, sesgado exactamente hacia las que llevan copy. Había una instancia viva en `/gob/disputas` mientras el fence imprimía "accents OK". Con la red más ancha entran 37 sustantivos y adjetivos nuevos.
- **`check-authz-guards`** — el de mayor blast radius, probaba `fn.body` **crudo**: un guard nombrado en un comentario contaba como llamada.
- **`check-atender-owner-alerts`** — promete atrapar al writer de walk-in "se llame como se llame"; matcheaba una sola forma de declaración.
- **`check-db-budget`** — `stripNonCode` no tokenizaba literales regex (10 archivos rotos → 0), y el discovery ignoraba `Promise.allSettled`, que es lo que la convención del propio repo prescribe.
- **`check-view-scope`** — podía pasar en verde habiendo escaneado cero archivos.
- **`RAW_BUTTON_BASELINE`** decía 47 y la cuenta real era 25: **22 botones crudos de margen**, y el test era lo que protegía el hueco.

### Defectos de producto

- **El diputado confundido que el fence no podía ver.** `requestCapabilityAction` resolvía la organización por la membresía por defecto de la sesión, ignorando la URL. Un miembro de dos orgs, parado en `/org/{A}`, solicitaba contra `{B}` sin señal visible. Lo interesante es **por qué el fence no lo veía**: decide si una acción es org-scoped buscando un token en la firma, y esta no lo tenía — abandonar el contexto por completo la hacía **más** invisible que hilvanarlo mal. Y no era hipotético: el admin del elenco pertenece a **cuatro** organizaciones, y el hito A-0 que escribí anoche le pide aprobar un permiso justo desde ahí.
- **El bug de género más público del producto.** `generateMetadata` de `/p/[publicToken]` decía *"está perdida. Si la viste"* para **toda** mascota extraviada — el query ni siquiera seleccionaba `sex`. Es la tarjeta que publican WhatsApp y Google: el cartel de "se busca" de un perro macho salía en femenino en el único lugar donde más gente lo ve.

- **La vacuna se firmaba como profesional sin matrícula.** `attendance.ts` derivaba la procedencia del rol de membresía y del flag `verified` de la **organización**. Un voluntario en un refugio verificado producía `institutional_verified` — el tier más alto — sin matrícula en ninguna parte. Limpiaba el gate oficial de "al día", cuya propia copy promete lo contrario.
- **Retirar una disputa no tomaba el `FOR UPDATE`** que su gemelo sí toma. Lost update sobre titularidad: el expediente terminaba diciendo "Retirada — sin resolución" sobre un animal que cambió de dueño.
- **La notificación urgente al ex-dueño de un decomiso apuntaba a un 404.** `canReadCase` exige una ownership viva y el paso anterior acababa de cerrarla.
- **Tres degradados** dejaban al usuario sin salida (`/gob/reglas` sin título, `/mis-mascotas` sin buscador ni CTA, `/org/.../mascotas` sin filtros).
- **Cuatro acentos** en superficie de gobierno, tres invisibles para el fence hasta ensancharlo.
- **El censo de organización** escribía "Otros" con el diccionario diciendo "Otras".

### El plan de pruebas

Seis hitos que el producto **no podía satisfacer** (atender-es-firmar, documento de viaje inexistente, devolver-adopción del lado equivocado, decomiso sin rol, métrica de alerta que no existe, observación sin botón de inicio), más una precondición que bloqueaba una línea entera (nadie tiene DNI verificado). Y el contrato de reporte: URL, hora, y separación OBSERVACIÓN/HIPÓTESIS/SUGERENCIA — la corrida anterior emitió cuatro hallazgos con buena observación y causa equivocada.

---

## 3. Detectado y **sin** arreglar

Ordenado por severidad. Nada de esto bloquea a Cowork.

### ALTA

| Dónde | Qué |
|---|---|
| `cron-dispatcher` | Los jobs #2 y #3 declaran 45s cada uno contra un presupuesto de 55s y un lambda de 60s. Un kill por timeout no es excepción de JS: la fila queda en `running` para siempre. Los jobs 3-22 nunca corren ni se marcan como salteados — incluidos la purga de retención (#20) y el propio monitor de la flota (#22), que se starvea a sí mismo |
| Notificaciones | **98,4%** son best-effort post-transacción con `catch` que sólo loguea. No hay ningún job que compare hechos contra notificaciones: "el hecho existe y el aviso no" no lo descubre nadie |
| `check-authz-guards` | No puede ver los **33 `route.ts`** (descubre por `"use server"`). Instancia viva: `libreta-export/route.ts` no chequea `deletedAt`, así que un titular que ejerció supresión ARCO sigue pudiendo bajar el PDF completo |
| Decomiso | Reasignar a otro refugio **inutiliza permanentemente** la aceptación: inserta una segunda propuesta sobre el mismo caso, y el validador trata esa forma como corrupción. El cron modela la misma forma como estado normal |
| Turnos | Atender **no notifica al dueño**. El gemelo walk-in sí lo hace desde el 16/7 |
| Panorama | El sello de frescura del cubo llega a **un** componente, dentro de un panel que hay que abrir. El PNG y el informe imprimen "Datos al {hoy}" sobre un cubo de ayer |
| Panorama | La defensa contra diferenciación temporal (`suppressDelta`) existe y tiene **un solo consumidor**. Pedir ene–dic y jul–dic recupera ene–jun, un número que k=5 nunca mostró |
| Geo | **Almirante Brown (BA)** tiene polígono y cero localidades: el cuarto partido del GBA se pinta permanentemente como "Sin datos" |
| `decideCapabilityAction` | El gemelo del diputado que sí arreglé: mismo patrón de sesión-default. Sin escalada (el use-case falla cerrado) pero un admin multi-org que abra permisos de una org que no es su default **no puede decidir nada**, y auditoría y notificaciones quedan atadas a la org equivocada |
| 3 pantallas de operador | `admin/casos`, `admin/historial/ActividadScreen` y `gob/historial` **no tienen wrapper de presupuesto**, así que tampoco tienen rama degradada. No pierden la barra de filtros: pierden la página entera, con el skeleton colgado. Es peor que el defecto para el que construí el fence — y el fence sale verde porque una página sin wrapper no tiene nada que juzgar |
| Exports | 7 rutas de export, **2 acotadas**. Las cinco restantes corren los mismos agregados desde el mismo botón |
| Portal `/org` | 47 puntos de entrada, **3 acotados**. El peor: el detalle de mascota con 11 awaits pesados |
| `generatePppExportAction` | Capacidad completa y **cero entrada**: genera el PDF RUPPPA CABA (Ley 5470), lo firma y lo audita. Ningún componente la invoca. `AGENTS.md` la describe como placeholder — la descripción es falsa en la dirección peligrosa |
| `SuccessScreen` | Falta en 4 trámites de peso: aceptar transferencia de custodia, decidir postulación de adopción, aceptar devolución y crear un decomiso (que tiene el `publicCode` y lo tira a la URL) |
| CTAs desnudos | «Aceptar» y «Rechazar» solos en 7 pares de decisión — «Aceptar» es literalmente el ejemplo prohibido en `AGENTS.md` |
| Género | 5 lugares más: el share de WhatsApp del wizard de perdida, "Marcar como encontrada" ×4 en la sheet, los dos gemelos de match de intake, y el `alt` de Pampa en la landing |

### MEDIA

Import CSV: si una tanda lanza, el wizard queda colgado para siempre y se pierde el reporte de lo ya escrito · `validateIntakeCsvAction` emite hasta 400 consultas secuenciales sin presupuesto · Borrar una regla de agenda no toca los cupos ya materializados: 60 días siguen reservables · El QR de check-in codifica un esquema que nadie registra y el código de respaldo no lo acepta ninguna pantalla · `app/org/[orgToken]/layout.tsx` tiene tres `await` sin deadline antes del bloque acotado · Doble submit del decomiso "animal sin registrar" crea dos animales · Enums crudos en inglés en el expediente de disputa, y la notificación al ciudadano dice "Resolución: case_dismissed" · Retirar una disputa no notifica a nadie · 14 etiquetas de departamento caen fuera de su polígono (La Plata, 15,5 km) teniendo el arreglo ya en el repo · `k=5` está tipeado tres veces sin fence · ARCO no borra Storage ni redacta `audit_log` · `/org/**` no tiene ningún mecanismo de frescura.

### BAJA

El reporte de import miente "Importada" en una re-corrida · La ruta de vet independiente es inalcanzable pero cinco superficies la renderizan · `MapDataTable` no es alcanzable por teclado — y es el equivalente accesible del mapa · `db:doctor` no corre en ningún gate · La forma del token público sólo la sostiene la convención.

### Lo que el test de Cowork seguiría sin probar

`/libreta/compartir/[shareToken]` (share revocable, cero hitos — si el revoke no revoca es fuga de PII con link vivo) · publicar un servicio y definir agenda (declarado "ya hecho" porque los **datos** se sembraron, no porque la pantalla se haya usado) · `/gob/disputas` · el flujo de permisos de organización · `/mudanza` · imprimir el cartel de perdido · moderación · **accesibilidad completa** (teclado, contraste, PDF) · **viewport móvil, que el brief no menciona ni una vez**.

---

## 4. Estado del gate y del entorno

**Gate verde de punta a punta**, corrida final:

```
Test Files  1226 passed | 1 skipped (1227)
     Tests  14791 passed | 15 skipped | 5 todo (14811)
reported 1227 file(s); 1227 discovered; 0 failing test(s)
every test file ran, nothing failed.
GATE_EXIT=0
```

El conteo de archivos importa tanto como el de tests: el runner arreglado el 09/08 es lo que hace verificable que **corrieron los 1227** y no una fracción.

**Árbol limpio**, sin archivos sueltos. **19 commits sin pushear** — el push quedó bloqueado por el clasificador de permisos, hay que correrlo a mano.

**Staging** (deploy anterior, sin los 19 commits): raíz, credencial de Pampa, `/perdidas` y `/adoptar` en 200; los chunks de la home resuelven 200 (no es un build podrido); **1752 turnos reservables futuros**. El elenco de siete cuentas verificado: existen, confirmadas, sin bloqueos, `Test1234!` entra en todas.

**Lo que falta para que staging refleje esta noche**: `git push` y el deploy. Ojo con `deploy:staging` — ahora corre `pnpm verify` entero (antes corría 1 de 49 fences), así que tarda más y es a propósito.

---

## 5. Lo que NO se ejecutó, y por qué

- **#41 y Lote E** quedaron **diseñados y refutados**, con sus números medidos, en `docs/plans/PENDIENTES.md`. Los dos volvieron de la refutación con el trabajo *cambiado*, no confirmado: #41 resultó ser una sola acción (la nota) en vez de tres, porque el kind al que iban escalar y cerrar tiene cero filas; y Lote E cambió de instrumento, porque INP no es reproducible entre corridas y una reja que oscila entrena a todos a ignorarla. Ejecutar cualquiera de los dos a las 6 de la mañana, desde un diseño que su propio escéptico marcó como bloqueante, habría sido exactamente el error que este loop existe para no cometer.
- **El HEIC (D4)** sigue diferido por decisión previa. Es el único ítem abierto con consecuencia de privacidad viva.
- **Cuatro reviews quedaron sin triage completo** de sus hallazgos MEDIA y BAJA: están enumerados en la sección 3 y en la cola, pero no los verifiqué uno por uno. Todo lo de la sección 2 sí lo verifiqué o lo refuté antes de tocarlo.

---

## 6. Segundo tramo — 2026-08-10, noche

Cuatro cosas cerraron. Tres de ellas cambiaron de forma al ejecutarse, y ese
cambio es la parte que vale leer.

### 6.1 Lote E paso 2 — la tabla sale del bundle

`MapDataTable` pasó a `next/dynamic` dentro del pane "Registros", que se monta
sólo cuando el operador abre ese tab (el dock renderiza un único pane y el
default es "stats").

**Diferir el componente solo no habría bajado un byte.** `PanoramaConsole`
importaba `useMapTableCsvHref` del mismo módulo para el botón "Exportar CSV" de
la barra del dock, que sí está siempre montada: el módulo seguía enganchado por
la otra punta. El hook y el contrato de datos salieron primero a
`map-table-csv.ts`, y recién ahí la frontera perezosa muerde.

| | `/admin/panorama` | `/gob/panorama` |
|---|---|---|
| Antes del Lote E | 242.526 B | 243.142 B |
| Paso 1 (MapLegends) | 232.580 B | 233.196 B |
| Paso 2 (MapDataTable) | **229.571 B** | **230.187 B** |
| Acumulado | **−12.955 B** | **−12.955 B** |

Confirmado estructuralmente, no sólo por el número: el chunk `31078` lleva la
copia del estado vacío de la tabla, existe en `.next/static/chunks` y **no**
está en el manifiesto de la ruta.

### 6.2 E-2 — el radio de chip, ejecutado al revés de como estaba escrito

La decisión registrada era "converger todo a píldora". **No se hizo, y hay dos
razones, las dos verificables.**

**Primera: tres de las seis "geometrías" no son chips.** El barrido midió
archivos cuyo NOMBRE contiene `chip|badge|pill|tag|flag|crumb`:

| Lo que contó | Lo que es |
|---|---|
| `rounded-[1px]` | El **punto de estado "perdida"**. La forma es la codificación redundante no-cromática para daltonismo — volverlo píldora borra una affordance de accesibilidad |
| `rounded-lg` | El **panel desplegable** de `GovtJurisdictionsChip`, no el chip. 8px sobre una superficie es correcto |
| `rounded-2xl` | Una **tarjeta** con encabezado y cuerpo (`PppPublicBadge`) |

Es la misma clase de defecto que esta corrida encontró toda la noche: una
medición que declara una propiedad más angosta que la que su nombre promete.

**Segunda: converger a píldora contradice una decisión tuya previa.** X2-S2, del
2026-07-29, escrita en `app/globals.css:138-153`: dos niveles y sólo dos,
ciudadano → píldora, operador → rectángulo institucional para tablas densas. El
comentario incluso explica por qué la píldora es la elección de MANTENIMIENTO
para el nivel ciudadano (9999px es invariante de escala) y por qué el operador
no la lleva.

Lo que sí era deriva, convergido **sin mover un píxel**: los cuatro
`rounded-[3px]` tipeados a mano ahora leen `--radius-op-chip`, y `rounded-2xl`
lee `--radius-card`. `__tests__/chip-radius-doctrine.test.ts` fija la doctrina y
el recuento corregido.

> **Si querés la píldora igual en el nivel operador, decímelo y lo hago** — pero
> sería revertir X2-S2, no unificar, y se llevaría puesta la señal que distingue
> una pantalla de trámite de una consola de trabajo.

### 6.3 El rojo de e2e — un solo defecto con tres caras

45 tests fallaban en CI. **Ninguno se puso rojo por un cambio de producto: uno se
puso VERDE por el motivo equivocado y arrastró al resto.**

El 2026-08-08 las rutas de auth se mudaron al castellano (`/login` →
`/iniciar-sesion`) y quedó un 308 permanente. Seis specs tenían su propia copia
de este predicado:

```js
(url) => !url.pathname.startsWith("/login")
```

Después del 308 el navegador está en `/iniciar-sesion`, que **no** empieza con
`/login`. El predicado pasaba a ser verdadero en el instante en que aterrizaba
la redirección, **antes de que se tipeara una credencial**. `waitForURL`
resolvía de inmediato, el helper daba el ingreso por exitoso, y cacheaba cookies
**anónimas** para todo el worker.

Y hubo una segunda vuelta que vale más que la primera: mi propia reja, escrita
para impedir la repetición, **enumeraba formas de escribir la ruta**
(`startsWith` y `goto`) y dejó pasar una tercera que estaba a la vista en dos
archivos —`.not.toMatch(/^\/login/)`, un literal de regex. Pasó verde sobre el
defecto que existía para atrapar. Ahora prohíbe la RUTA, no sus grafías:
enumerar la ruta es exhaustivo, enumerar las maneras de escribirla no lo es
nunca.

| Corrida de CI | Fallas | Duración |
|---|---|---|
| Antes | 45 | 29,6 min |
| Tras la primera vuelta (la sesión) | 15 | 16,2 min |
| Tras la segunda (el literal de regex) | 2 | 8,2 min |
| Tras la etiqueta de especie | **0 · 183 pasan** | **7,6 min** |

La duración cuenta una parte de la historia por su cuenta: la suite tardaba
cuatro veces más porque decenas de tests quemaban su timeout de 20s esperando
una sesión que nunca existió.

**Las dos últimas no eran el login.** El 2026-08-09 se unificó la etiqueta de
especie a "Perro" y "Cobayo" a secas —decisión tuya: el desdoblamiento en un
selector de ESPECIE es un error de categoría— y dos specs se quedaron con el
literal `/perro\/a/i` escrito a mano. No fallaban ruidosamente: colgaban 15s
esperando un botón que ya no se llama así, y con eso se caía el alta de mascota
entera. **Que es el hito 1 del guion de Cowork**, o sea lo primero que un tester
iba a tocar. Ahora leen `speciesLabel("dog")` de la única fuente.

Dos hallazgos más del mismo barrido: `landing-signin-reachable` apuntaba a
`header a[href="/login"]`, un selector que desde la mudanza no matchea nada; y
`synthetic-monitor` afirmaba `not.toContain("/login")`, vacuo — la cadena vieja
no aparece ni cuando el ingreso falla. Además el 308 en sí, que prometía
quedarse "FOREVER" en su propio encabezado, ahora tiene cobertura.

### 6.4 Lo detectado y NO arreglado

- **L-21 (nuevo): el build depende de que Google Fonts conteste.** Observado en
  vivo hoy 22:04 UTC — el job de build de CI murió entero con `Failed to fetch
  'Encode Sans' from Google Fonts`, sin relación con el commit. En runtime no
  hay dependencia (Next auto-hospeda tras descargar); la hay en el único momento
  en que duele, que es publicar. **El mismo corte durante un `deploy:staging`
  deja a los testers sin ambiente.** El arreglo estándar es `next/font/local`
  con los `.woff2` versionados; no se tocó porque cambia el pipeline de
  tipografía y merece verificación visual propia.
- **La suite se auto-limita por rate limit.** `auth_login_email` es 5/min y
  20/hora por dirección, y cada falla de Playwright levanta un worker nuevo que
  vuelve a loguearse: las fallas se realimentan. No se tocó **a propósito** — el
  limitador es un control de seguridad real y debilitarlo para los tests sería
  el peor intercambio posible. Se resuelve solo a medida que bajan las fallas.
- **Los 20 renglones `L-` de la cola** siguen abiertos, con L-21 ahora son 21.

### 6.5 Lo único que queda de tu lado

**Desplegar staging.** El código de esta noche —incluido #41, que es lo que el
guion de Cowork ejercita— no está en el deploy actual.

```
pnpm deploy:staging
```

Corre `pnpm verify` entero, después `migrate.ts`, después el deploy. No hay
migraciones nuevas pendientes desde `0171`, así que el paso de migración es un
no-op. Si el deploy muere con un error de Google Fonts, es L-21: reintentá.

Verificado sobre el staging actual antes de escribir esto: las siete rutas
públicas del guion en 200, y el elenco de demo intacto —`DIM-PAMP-0001`,
`DIM-DEMO-0001/2/3` responden 200. El 308 de `/login` funciona también en
producción.

---

## 7. El gate, al cierre

CI sobre `92fd4074`:

| Job | Resultado |
|---|---|
| Lint, typecheck, build | ✅ |
| Tests (vitest) | ✅ **1231 pasan · 1 salteado (1232)** — `reported 1232 file(s); 1232 discovered; 0 failing test(s)` |
| E2E (Playwright) | ✅ **183 pasan, 0 fallan, 7,6 min** |
| Schema vs migrations drift | ✅ |
| Dependency audit | ✅ |

Dos notas de honestidad sobre el gate, porque valen más que el tilde verde:

- **El job de build había fallado antes por Google Fonts, no por el código.** La
  corrida siguiente pasó sin tocar nada. Eso ES L-21, y por eso entró a la cola.
- **En local, `vitest run` pierde reproduciblemente un archivo** (1230 de 1232)
  por un worker que muere, con cero tests fallando. En CI (Ubuntu, bootstrap
  limpio) corren los 1232. El veredicto de conteo de archivos lo da CI, no mi
  máquina — dos corridas locales, la segunda sin nada compitiendo, dieron lo
  mismo. No es contención.
