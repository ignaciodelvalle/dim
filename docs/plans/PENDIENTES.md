# PENDIENTES — cola única de trabajo abierto

> **Solo lo que falta.** Lo cerrado vive en los planes del 29, 30, 31, 01-08 y
> 04-08, y en los commits que se citan acá.
> Actualizado **2026-08-05** tras la corrida nocturna que vació la cola.
>
> **Adenda 2026-08-07**: la auditoría de cierre de la tanda 1 del 26/07 (engram,
> `reviews/2026-07-26-closure-audit`) encontró **cuatro rojos abiertos que este
> documento no listaba**. Dos se cerraron el mismo día en código; los otros dos
> entraron como filas propias (**#41** y **Lote E**, en 🟠 ABIERTO). El marcador
> pasa a **~20 abiertos**. La lección vale más que el número: la cola quedó
> "vacía" el 05/08 porque nadie había cruzado los hallazgos de la auditoría
> contra ella.
>

> **Marcador**: **~18 abiertos**, y **ninguno es un defecto de producto sin
> dueño**. La corrida cerró la cola entera en 8 lotes más el ciclo SDD de la
> chapa física, y el gate de cierre sumó lo suyo: **69 commits** en
> `379114e3..HEAD`. Lo que queda son (a) tres acciones manuales de gate,
> (b) decisiones del PO, (c) deuda con reja puesta y número, y (d) trabajo que
> no es ingeniería.
>
> **Lo que encontró el gate de cierre (2026-08-05)**: seis rejas rechazaron
> trabajo de la propia corrida — el glifo `⚠` del dock, un `<select>` crudo, los
> valores arbitrarios de las pantallas de chapas, dos `db.insert(notifications)`
> directos, `event-schemas.ts` pasado de su techo de tamaño, y `/admin/chapas`
> sin entrada en el manifiesto de pantallas. **Las seis se arreglaron, ninguna
> se baseline-ó.** Vale registrarlo: una corrida larga que termina con
> `pnpm verify` verde no es lo mismo que una que nunca lo corrió entero. Además,
> `lint:spine` cazó 8 mascotas huérfanas que dejó un worker de vitest que se
> cayó a mitad de archivo (P2.6) — residuo de test, no defecto, pero la reja
> **no puede distinguirlos**, así que un `pnpm test` que crashea deja la base
> local sucia hasta que alguien la limpia.
>
> **Regla de evidencia (no negociable, ganada tres veces por las malas)**:
> ninguna fila afirma algo sin **fecha** y sin **cita verificable** — commit,
> archivo:línea, o salida de comando. Un ítem que nadie re-verifica se pudre, y
> este documento ya mandó agentes a "arreglar" código que funcionaba en tres
> ocasiones distintas (F4, `staging atrasado`, P3.2). Si una fila no tiene
> fecha, **no es un hallazgo, es un rumor**.
>
> **CI: el veredicto real vive en la corrida hermana** — cada push dispara dos
> (una por `push`, otra por `pull_request`) y una cancela a la otra. Leer
> `cancelled` no es leer CI.
>
> **Adenda 2026-08-10 — el loop de pulido pre-Cowork.** Seis reviews adversarias
> de contexto fresco sumaron **~40 hallazgos verificados** que este documento no
> listaba. Los de severidad ALTA entraron abajo como filas propias; el detalle
> completo, con evidencia y refutaciones, vive en
> `docs/reviews/2026-08-10-loop-de-pulido-brief.md`.
>
> Y una corrección al propio documento: **PO-5 estaba cerrado desde el 05/08** y
> su fila siguió abierta cinco días. Es el modo de falla del 07/08 al revés — no
> un rojo sin fila, sino una fila sin rojo. Las dos versiones cuestan lo mismo:
> el que lee la cola no puede confiar en ella.

---

## ⚠️ Servidores de QA — la regla sigue vigente y hoy aplica

**Estado 2026-08-05**: los servidores de QA estuvieron **rancios toda la
corrida** (sirviendo un build anterior a los 63 commits), y el `pnpm verify` de
cierre corre `pnpm build`, así que **reescribió `.next` por debajo de ellos**.
Después de esta corrida los servidores están muertos aunque respondan 200 en `/`.

**Reinicio obligatorio antes de cualquier sesión de navegador**:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1
```

`pwsh` no está instalado en esta máquina — la invocación es la de arriba. Y ojo
con la rama "port already listening → reusing running server" de ese script:
**reusa el servidor podrido** y sus smoke tests pasan igual, porque el HTML da
200 mientras los chunks dan 400. Matar el proceso primero
(`taskkill //PID <pid> //F`).

**Por qué importa**: con los chunks rotos React **nunca hidrata** y **todo click
se descarta en silencio**. Eso imita perfectamente un defecto de producto — el
31/07 dos specs independientes fallaron igual y casi las reportamos como dos
defectos graves reales. Detectarlo es un `curl`: bajar `/`, extraer
`/_next/static/chunks/*.js`, pedir cada uno. Un solo 400 invalida la sesión.

---

## 🚨 GATE DE DEPLOY — cerrado 2026-08-05 (tarde), con un diferido declarado

| # | Qué | Estado 2026-08-05 |
|---|---|---|
| 1 | ~~**Aplicar `0166`-`0170` a la base remota**~~ | **HECHO** (Ignacio, 2026-08-05). La `0168` falló a mitad de camino y destapó la joya del día: **staging tenía RLS activo con CERO políticas en 13 tablas** (incl. `pets`, `profiles`, `ownerships`, `audit_log`) — deny-all silencioso desde julio, invisible porque el server la bypasea. Causa: ledger deshonesto clase-0165 (las migraciones creadoras figuraban aplicadas sin haber corrido) + la remediación del 31/07 que encendió RLS sin recrear políticas. Reparado con dos instrumentos fechados (`scripts/ops/staging-*-2026-08-05.sql`, generados byte-exacto desde `pg_policies` local) + `scripts/ops/apply-ops-sql.ts`. Cierre verificado: **`db:doctor --allow-remote` LIMPIO** — A 169/169 checksums, B 53 tablas / 38 con políticas / 15 deny-all intencionales, C 8 sondas. **Regla nueva: doctor ANTES y después de todo apply remoto** |
| 2 | ~~**`DEMO_PET_TOKEN` en Vercel**~~ | **HECHO** (Ignacio, 2026-08-05) y verificado contra el entorno: el hero de `dim-staging.vercel.app` renderiza el QR real de Pampa (la compuerta doble exige que el token resuelva, así que verlo ES la prueba) y `/p/DIM-PAMP-0001` sirve la credencial completa con libreta |
| 3 | **Toggle de leaked-password protection** | **DIFERIDO con razón** (2026-08-05): el dashboard de Supabase lo exige **plan Pro** — no es "un click", es una decisión de facturación. Queda para cuando el proyecto suba de plan (o antes del cutover a producción, donde sí corresponde pagarlo). Es A9 de la cola vieja del 24/06 |

**Ya no está en el gate**: `0162`-`0165` (aplicadas a staging 31/07, RLS 53/53,
datos intactos) y el Gmail personal en Nominatim (**decidido 31/07: queda** —
OSM exige un contacto monitoreado y una casilla genérica que nadie lee es peor;
se mueve cuando exista una casilla con lector. **No bloqueante**).

---

## ✅ Lo que cerró la corrida del 2026-08-04/05

> Todo con commit. Lo que no tiene commit no está acá.

### P1 — cumplimiento y datos

| Ítem | Cierre |
|---|---|
| ~~**PRIV-1** `push_subscriptions` sobrevive al borrado de sujeto~~ | **CERRADO** `93e0f668` + migración `0166`. La cascada existía pero era inalcanzable (nada borra filas de `profiles`); ahora `erase_subject_data` borra las suscripciones push explícitamente. **Local únicamente** — ver gate #1 |
| ~~**TEL-1** `share_telemetry`~~ | **CERRADO** `61086608` + migración `0167`. Se dejó de recolectar **y** se borra lo acumulado. Irreversible. **Local únicamente** — ver gate #1 |
| ~~**ROUTE-1** el hallazgo va al foster en vez del titular~~ | **CERRADO** `0ec108d7` (previo a esta corrida), y el mismo commit avisa al refugio de origen |
| ~~**Fe de erratas de `0156`**~~ | **CERRADO** `f8ec48b1` → `docs/db/migration-errata.md`. Se corrige **fuera del archivo**: las migraciones son inmutables incluidos sus comentarios, y `migrate.ts --strict` falla con deriva de sha256 |
| ~~**G2 — un chequeo que le pregunte a la base, no al ledger**~~ | **CERRADO** `9d8051e3` → `pnpm db:doctor` (`scripts/check-ledger-honesty.ts`). Es la respuesta directa al incidente `0165`: staging reportaba 156 migraciones y salud perfecta con 27 tablas sin RLS |

### RA-8 — los fences más angostos que su propia doctrina

| Ítem | Cierre |
|---|---|
| ~~Acciones `"use server"` invisibles a los tres linters (glob plano)~~ | **CERRADO** `9cf1803e`. El descubrimiento pasó a ser **recursivo por la directiva `"use server"`**, no por el nombre del archivo: de 75 a **86 archivos de acción** cubiertos hoy (`pnpm lint:authz`, 2026-08-05), y **3 guards reales** que faltaban se agregaron en el mismo cambio |
| ~~`check-authz-scoping` se derrota con un comentario~~ | **CERRADO** `205d5d94`. La palabra "jurisdiction" adentro de un comentario ya no cuenta como prueba de scoping |
| ~~`check-rls-coverage` no mira contenido~~ | **CERRADO** `0439ed2b`. El fence ahora exige cláusula `TO` explícita en toda policy |
| ~~10 políticas sin cláusula `TO` → caen a `PUBLIC` (incluye `anon`)~~ | **CERRADO** migración `0168`. Verificado hoy: `✓ Policy roles explicit — 81 policies checked, none default to PUBLIC`. **Local únicamente** — ver gate #1 |
| ~~Dos fences con su propia copia de `stripComments`~~ | **CERRADO** `4ebe5618` — uno solo, el más estricto de los tres, en `scripts/lib/strip-comments.mjs` |
| ~~**F6** `lint:nav` prohíbe sólo `router.refresh(`~~ | **CERRADO** `70516dcb`. El fence mide lo que su docblock dice; `push`/`replace` quedan con ratchet en **24 llamadas en 20 archivos** (`scripts/router-nav-baseline.json`) |
| ~~**F7** el fence N3 reporta cero deuda falsamente~~ | **CERRADO** `ec8c5e11`. Mira dónde vive el `redirect()` de verdad, no dónde está la directiva: 2 convertidos, **9 en 5 archivos** grandfathered (`scripts/action-redirect-baseline.json`) |
| ~~**Q4** `lint:buttons` no abría las hojas de estilo~~ | **CERRADO** `367cff66` |

### Tests que no guardaban nada

| Ítem | Cierre |
|---|---|
| ~~**T1** `PanoramaConsole`: 59 `waitFor` con el default de 1s~~ | **CERRADO** `e3f91ac8` — presupuesto de espera **por archivo**, decidido, no un timeout suelto |
| ~~**T2 / RA-4 F8** test de scope de gobierno que nunca ejecutó una aserción~~ | **CERRADO** `44727d81` — solicitante propio, y un `submit` fallido ahora es rojo |
| ~~**T3 / RA-4 F9** guard cross-org que nunca llamaba a la acción~~ | **CERRADO** `2e5f97d9` |
| ~~**T4 / RA-9 EI-4/5/6** self-skips dependientes de datos~~ | **CERRADO** `920e6674` (los gates de fixture dependen del entorno, no de que haya datos) + `249c904a` (`qa-panorama-a11y` renombrado para que no se lea como gate). **Sub-reclamo cerrado por INVERIFICABLE**: las "dos aserciones de touch-target que matchean el documento entero" no citan archivo ni símbolo y no se encontraron. Se reabre con evidencia |
| ~~**T5 / RA-7 F8** `cube-parity` vacuo en su mitad nacional~~ | **CERRADO** `2373b236` — el loop mira la supresión, no sólo los números |
| ~~**COPY-10** dos tests defendían el decimal con punto~~ | **CERRADO** `8d44888c` |

Todos los tests de este lote se **probaron por mutación** antes de darlos por
buenos: si la aserción no se cae al romper el código que dice cuidar, no cuenta.

### Copy, voz y locale es-AR

| Ítem | Cierre |
|---|---|
| ~~**K10 + decimales**~~ | **CERRADO** `8d44888c`, `4ba7307a`, `05888e30` — coma decimal es-AR **en todo lo que lee una persona**, incluida la libreta sanitaria y el timeline del dueño |
| ~~**COPY-4** `check-ui-invariants` Rule 3 angosto~~ | **CERRADO** `d66eb8c0` — la regla de acentos dejó de montar `STANDARD_FILES` y barre `{app,components,lib,src}` (`scripts/check-ui-invariants.ts:565`, verificado hoy), con el diccionario ampliado |
| ~~**COPY-5** 23 diccionarios de estado a mano~~ | **CERRADO** `4759dcc2` — **9 vocabularios que contradecían al canónico** unificados |
| ~~**COPY-6** sin concordancia de plural~~ | **CERRADO** `f0dd1f48` — **20 sitios arreglados**, baseline bajado a **95 en 59 archivos** (`scripts/pluralize-es-baseline.json`) |
| ~~**COPY-7** 89 de 101 estados vacíos sin CTA~~ | **CERRADO** `8e963328` — `emptyAction` agregado a `CaseQueue` (la segunda convención, que sólo tomaba texto) + **7 superficies de alto tráfico** cableadas. Con la advertencia escrita en el docblock: **nunca combinar una CTA alegre con un aviso de supresión por k-anonimato**. El resto es cola larga, no reja |
| ~~**COPY-8 / COPY-1** reloj híbrido "05:39 p. m."~~ | **CERRADO** `625e6eba` — 24 sitios con `hourCycle: "h23"`, `formatTime()` canónico, y **la fence extendida**: falla cualquier `Intl` que pida `hour` sin `hourCycle`/`hour12`. Baseline en **0**, así que el sitio 25 no puede entrar |
| ~~**COPY-9** tuteo/usted en decomiso, "Error desconocido"~~ | **CERRADO** `99cf411d` |
| ~~Tildes de vigilancia/decomiso~~ | **CERRADO** `d66eb8c0` + `f65d6e85` (los tests alineados a la copia acentuada, no al revés) |
| ~~**COPY-2** adopciones prometía un email que el refugio no tenía~~ | **CERRADO antes de esta corrida** — verificado hoy: la pantalla de revisión lee el email del postulante de `auth.users` en render (`adopciones/[appEventId]/page.tsx:28-42`) |
| ~~**COPY-3** el outbox prometía reintento en "máximo 5 minutos"~~ | **CERRADO antes de esta corrida** — verificado hoy: `app/admin/outbox/[id]/page.tsx:318-319` lleva la corrección y el post-mortem escrito |

### CSS, movimiento e impresión

| Ítem | Cierre |
|---|---|
| ~~**CSS-2** el dock teletransportaba~~ | **CERRADO** `d1eed2d2` — `.op-dock` en `globals.css`, sin valores arbitrarios |
| ~~**CSS-3** tres anillos de foco faltantes~~ | **CERRADO** `5b62e1e6` — se resolvió **borrando** `focus:outline-none` |
| ~~**CSS-4 / MOT-3** scrolls suaves sin guardar~~ | **CERRADO** `5b62e1e6` — incluida `CredentialActionBar` en la página pública de mascota perdida, que era la peor |
| ~~**CSS-5** columnas que saltaban~~ | **CERRADO** `c1494a88` — `table-layout: fixed` + anchos explícitos |
| ~~**CSS-6** `scroll-snap-stop: always`~~ | **CERRADO** `d1eed2d2` |
| ~~**CSS-7** 6 stagger hardcodeados~~ | **CERRADO** `fb67b713` |
| ~~**CSS-8** `content-visibility` en las 5 listas topeadas alto~~ | **CERRADO** `fb67b713` — sólo filas de bloque; las tablas quedan fuera a propósito (containment no se aplica de forma confiable a `<tr>`/`<tbody>`) |
| ~~**MOT-1** 18 duraciones y 8 curvas, cero tokens~~ | **CERRADO** `956dbd4c` — `--motion-fast/base/slow/deliberate/ambient` + `--ease-standard/editorial`; 71 literales migrados; **regla C8** con baseline en **0 duraciones crudas** (`scripts/design-tokens-css-baseline.json`, verificado hoy) |
| ~~**MOT-2** 165 `loading.tsx` cortan de golpe~~ | **CERRADO** `02b38cb7` — **162/165**. El 165 es `p/[publicToken]` **a propósito** (flujo de emergencia) |
| ~~**MOT-4** diálogo, disclosures y KPIs~~ | **CERRADO** `972e0300` |
| ~~**PRN-1** ningún test emulaba medios de impresión~~ | **CERRADO** `7536e9cf` — spec e2e que fija que expediente e informe impriman más allá de la página 1 |
| ~~**PRN-3** el expediente sale cortado en PDF~~ | **CERRADO** `fa147dac` — `AppShell` nombra las cuatro cajas que recortan y `operator-print-escape.css` las devuelve al flujo bajo `@media print`. La receta clásica `visibility:hidden` + `position:absolute` **no escapa** de un ancestro `fixed` con `overflow:hidden` |
| ~~**PRN-4** QR de la chapita sin zona de silencio~~ | **CERRADO** `e690f627` |
| ~~**PRN-2** `/p/[publicToken]` sin hoja de impresión~~ | **CERRADO antes de esta corrida** — verificado hoy: `app/(public)/p/[publicToken]/credential-print.css` existe y documenta el defecto que arregla |
| ~~**PRN-5** no hay botón de imprimir en denuncias~~ | **CERRADO por OBSOLETO** — verificado hoy: el afordance existe (`app/gob/maltrato/[id]/PrintExpedienteButton.tsx`, con test propio y `deferPrint` para no clavar el INP). La fila era vieja |
| ~~**Q6 / P3.3** aviso de capa desconocida enterrado en un dock colapsado~~ | **CERRADO** `d1eed2d2` (chapita de aviso en la barra) + `62e50879` (el glifo pasa a `<Icon name="alerta">` para satisfacer `lint:professionalism`) |

### Panorama, datos abiertos y jurisdicción

| Ítem | Cierre |
|---|---|
| ~~**P2-1** `absent` vs `suprimido` con un solo booleano~~ | **CERRADO** `fe08b807` — estado de tres valores. El límite de privacidad se respeta: **la supresión siempre se declara**, sólo se oculta el vacío ausente |
| ~~**P2-2** tarjeta de ranking sobre datos que no la justifican~~ | **CERRADO** `6fb4b4eb` — la tarjeta no va cuando no hay nada. **Queda abierto el resto del inventario** (ver abajo) |
| ~~**MAP-1** el export de imagen nunca podía exportar el país~~ | **CERRADO** `a9d44a65` — encuadra al alcance elegido, exporta, restaura la vista. **Verificación visual pendiente** (ver abajo) |
| ~~**D3** provincia entera sólo para CABA~~ | **CERRADO** `0d2d3f79` — cualquier provincia. En el camino se arregló un **bug de scoping preexistente** que el cambio destapó |
| ~~**Y2 / RA-3 C8** denominadores anidados en datos abiertos~~ | **CERRADO** `d078e752` — la regla conjunta compara **poblaciones**, no nombres de columna |
| ~~**A5** el refugio de origen se entera sin que el perfil lo declare~~ | **CERRADO** `227c74ca` — la divulgación existe en el perfil. El comportamiento ya estaba; faltaba decirlo |
| ~~**RA-1 C3** el triage de maltrato perdía la edad de una denuncia no vencida~~ | **CERRADO antes de esta corrida** — verificado hoy: `SlaBadge.tsx:107-109` muestra `ageLabel(ageDays)` también en la rama en plazo |

### Higiene de plataforma

| Ítem | Cierre |
|---|---|
| ~~Clase de crash por `searchParams` repetido~~ | **CERRADO** `e690f627` — `?chip=a&chip=b` hacía que Next pasara `string[]` y reventara en `.trim()`. **10 archivos** saneados de una |
| ~~`role="img"` tragándose subárboles~~ | **CERRADO** `e690f627` — **6 sitios** (`gob/mortalidad` ×2, `gob/adopciones`, `admin/adopciones`, `gob/censo`, `admin/censo`) |
| ~~Fixtures de e2e faltantes~~ | **CERRADO** `8adeb437` + `2d026f68` — la mascota perdida y la publicación de adopción se siembran, y la elegibilidad de adopción entra **por la columna vertebral**, no por una columna de caché |
| ~~**P3.2** `jurisdictionProvince` sin `z.enum`~~ | **YA ESTABA ARREGLADO**, `3f56326d`. Listado como abierto durante días; un agente fue a arreglarlo de nuevo |

### A1 — chapa física, CONSTRUIDA

**Estaba listada como "no construida" el 04/08. Hoy existe.** Ciclo SDD
completo, 13 commits, `b6ccb7f0`..`c7d27d31`:

- **Datos**: migración `0169_pet_tags` — tabla con máquina de estados
  (`unactivated → active → revoked`) y RLS de sólo-lectura propia.
- **Identidad**: serial `TAG-XXXX-XXXX` **opaco** (no secuencial: un serial
  correlativo deja recorrer el padrón probando números) y código de activación
  con **HMAC de dominio separado** (`52dc7078`).
- **Espina**: eventos `tag_activated` / `tag_revoked` con esquemas estrictos
  **sin el código en el payload** (`15034058`), mapas exhaustivos completados
  (`448404ff`), catálogo a **50 tipos** (`8efce62c`).
- **Escritura**: activar y revocar con **compuerta uniforme de evidencia** —
  código equivocado, serial desconocido y chapa ya activa devuelven el **mismo**
  mensaje, y ningún error repite el código intentado (`5b82b8f3`).
- **Lectura pública**: `/t/[serial]` con matriz de 4 estados y límite por IP
  (`9eb7afdd`). La proyección **no puede filtrar el hash** — es `{status,
  publicToken}` por forma.
- **Superficies**: `cuenta/chapas` con activación y baja, gateada por
  jurisdicción (`38c12821`); emisión admin por lote con CSV de códigos de un
  solo uso (`8e090939`).
- **Derechos**: exportación y supresión cubren `pet_tags` **sin exponer el
  hash** (`d8e7befb`, migración `0170`).
- **Tests**: cobertura RLS y negación cruzada (`acb28a26`); y **W1 del verify**
  cerrado hoy (`8bf22ec9`): una transferencia de titularidad real deja la chapa
  **intacta** —mismo serial, mismo `pet_id`, sigue activa— y `/t/[serial]` sigue
  resolviendo. El control pasa al nuevo titular: la chapa sigue a la MASCOTA,
  no a la persona (invariante #1).

---

## 🟠 ABIERTO — 2026-08-05

### Decisiones del PO — TOMADAS el 2026-08-05

Las cuatro estaban bloqueando código escrito. Ninguna bloquea nada ahora.

| # | Qué se decidió | Estado |
|---|---|---|
| **PO-1** | **La ficha de adopción muestra sólo el booleano.** El visitante anónimo lee "tiene microchip", nunca un fragmento del número | **EJECUTADO** `5847d48f` — y va más lejos que la decisión: el código completo **ya ni siquiera llega a memoria del servidor** en esa ruta. `hasActiveMicrochip()` proyecta una constante, así que un render futuro no tiene qué filtrar por accidente. Cerrado el único de los 16 sitios de lectura del identificador canónico que no estaba gateado por rol |
| **PO-2** | **La cartilla general se queda, sin gatear por cuadro.** Una guía que sólo lista lo que ya está en pantalla deja de enseñar el instrumento | **EJECUTADO** `29b365e7` — la tensión que encontró la auditoría era real pero era de **copy**, no de gateo: el bloque se leía como clave del cuadro actual. Ahora dice lo que es en su primera línea ("Guía general del mapa: qué significa cada marca cuando aparece. El cuadro actual puede no contenerlas a todas"), así que ninguna copia afirma que el cuadro pinta una marca que no pinta. La nota de diseño T4.1 queda en el código con la ratificación del PO |
| **PO-3** | **El diseño se mantiene**: conocer el token del QR sigue siendo la prueba de consentimiento del walk-in de Atender | **DECIDIDO, sin código nuevo** — el monitoreo va por los **marcadores de provenance** (walk-in no verificado + aviso inmediato al dueño, decisión del 04/08). Si el vector se materializa, se verá en esos marcadores antes que en un reclamo |
| **PO-4** | **La credencial pública se apaga con el borrado.** Una mascota transferida ANTES del borrado del ex-titular **no** se apaga: la credencial es de la MASCOTA (invariante #1) | **EJECUTADO** `f6e02053` — todas las superficies públicas resuelven por `publicPetByToken()`, un único predicado, y el filtro va **en la consulta** (la fila borrada no se lee). `/t/[serial]` deja de mandar un 307 hacia un 404: una chapa activa sin destino muestra un estado neutro y honesto, y **no** ofrece la activación (la chapa ya está activada). El barrido alcanzó 9 superficies, incluidas dos acciones posteables a mano. La asimetría "borrada sí / transferida no" está probada contra el RPC real (`__tests__/public-soft-delete-resolution.test.ts`) |

### Diferido a propósito, con la ventana de exposición declarada

| # | Qué | Estado |
|---|---|---|
| **D4** | **HEIC: se transcodifica en el servidor** (decisión del PO 04/08, ratificada **05/08**). **DIFERIDO ENTERO** | Transcodificar necesita una librería de imágenes del lado servidor y pega contra el tamaño y el tiempo de ejecución de la función en Vercel. **Consecuencia que queda escrita, no implícita**: hasta que salga, el GPS del domicilio de un denunciante anónimo **sigue viajando** en cada foto tomada con iPhone. La ventana está **abierta y documentada** |

### Trabajo que no es ingeniería

| # | Qué | Estado 2026-08-05 |
|---|---|---|
| **A1-ops** | **Quién fabrica la chapa y cómo se distribuye** | El software está entero. Esto no. La tarjeta de demanda por localidad (`/admin/programa`, `1450a311`) es la entrada para esa decisión |
| **Logo** | **El concepto está decidido y es bueno**: huella dactilar con un perro y un gato adentro. Falta el **formato** | Restricciones que deciden si funciona, no preferencias: **(a)** legible a **16px** en la pestaña y en la **chapita física** al lado de un QR de dos centímetros —las crestas finas se vuelven gris sucio ahí—; **(b)** reproducible **a un solo color**, porque va a convivir con escudos municipales que se bordan, se graban y se sellan; **(c)** invierte limpio en modo oscuro; **(d)** vector, no escaneo; **(e)** las dos siluetas se distinguen **de un vistazo**. Nota: **hoy la marca es tipográfica** — `logo-mimar.svg` está en `public/` y ningún componente lo consume, así que adoptar un logo es **introducir** una marca donde hay tipografía |

### Verificación pendiente — CERRADA la tarde del 2026-08-05

| # | Qué | Cierre |
|---|---|---|
| ~~**MAP-1-v**~~ | ~~La parte **visual** del encuadre al alcance~~ | **HECHO 05/08** — capturas reales contra el QA sano: export nacional (admin) con el país entero y el pie honesto de CABA; export provincial (funcionario TdF+SC) encuadrado exacto a su mandato. Entregadas al PO. Observación abierta: el provincial salió sin burbujas de datos (¿k-anon legítimo en ventana de 30 días o algo que mirar?) |
| ~~**e2e de chapas**~~ | ~~Ninguna spec para `/t/[serial]`, `cuenta/chapas`, `admin/chapas`~~ | **HECHO 05/08** — `e2e/chapas.spec.ts` (`9968324d`), 6 tests verdes contra navegador real: 4 estados del resolver, activación feliz, código equivocado = rechazo byte-idéntico, y la emisión REAL con captura del CSV de un solo uso (así el test también prueba ese contrato) |
| ~~**S1 + higiene de errores**~~ | ~~Límite de tasa en revocación + `err.message` crudo~~ | **HECHO 05/08** (`91ae871a`) — revocación: 10/min·40/h por IP + 3/min·10/h por serial (presupuesto razonado: no hay secreto que adivinar); errores desconocidos → `UNKNOWN_ERROR_FALLBACK` con el real a consola; la compuerta uniforme de evidencia intacta. Presupuestos documentados en AGENTS.md (`28772e58`) |
| ~~**Mapa nacional no determinista**~~ | ~~`.limit()` sin `ORDER BY`~~ | **DECIDIDO Y HECHO 05/08** (PO eligió ordenar por tamaño; `dcfa5feb`) — `ORDER BY n DESC, province, locality` (el desempate es lo que lo vuelve total). Medido: el tope viejo guardaba localidades de n=1 y descartaba más grandes, **perdiendo ~20% del conteo nacional** (7.695→9.642 cubierto). Paridad del cubo: 4 corridas consecutivas verdes — el orden la aprieta, no la rompe |

### Decisión de diseño nueva para el PO — 2026-08-05 (noche)

| # | Qué | Contexto |
|---|---|---|
| ~~**PO-5**~~ | ~~El CTA de la landing saltea un hito en 1440×800~~ | **CERRADO — ya estaba hecho el 2026-08-05.** Verificado el 2026-08-10 contra el árbol: la opción elegida fue la tercera (que el CTA avance desde el hito CLICKEADO y no desde el activo) y vive como el **click latch** en `components/landing/MilestoneNav.tsx`, pineado por su test: *"the CLICK LATCH (PO-5, 2026-08-05): after a click navigates to milestone M the CTA offers M+1 no matter what the scroll-spy says, until the visitor scrolls away from where the click parked them"*. Esta fila quedó abierta cinco días después de ejecutarse — que es el modo de falla que este documento existe para prevenir, al revés: no un rojo sin fila, sino una fila sin rojo |

### Los dos remanentes grandes de la auditoría del 26/07 — 2026-08-07

> **Por qué aparecen recién ahora.** La auditoría de cierre de la tanda 1 del
> 26/07 (engram, topic `reviews/2026-07-26-closure-audit`, corrida read-only
> contra `d262464f`) verificó los ~193 hallazgos uno por uno y dejó **cuatro
> rojos abiertos**. Dos de ellos se cerraron el 07/08 en código (el mapa de
> vigilancia pintaba disputas de custodia como epidemiología, y SC-6, la
> urgencia que ordenaba sólo la página traída). Los otros dos **no son trabajo
> de una tarde**: uno necesita una decisión de alcance del PO y el otro es un
> ciclo SDD entero. La auditoría los encontró **invisibles en este documento**,
> que es exactamente la falla que la regla de evidencia existe para prevenir —
> un rojo sin fila no tiene dueño.

| # | Qué | Estado 2026-08-07 |
|---|---|---|
| **#41** | **Detalle de caso: acciones de operador.** `components/casos/CaseDetailView.tsx` (327 líneas) tiene **cero controles de operador** — verificado el 07/08: cero `<form>`, cero `<button>`, cero `OpButton`, cero `action=`. Ni cerrar, ni escalar, ni asentar una nota. La cola de Casos ahora ordena por urgencia **en SQL** (SC-6, cerrado el 07/08), así que la fila #1 es de verdad el expediente más urgente de la jurisdicción… **y abre a una página muerta**. El arreglo de SC-6 vuelve esto MÁS visible, no menos: antes el operador llegaba al callejón sin salida por casualidad, ahora el producto lo manda derecho | **BLOQUEADO POR EL PO — falta acotar cuáles acciones.** No es "poner botones": cada tipo de caso tiene su propio cierre legítimo (`src/modules/cases/domain/lifecycles/<kind>.ts` declara los eventos terminales) y hay 12 tipos. Las preguntas que hay que responder antes de escribir código: (a) ¿qué subconjunto de tipos gana controles en la primera entrega —¿sólo `bite_incident` + `welfare_denuncia`, los dos que más tráfico tienen?—; (b) ¿el operador cierra, o sólo escala y asienta nota?; (c) ¿la acción vive en el detalle, en la cola por lote (ya existe `OpBulkBar`), o en ambos? Origen: auditoría 26/07 rojo **#2** (y gate vivo del 28/07, punto #7). Nunca salió de "stretch" en ningún plan |
| **Lote E** | **Partir la hidratación del `PanoramaConsole`.** `components/panorama/PanoramaConsole.tsx` sigue siendo **una sola unidad cliente de 4.993 líneas** con `"use client"` en la línea 1 y **49 `useState`**, sin un solo `next/dynamic` ni `React.lazy` (medido el 07/08 contra el árbol). Es el S9 de la tanda 1, diferido **por decisión** y nunca planificado | **CANDIDATO A SDD** (no a un lote nocturno): 12-15 tareas largas, y el riesgo real no es partir el archivo sino **partirlo sin medir**. **Criterio de aceptación que hay que fijar ANTES de empezar: una reja de INP.** Hoy no existe ninguna en el repo — ni gate, ni presupuesto, ni medición de long-tasks — así que un refactor de hidratación no tendría con qué demostrar que mejoró algo, y "se siente más rápido" no es evidencia bajo la regla de este documento. Orden propuesto: (1) medir INP/long-tasks del Panorama actual y dejar el número escrito, (2) reja que no deje empeorarlo, (3) recién entonces partir. Origen: auditoría 26/07 rojo **#1** / S9 |

### #41 y Lote E — DISEÑADOS Y REFUTADOS, listos para ejecutar (2026-08-10)

> Los dos pasaron por diseño y por un escéptico que los verificó contra el árbol.
> Ninguno se ejecutó: el de #41 volvió con tres bloqueantes que cambian su
> alcance, y el de Lote E con un cambio de instrumento. Lo que sigue es el plan
> **corregido**, con sus números medidos — no la propuesta original.

#### #41 — el alcance real es mucho más chico de lo que parecía

La refutación midió la cola y encontró que el diseño se apoyaba en premisas falsas:

| Qué se creía | Qué se midió |
|---|---|
| `custody_episode` "ya tiene pantalla propia" en `/gob/decomisos` | **215 de 215** tienen `opened_by_organization_id IS NULL`, y esa pantalla filtra por opener para rol govt (`app/gob/decomisos/page.tsx:148`). Un funcionario ve **cero**. Sacarlos de la cola no los deja de contar dos veces: los **desaparece** del portal |
| El detalle de decomiso es una pantalla aparte | `app/gob/decomisos/[publicCode]/page.tsx:24` es `redirect('/gob/casos/…')`. La "pantalla propia" **es** el detalle genérico: un link-out sería un rebote circular, y el guard de rebotes de `link-integrity.test.ts` §5 sólo ve rutas estáticas |
| Escalar y cerrar sirven a la cola | La cola real es `custody_episode` 215 · `lost_pet_episode` 41 · `adoption_listing` 1. **`microchip_remediation` tiene CERO filas** — y era el único kind al que el diseño le daba los tres verbos. El 100% de la cola recibiría exactamente **una** acción nueva: la nota |

Más una carrera sin resolver: `CasesRepository.closeCase` devuelve la fila ya
cerrada cuando pierde (`cases-repository.ts:219-232`), y una dep tipada
`Promise<void>` tira ese retorno. El perdedor ya insertó su `case_closed` en
`case_events`, que es **append-only por trigger** — dos cierres con dos motivos y
dos actores, permanentes, en un sistema cuyo invariante es que el registro no
miente.

**Alcance corregido, y es una sola cosa**: la acción de **nota** sobre el detalle,
que es la que sirve al 100% de la cola real, con la mutación ANTES del evento y
el evento sólo si la mutación ganó la carrera. Escalar y cerrar quedan fuera
hasta que exista cola que los use.

#### Lote E — el instrumento correcto no es INP

La refutación descartó medir INP/TBT: no es reproducible entre corridas y una
reja que oscila entrena a todos a ignorarla. El proxy correcto y determinístico
son los **bytes exclusivos de la ruta**, leídos de `.next/app-build-manifest.json`.

**Número de partida medido: `/admin/panorama/page` = 242.526 B exclusivos**
(total 1.058.740 B, compartidos 816.214 B — estos dos se imprimen y **no** gatean,
así que un salto del framework se ve sin enrojecer Panorama).

- **Paso 0** — `scripts/check-route-weight.ts` + baseline, en `verify` después de
  `pnpm build`, con cuatro pisos anti-vacuidad y verificación en rojo obligatoria
  antes de mergear (borrar 6 KB → rojo; correr sin `.next` → skip que dice "no
  probé nada"; sacar una ruta del baseline → rojo). 2-3 h.
- **Paso 1** — `MapLegends` a `next/dynamic`. Es el **único** de los cinco
  candidatos que no toca un solo `it` del console (cero menciones en
  `PanoramaConsole.test.tsx`), y vive en un tab que no es el default. −5.500 B.
- **Paso 2** — `MapDataTable`, con la frontera **adentro** de
  `PanoramaDockRegistros`, no colgada del console. Rompe exactamente un `it`
  síncrono (`:1192`), que pasa a `findByText`. −3.000 B más.

**Fuera hoy, con razón**: `CalendarHeatmap` y `PanoramaDataTable` viven en el tab
**default**, así que diferirlos regala latencia en la primera interacción a cambio
de bytes — un trueque que el instrumento no puede juzgar. `TimeScrubber` tiene el
mejor rendimiento por byte y el peor costo de test: día propio, con la migración
de `openTimeline` a async como commit previo y separado.

**Criterio de aceptación**: además del número, una confirmación **estructural** que
no depende del estimador — el chunk lazy tiene que existir en `.next/static/chunks`
y estar **ausente** del manifest de la ruta, verificado por huella. Determinístico
y gratis.


### Hallazgos del loop de pulido — 2026-08-10

> Los de severidad ALTA que quedaron SIN arreglar esa noche. Evidencia completa
> y refutaciones en `docs/reviews/2026-08-10-loop-de-pulido-brief.md`.

| # | Qué | Estado 2026-08-10 |
|---|---|---|
| **L-1** | **El despachador de crons se starvea a sí mismo.** Los jobs #2 y #3 declaran 45s cada uno contra un presupuesto de 55s y un lambda de 60s, y el presupuesto se chequea ANTES de cada job, nunca durante. Un kill por timeout no es excepción de JS, así que `withCronRun` deja la fila en `running` para siempre sin disparar alerta. Los jobs 3-22 no corren **ni se marcan como salteados** — incluidos la purga de retención de escaneos (#20, TTL 90 días, privacidad) y `cron_health` (#22), que es justamente el que detectaría la staleness | **ABIERTO.** El argumento es estructural, leído del código y de los presupuestos declarados; `cron_runs` está vacío en local, así que no está confirmado empíricamente contra staging |
| **L-2** | **El 98,4% de las notificaciones es best-effort sin reconciliación.** 138.553 de 140.766 filas son inserts directos con `catch` que sólo loguea, fuera de la transacción del hecho. No existe job que compare hechos contra notificaciones: "el hecho existe y el aviso no" **no lo descubre nadie**. El carril legal (`event_notification_outbox`) sí es transaccional y está bien resuelto | **ABIERTO.** `createNotification` es el camino correcto (dedupe, dead-letter, drain con alerta); falta migrar el 98% |
| **L-3** | **`check-authz-guards` no puede ver los 33 `route.ts`** — descubre archivos por la directiva `"use server"` y los Route Handlers no la tienen. Instancia viva: `app/api/mis-mascotas/[publicToken]/libreta-export/route.ts` autoriza sin chequear `deletedAt`, así que un titular que ejerció supresión ARCO **sigue pudiendo bajar el PDF completo** de la libreta | **ABIERTO.** Es exactamente la clase que la regla `findDeletionUnawareMutations` existe para atrapar |
| **L-4** | **Reasignar un decomiso inutiliza permanentemente la aceptación.** `reassignDecomisoInTx` inserta una segunda `custody_transfer_proposed` sobre el mismo caso, y el validador de aceptación trata esa forma como corrupción ("propuestas duplicadas, contactá soporte"). El cron de escalada modela la MISMA forma como estado normal: dos partes del flujo tienen lecturas opuestas de la misma tabla | **ABIERTO.** Sin test de reassign→accept |
| **L-5** | **Atender un turno no notifica al dueño.** El gemelo walk-in sí lo hace desde el 16/07 (`notify-owners-of-clinical-event.ts`, escrito exactamente para eso), y el diseño original lo especificaba | **ABIERTO** |
| **L-6** | **Tres pantallas de operador no tienen wrapper de presupuesto**, así que tampoco rama degradada: `app/admin/casos`, `app/admin/historial/ActividadScreen`, `app/gob/historial`. No pierden la barra de filtros — pierden la página entera, con el skeleton colgado. Y `check-degraded-chrome` sale verde porque una página sin wrapper no tiene rama que juzgar | **ABIERTO.** Peor que el defecto para el que se construyó el fence |
| **L-7** | **Panorama: el sello de frescura del cubo llega a un solo componente**, dentro de un panel que hay que abrir. El PNG y el informe imprimen "Datos al {hoy}" sobre un cubo de hasta 26h. Es un dashboard leyendo un caché y presentándolo como el log — lo que el invariante #3 prohíbe | **ABIERTO** |
| **L-8** | **Diferenciación temporal en Panorama.** `suppressDelta` existe y tiene **un solo consumidor** (la capa `tendencia`). El resto acepta `period=custom` arbitrario y suprime por request sin memoria entre ventanas: pedir ene–dic y jul–dic recupera ene–jun, un número que k=5 nunca mostró. Requiere un actor ya autorizado sobre esa jurisdicción — no es fuga pública | **ABIERTO** |
| ~~**L-9**~~ | **Deriva de caché del padrón: 2.733 mascotas (8,4%)** con `death_recorded` en la espina y `status='active'` en la caché. El test de deriva escanea sólo tokens `DIM-%` — 43 de 32.430 — y la clase excluida es exactamente la que deriva. Consecuencia visible: el coropleta de mortalidad dice 352 y la línea de tiempo de la misma pantalla dice 3.946 | **CERRADO 2026-08-10** (decisión del PO: era omisión). El seed reconcilia contra la espina al final de la corrida — una pasada, no un parche por setpiece, así que un tercer setpiece queda cubierto por construcción — y el detector suma una invariante barata sobre TODO el padrón, con su propio chequeo de no-vacuidad. Base local alineada: coropleta 3410, línea de tiempo 3410 |
| **L-10** | **Almirante Brown (BA) tiene polígono y cero localidades** en `ar_localities`: el cuarto partido del GBA se pinta permanentemente como "Sin datos" y toda mascota radicada ahí cae en el residual | **ABIERTO.** Es dato de referencia (`source = indec_cppdyl`), no código — falta saber si el dump upstream lo trae |
| **L-11** | **`generatePppExportAction`: capacidad completa, cero entrada.** Genera el PDF RUPPPA CABA (Ley 5470 / Ord. 41.831), lo sube, firma la URL y audita. Ningún componente la invoca. `AGENTS.md:1201` la describe como "placeholder por ahora" — la descripción es **falsa en la dirección peligrosa**: el documento legal existe y ningún dueño PPP en CABA tiene botón para emitirlo | **ABIERTO** |
| **L-12** | **`decideCapabilityAction`** resuelve la organización por la membresía por defecto de la sesión (su gemelo `requestCapabilityAction` ya se arregló el 10/08). Sin escalada —el use-case falla cerrado— pero un admin multi-org que abra permisos de una org que no es su default **no puede decidir nada**, y auditoría y notificaciones quedan atadas a la org equivocada | **ABIERTO** |
| **L-13** | **`SuccessScreen` falta en 4 trámites de peso**: aceptar transferencia de custodia, decidir postulación de adopción, aceptar devolución, y crear un decomiso (que tiene el `publicCode` —el dato mismo del comprobante— y lo tira a la URL). El mandato de `AGENTS.md:1299` prohíbe el redirect silencioso tras el submit final en estos flujos | **ABIERTO** |
| **L-14** | **Concordancia de género: 5 lugares más** — el share de WhatsApp del wizard de perdida, "Marcar como encontrada" ×4 en la sheet, los dos gemelos de match de intake, y el `alt` de Pampa en la landing. Todos con el sexo disponible a mano | **ABIERTO** (el peor, el `<meta>` público que publica WhatsApp, ya se arregló) |
| **L-15** | **Import CSV: si una tanda lanza, el wizard queda colgado** en "Importando…" para siempre y se pierde el reporte de las filas ya escritas. La recuperación existe (mismo `fileHash` → claves idempotentes) pero **nada en pantalla lo dice**. Y `validateIntakeCsvAction` emite hasta 400 consultas secuenciales sin presupuesto | **ABIERTO** |
| **L-16** | **Borrar una regla de agenda no toca los cupos ya materializados**: hasta 60 días de turnos siguen reservables. `bookSlotWriter` re-chequea estado del cupo, capacidad, ventana futura y estado de la offering — **nunca la regla ni su `effectiveUntil`** | **ABIERTO** |
| **L-17** | **El QR de check-in es una fachada**: codifica `mimar://appointment/APT-…`, un esquema que nadie registra (cero `protocol_handlers`, cero ruta, cero handler), y el código de respaldo que la pantalla ofrece dictar no lo acepta ninguna superficie — `/org/…/atender` sólo admite `DIM-XXXX-XXXX` | **ABIERTO.** Turnos figura ✅ en el inventario, no ⚪/🟡 |
| **L-18** | **`app/org/[orgToken]/layout.tsx`: tres `await` de DB sin deadline** antes del bloque acotado, en el layout de toda ruta `/org/*`. Es el defecto que el comentario de las líneas 121-127 del propio archivo describe — la frase se aplicó a los badges y no a la cadena de auth de la que dependen | **ABIERTO** |
| **L-19** | **`MapDataTable` no es alcanzable por teclado** (`max-h-80 overflow-auto` sin `tabIndex` ni `role`) — y es el componente que existe específicamente para ser el equivalente accesible del mapa, cuyas etiquetas de división son `aria-hidden` | **ABIERTO** |
| **L-20** | **Los tres harness de QA de Panorama no están cableados** a `package.json` ni a CI: `qa-panorama-chaos`, `report-panorama-a11y`, `qa-panorama-vis`. Corren sólo a mano — y hasta el 10/08 ninguno podía siquiera loguearse | **ABIERTO** |


### Deuda con reja puesta y número (no es trabajo pendiente: es deuda medida)

> Ninguna de estas puede **crecer**. Cada una tiene un baseline que sólo baja.
> Números verificados contra los archivos de baseline el **2026-08-05**.

| Reja | Número | Archivo |
|---|---|---|
| `lint:nav` — `router.push`/`replace` | **24 en 20 archivos** | `scripts/router-nav-baseline.json` |
| `lint:action-redirect` — N3 | **9 en 5 archivos** | `scripts/action-redirect-baseline.json` |
| `lint:authz-scoping` — acciones tenant-guarded sin scopear | **44 en 19 archivos** | `scripts/authz-scoping-baseline.json` |
| `lint:plural` — plurales a mano | **95 en 59 archivos** | `scripts/pluralize-es-baseline.json` |
| `lint:select` — `<select>` crudos | **48** | `scripts/check-raw-select.mjs` |
| `lint:professionalism` — símbolo-como-ícono | **6 en 1 archivo** (el mapa `STATUS_ICON` de `AlertInboxTable`, excepción aprobada por el PO) | `scripts/professionalism-baseline.json` |
| **Q5** — tipografías por debajo del piso | **19** (core 6 + landing 8 + chapita 5) — re-medido 2026-08-10 con `--list-css`; el núcleo bajó de 11 a 6, el documento decía 24. **Y de los 19, los 5 de `chapita-print.css` son exención legítima, no deuda**: ese archivo dimensiona en milímetros reales (`width:50mm`) para corte a escala 100%, así que el piso de 10px es una regla de PANTALLA aplicada a papel — 7px impresos en una chapa de 50×30mm se leen | `scripts/design-tokens-css-baseline.json` |
| `lint:empty-states` — "Sin resultados" fuera de `LnEmptyState` | **2** (los dos casos de picker, legítimos) | `scripts/empty-state-baseline.json` |
| Formas de fecha hand-rolled | **~35** que no convergieron a un shape canónico | Documentado en `625e6eba`. **Todas son timezone-safe y reloj de 24h — la fence lo garantiza**; lo que falta es que compartan helper |

**Q5 merece una línea aparte porque no es un one-liner**: subir `.ln-qr-cap` de
8px a 10px **cambia el layout de la credencial**. Se retiran de a uno, con ojo
encima.

### Cola larga de estética (RA-10) — RE-VERIFICADA 2026-08-10

> La advertencia que este documento traía —"re-verificar antes de tocar, la lista
> es del 04/08 y esta corrida movió mucho CSS"— era correcta **y se quedó corta**:
> de 20 ítems, **13 están muertos**, 2 nunca fueron hallazgos, y quedan **5 vivos**.
> El descarte vale tanto como el hallazgo; lo que sigue es sólo lo vivo, con
> evidencia de hoy.

| # | Qué | Estado |
|---|---|---|
| **E-1** | **Los 21 pesos de fuente inertes NO existen.** `d5146543` (01/08) los cerró, *antes* de que se escribiera la lista que los reporta. Hoy `app/layout.tsx` carga mono 400/500/600/700 y serif 500/600/700; demanda ⊆ oferta re-derivada con un scanner independiente del test: **337 pares en .tsx + 30 en .css, DEAD = 0**, y `deadWeight: 0` en los tres buckets de `scripts/design-tokens-css-baseline.json` | **CERRADO.** La fila anterior era un rumor con cinco días — exactamente lo que la regla de evidencia de este documento existe para evitar |
| **E-2** | **El radio de chip no tiene 5 valores: tiene 6 geometrías.** El "5" del documento midió sólo CSS. Barriendo la familia entera (30 archivos con nombre de chip/badge/pill/tag/flag/crumb más las reglas de `globals.css` con forma de etiqueta): píldora 9999px (10 miembros, todos de superficie ciudadana), `999px` literal (1 — desvío de **grafía**, rinde idéntico), 6px (1), 5px crudo (1), 4px (4), 3px crudo (4), 2px (3) | **DECISIÓN DEL PO.** La píldora domina por frecuencia, pero converger toca la credencial insignia, y el propio documento pide ojo humano encima para ésos |
| ~~**E-3**~~ | **`order: -1` del hero rompe el orden de tabulación en móvil** (`app/globals.css:1478-1483`). El bloque de foto va SEGUNDO en el DOM (`components/landing/LandingHero.tsx:254`) y primero en pantalla bajo 900px, y contiene controles reales: el link a la credencial de demo (`:301`) y un `role="toolbar"` de estados (`:394`). Visualmente primero, en tab último — WCAG 2.4.3 | **CERRADO 2026-08-10** — el PO eligió que pague desktop. El DOM va foto-primero y el  se aplica arriba de 900px; en pantalla no cambia nada |
| **E-4** | **Dos comentarios de geometría mentían sobre el tamaño**: `OpStatusPill` decía "9px" y rinde `text-xs`, que `--text-xs` fija en 10px (`globals.css:251`); `OpKpiSm` igual. `d5146543` arregló la mitad del PESO de ese mismo comentario y dejó la mitad del TAMAÑO | **CERRADO 2026-08-10** — ahora nombran el TOKEN y no un píxel, que es lo que evita que vuelvan a divergir |
| **E-5** | **Micro-tipografía de la credencial pública** (`.ln-qr-cap`, `app/globals.css:4031-4038`) | **VIVO**, y se cruza con Q5. Subirlo cambia el layout de la credencial: de a uno y con ojo encima |

**No son hallazgos, no los toques**: los 5 de `chapita-print.css` (dimensiona en
milímetros reales para corte a escala 100% — el piso de 10px es una regla de
PANTALLA aplicada a papel) y los 7 "considerados y rechazados" que ya viven más
abajo con su razón técnica cada uno.


### Infraestructura de tests

| # | Qué | Estado |
|---|---|---|
| **P2.6** | El worker de Windows (`0xC0000409`) | **No bloquea** — no reproduce en Linux |
| **P2.7** | El limpiador de huérfanos cubre 4 de ~20 prefijos | Propuesta escrita, **sin implementar a propósito**: cambia un script que BORRA |

### Inventario abierto de P2

| # | Qué | Tamaño |
|---|---|---|
| **P2-2 (resto)** | El **inventario** de estructuras vacías en tableros e informes, aplicando P2 con el límite de P2-1. El ranking ya cayó (`6fb4b4eb`). Quedan las superficies de estado vacío que el barrido de copy contó. **Las leyendas del mapa salen del inventario**: PO-2 se decidió el 05/08 y la cartilla general se queda (`29b365e7`) | M |

### Deliberadamente NO arreglado

- **C1 5ª instancia** — el resto de la tira de KPIs (`microchip`, `ppp`,
  `reunificacion`, el pie de `coverageDenominator`) publica sobre un alcance
  retenido. **No se ensanchó a propósito**: mordeduras/zoonosis/denuncias tienen
  otros denominadores, y meterlos bajo un veredicto calculado sobre mascotas
  registradas sería la sobre-corrección de RA-1.
- **`middleware.ts` no hace autorización.** Cada ruta se auto-gatea. Verificado
  hoy: sigue siendo así, y sigue siendo **a propósito** — `pnpm lint:authz` es
  la red de seguridad (86 archivos de acción, rutas de operador gateadas
  institucionalmente). Mover autorización al middleware en App Router es una
  decisión de arquitectura, no un parche.
- **`hyphens`** — `lang="es-AR"` haría que funcione y las celdas de 390px son un
  caso plausible, pero **no se vio ninguna palabra rompiendo**.
- **`orphans` / `widows`** — Firefox no las soporta en 2026 y `break-inside:
  avoid` ya cubre lo importante. Una propiedad que la mitad de los navegadores
  ignora **produce inconsistencia, no la resuelve**.
- **`counter-increment`** — borraría el numerado en JS del landing, pero la
  salida vive en `content` generado: no se selecciona, no se copia y los
  lectores de pantalla la anuncian dispar. En un producto atado a la Ley 26.653
  es un retroceso disfrazado de limpieza.
- **`interpolate-size`** — es un opt-in a nivel `:root` que cambia la
  interpolación de `auto` en **todo el documento**: habilitarlo para un panel
  cambia en silencio las nueve disclosures. `grid-template-rows: 0fr → 1fr` lo
  resuelve sin opt-in global.
- **View Transitions** — con 165 `loading.tsx`, el modelo RSC haría que la
  transición anime **hacia el esqueleto**, la mitad equivocada del problema.
- **No animar**: salida de filas en colas de operador · flujos de emergencia
  (perdida, mordedura, maltrato — ahí el arreglo es **quitar** movimiento) ·
  celdas de tabla durante un cambio de valor · **salida** de diálogo mientras el
  usuario espera un resultado · filas de la espina de eventos · el fade de
  divisiones durante un scrub.

---

## 📋 Registro de decisiones del PO (no es cola — es memoria)

### Ratificadas 2026-08-05

- **D4 (HEIC)**: se difiere entero, con la ventana de exposición del GPS
  **abierta y documentada**. Ver arriba.
- **Chapa física**: las tres decisiones de modelo de datos (serial generado por
  miMAR y opaco · chapa en blanco que vincula el dueño · la chapa viaja con la
  mascota en una transferencia) **están implementadas y testeadas**. La
  consecuencia aceptada sigue en pie: el dueño anterior conserva para siempre el
  conocimiento de qué serial lleva ese animal.

### 2026-08-04

- **Walk-in de Atender**: el evento entra, marcado con provenance de walk-in no
  verificado, y el dueño recibe aviso inmediato. La irreversibilidad se acepta;
  la irreversibilidad **silenciosa** no.
- **Migración `0156`**: se corrige **fuera del archivo**. No se edita una
  migración aplicada, ni sus comentarios. (Ejecutado: `f8ec48b1`.)
- **D1 — origen de la transferencia al resolver disputa**: los titulares que el
  propio caso de uso cierra. Ejecutado, `34f0fd60`.
- **D2 — contacto del denunciante**: lo ve **cualquier operador con alcance**, y
  se **documenta**. Restringirlo al asignado rompe la derivación entre turnos y
  guardias, que es una necesidad operativa real. Lo que faltaba no era el
  candado sino que estuviera escrito.
- **D3 — provincia entera fuera de CABA**: se construye ahora. Ejecutado,
  `0d2d3f79`.
- **D10 — nexo de bienestar**: el acceso de lectura a la mascota **expira con el
  caso**. Cerrado el caso, desaparece el fundamento (principio de finalidad,
  Ley 25.326).
- **A5 — el refugio de origen se entera SIEMPRE**, no por opt-in. El PO eligió
  la cobertura conociendo el costo. **Mitigación adoptada: divulgación, no
  supresión** — el aviso NO lleva el contacto del hallador, y el perfil declara
  que el refugio recibe el aviso. Ejecutado, `0ec108d7` + `227c74ca`.
- **Export de imagen del mapa**: encuadrar al alcance antes de exportar.
  Ejecutado, `a9d44a65`.
- **`share_telemetry`**: dejar de recolectar y borrar lo acumulado. Ejecutado,
  `61086608` + `0167`.
- **CSS-8 deja de estar gateada**: el PO verificó que `/gob/perdidas` con el
  filtro "todas" lista efectivamente las 500 filas.
- **`/gob/perdidas`**: la supresión **queda**. Des-suprimir después es una
  línea; shipear el tier desnudo no es reversible.
- **Primer admin**: al backlog. No bloquea hasta provisionar un municipio real.
- **PRs**: cerradas las 30 ya absorbidas en `integration/all-20260703`. Quedan
  #760 (rama viva), #762 (review slice, "do not merge") y #707 (docs).

### Dos principios que exceden su pregunta

**P1 — Una opción deshabilitada es aceptable cuando la cosa hace falta de verdad
pero no la podemos hacer ahora.** No es ruido por definición: es ruido cuando
anuncia algo que nadie quiere. Ratifica el idioma ADR-17c (fila deshabilitada +
insignia) y explica por qué "Rastreo GPS · Próximamente" se borró —nadie lo
pidió— mientras "Viaje y movilidad" se quedó. Aplicado a Parquet: **se queda
deshabilitado, sin prometer una fecha que nadie fijó** (`9a5882e0`).

**P2 — No renderizar la estructura de algo vacío. Ocultar, o mostrar lo
MÍNIMO.** ¿Qué sentido tiene ver el esqueleto de una tabla sin filas?

> **Límite que NO se puede cruzar al aplicar P2.** Hay dos vacíos distintos y
> colapsarlos rompería una obligación de privacidad:
>
> - **Ausente** — no hay datos. Se oculta la estructura entera. Es P2.
> - **Suprimido** — SÍ hay datos, y están ocultos por k-anonimato. Acá el aviso
>   es **obligatorio**: si desaparece en silencio, el operador lee "no pasa
>   nada" donde en realidad pasa algo protegido, y encima perdemos la
>   declaración de supresión que el producto promete.
>
> Implementado como estado de tres valores en `fe08b807`. Toda aplicación futura
> de P2 tiene que distinguir los dos casos **antes** de ocultar.

---

## TODO/FIXME en código — clasificados 2026-08-04 (no hay deuda oculta)

Barrido de los 37 marcadores en código productivo. **Resultado: están sanos.**

| Etiqueta | Cuántos | Qué los bloquea |
|---|---|---|
| `TODO(25b)` / `TODO(mi-argentina)` | ~6 | Credenciales de Mi Argentina (OIDC). **Externo** — el stub devuelve 404 con la puerta cerrada |
| `TODO(PO)` | 3 | Decisiones tuyas: sink de observabilidad (Sentry/Vercel/otro), citas por corredor de viaje |
| `TODO(E5-followup)` | 3 | Esperan que exista un tipo de evento `pet_acquired` |
| `TODO(F2-prov-ba-v2)` | 3 | Export PPP de Prov. BA diferido hasta reglamentación municipal de Ley 14.107 |
| `TODO(eno)` / `TODO(authority-integration)` | 2 | Integración con canales oficiales — mismo bloqueo que el outbox |
| `operator-vocabulary.ts` | 3 | No son deuda: son instrucciones de cómo agregar una entrada nueva |
| Falso positivo | 1 | `event-capture-matcher.ts:446` dice "el cuerpo de la nota es TODO el texto" — el "todo" español |

**Conclusión**: no hay TODO huérfano ni sin dueño. La deuda real de este
proyecto no vive en los comentarios del código — vive en los documentos, que es
exactamente lo que esta corrida terminó de arreglar.
