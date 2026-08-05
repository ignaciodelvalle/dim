# PENDIENTES — cola única de trabajo abierto

> **Solo lo que falta.** Lo cerrado vive en los planes del 29, 30, 31, 01-08 y
> 04-08, y en los commits que se citan acá.
> Actualizado **2026-08-05** tras la corrida nocturna que vació la cola.
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

## 🚨 GATE DE DEPLOY — tres acciones manuales, ninguna es código

| # | Qué | Estado 2026-08-05 |
|---|---|---|
| 1 | **Aplicar `0166`-`0170` a la base remota** | **PENDIENTE.** Los cinco archivos existen y están aplicados **sólo en local**: `0166_erase_subject_data_push_subscriptions`, `0167_drop_share_telemetry`, `0168_rls_policies_explicit_roles`, `0169_pet_tags`, `0170_subject_rights_pet_tags`. Aplicar a remoto es decisión de Ignacio (invariante del proyecto). **`0167` BORRA datos** y es irreversible; **`0168` toca RLS de 10 políticas**. Antes y después: `pnpm db:doctor` |
| 2 | **`DEMO_PET_TOKEN` en Vercel** | **PENDIENTE.** El flagship ya está sembrado en staging (`DIM-PAMP-0001`, Pampa, 22 eventos). Falta sólo la variable, y **sólo en el proyecto de staging** — en producción no va, el código exige que ese entorno no tenga mobiliario de demo. Requiere redeploy |
| 3 | **Toggle de leaked-password protection** | **PENDIENTE.** Dashboard de Supabase, un click. Es A9 de la cola vieja del 24/06 |

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

### Verificación pendiente (código escrito, ojo humano no)

| # | Qué | Cómo se cierra |
|---|---|---|
| **MAP-1-v** | La parte **visual** del encuadre al alcance (`a9d44a65`) | Sólo se puede verificar mirando. Exportar desde alcance nacional y desde uno provincial, y confirmar el recuadro aparte de CABA. **Requiere servidor de QA fresco** — ver la sección de arriba |
| **e2e de chapas** | No hay ninguna spec de Playwright para `/t/[serial]`, `cuenta/chapas` ni `admin/chapas` | `ls e2e \| rg -i 'tag\|chapa'` → vacío (2026-08-05). e2e es **gate aparte**, no entra en `pnpm verify`. Convenciones y trampas en `e2e/README.md` |
| **S1 (sugerencia del verify)** | Límite de tasa en la **revocación** de chapas | Hoy el límite por IP está en el resolver público. Revocar exige sesión y titularidad, así que no es un agujero — es endurecimiento sugerido, no hallazgo |
| **Higiene de errores en acciones de chapas** | `revoke-tag.ts` / `activate-tag.ts` devuelven `err.message` crudo en la rama catch — texto interno de la base puede llegar al cliente | Consistente con el patrón existente de acciones del repo (no filtra secretos); unificar al fallback compartido `UNKNOWN_ERROR_FALLBACK` cuando se toque esa familia. Lo señaló la revisión adversarial pre-push |
| **Mapa nacional no determinista (decisión chica del PO)** | `rollupPetsPerLocality` hace `.limit(PER_LAYER_CAP)` **sin `ORDER BY`** (`repository-choropleth.ts:396`): la vista nacional+departamento sirve un subconjunto ARBITRARIO de localidades — dos cargas del mismo mapa pueden mostrar departamentos distintos | Lo destapó el diagnóstico del rojo de CI del 05/08 (`9ab11b9d`). El arreglo obvio es `ORDER BY n DESC` (determinista, prioriza las localidades más grandes), pero cambia una consulta viva de cara al operador — merece un OK del PO, no un fix de test |

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
| **Q5** — tipografías por debajo del piso | **24** (`fontBelowFloor`: 11 core + 8 landing + 5 chapita) | `scripts/design-tokens-css-baseline.json` |
| `lint:empty-states` — "Sin resultados" fuera de `LnEmptyState` | **2** (los dos casos de picker, legítimos) | `scripts/empty-state-baseline.json` |
| Formas de fecha hand-rolled | **~35** que no convergieron a un shape canónico | Documentado en `625e6eba`. **Todas son timezone-safe y reloj de 24h — la fence lo garantiza**; lo que falta es que compartan helper |

**Q5 merece una línea aparte porque no es un one-liner**: subir `.ln-qr-cap` de
8px a 10px **cambia el layout de la credencial**. Se retiran de a uno, con ojo
encima.

### Cola larga de estética (RA-10)

**~20 hallazgos**, ninguno bloqueante, ninguno con fecha de re-verificación
reciente. Los que se veían a simple vista ya cayeron en esta corrida (foco,
columnas que saltan, dock que teletransporta, vocabularios de estado). Lo que
queda es de a uno y con criterio: **21 pesos de fuente inertes** (Mono carga
400/600 y Serif 500/600, así que `font-bold` da 600 y `font-medium` da **400** —
el arreglo es genuinamente ambiguo: 400 es honesto pero consagra un peso no
buscado, 600 respeta la intención pero cambia visiblemente la credencial
insignia, y sumar 500 a `layout.tsx` es una decisión de performance), 5 radios
de chip conviviendo, la micro-tipografía de la credencial pública a 8px.

**Antes de tocar cualquiera de éstos: re-verificar contra el árbol.** La lista
tiene fecha del 04/08 y esta corrida movió mucho CSS.

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
