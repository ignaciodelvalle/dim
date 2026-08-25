# Prompt — revisión integral del sistema (Cowork), 2026-08-23

> **Cómo usar este archivo.** Copiá el bloque de abajo y reemplazá los tres
> marcadores por los datos del lanzamiento:
>
> | Marcador | Qué es |
> |---|---|
> | `{{DEPLOY_URL}}` | La **URL inmutable** del deployment bajo prueba. Mientras exista, sirve ese commit y ningún otro |
> | `{{ALIAS_URL}}` | El **alias** de staging, que se re-apunta solo con cada push. Aparece SOLO como valor esperado en dos lugares (el QR y `robots.txt`), nunca como destino de navegación. Va sin hardcodear por el mismo motivo que el SHA |
> | `{{SHA}}` | El commit bajo prueba, 7 caracteres |
>
> Como en el resto de la familia (`prompt-cowork-demo-recorridos.md`,
> `prompt-cowork-recorridos-ciegos.md`,
> `prompt-cowork-review-ui-adversa-2026-08-08.md`), el SHA **no** está escrito acá
> a propósito: un documento con un commit hardcodeado miente al día siguiente. Lo
> mismo vale ahora para el alias.
>
> **Qué es esto.** El PO pidió "probar todo el sistema y asegurarnos de que
> estamos al 100%". Es tres cosas: verificación dirigida de lo que cambió
> (§B–§H), **verificación de las negativas nuevas** (§L — lo más valioso de esta
> corrida), y regresión de los recorridos que ya existen (§I, por referencia). No
> es la corrida ciega: acá SÍ hay guion, porque se mide si funciona, no si se
> entiende.
>
> **Qué cambió respecto del brief del 2026-08-22** (que **nunca se ejecutó**: el
> deploy venía fallando por OOM y las precondiciones no se cerraron):
>
> - **§0.5 es nueva y es la mejora más importante.** Trae lo que YA SABEMOS —
>   nuestra pre-validación del 2026-08-23 y los 12 hallazgos del recorrido del
>   2026-08-18. Un hallazgo conocido se **confirma**, no se redescubre. La corrida
>   anterior quemó horas re-encontrando cosas que ya estaban escritas.
> - **§L (once negativas nuevas) y §M (lo verificado por ingeniería, que NO se
>   clickea)** no existían.
> - **§A dejó de ser un chequeo de migraciones** (ya cerradas) y pasó a ser un
>   humo de 90 segundos sobre identidad de build y sesiones.
> - **§2 asume login manual**, que es el modo real y verificado, no el de
>   respaldo.
> - **§B.4 se movió al final de §B**: se auto-bloqueaba la IP por una hora y se
>   llevaba puesto medio recorrido.
> - **§D arranca con tres mascotas**, una por arco, y fija el orden de D.7.
> - **§7 es nueva**: el contrato de corrida desatendida y multi-sesión.

---

## El bloque para pegar

Sos un agente de QA de navegador (Cowork) revisando miMAR de punta a punta, en
serie, con un solo navegador. Tu trabajo es triple: **verificar lo nuevo** contra
el resultado esperado escrito, **confirmar o refutar lo que ya sabemos** (§0.5),
y **re-tocar lo viejo** para que ~110 commits no se hayan llevado nada puesto.

**Entorno:** `{{DEPLOY_URL}}`
**Build a revisar:** `{{SHA}}`

### 0. La URL es la INMUTABLE del deploy, no el alias

**Navegá SIEMPRE sobre `{{DEPLOY_URL}}`.** El alias `{{ALIAS_URL}}` se re-apunta
solo con cada push, y este proyecto ya pagó una corrida entera hecha contra un
build que cambió a mitad de camino.

**El contrato de precedencia, sin vueltas:**

> **Si algún paso de este documento —o de cualquier brief que este documento
> referencie— te manda al alias, eso es un DEFECTO DE ESTE DOCUMENTO, no un
> hallazgo sobre el producto.** Traducí la URL a `{{DEPLOY_URL}}`, seguí, y
> anotalo UNA vez en una lista al final del informe. No abras un hallazgo por
> cada aparición.

Cuatro consecuencias, ninguna es hallazgo:

1. Si el deployment tiene protección y te contesta una pantalla de autenticación
   de Vercel en vez del producto, **PARÁ y avisá** — falta el token de bypass
   (condición 2 de §7.3).
2. Las cookies son por **host**: la sesión vive en el host de `{{DEPLOY_URL}}`.
   Si cambiás de host, perdiste la sesión.
3. El **QR** y los enlaces absolutos salen de `NEXT_PUBLIC_SITE_URL`, que apunta
   al **alias**. Un QR que codifique `{{ALIAS_URL}}/p/…` estando vos en la URL
   inmutable es **correcto** (§C.3).
4. **`robots.txt` nombra el alias en su línea `Sitemap:`**, por el mismo motivo y
   desde la misma variable de entorno. Es **correcto**, es la misma trampa que el
   QR, y **no es un hallazgo**. (Si la variable estuviera vacía, la línea
   `Sitemap:` directamente no aparece; tampoco es hallazgo tuyo.)

### 0.5. Lo que ya sabemos — confirmá, no redescubras

Esta sección existe porque la corrida del 2026-08-18 gastó horas volviendo a
encontrar cosas que ya estaban escritas. **Cada punto de acá se cierra en menos
de un minuto con un CONFIRMADO / REFUTADO / NO LLEGUÉ**, y esa palabra va en el
informe (§K, punto 10). Lo que ya sabemos no se re-reporta como hallazgo nuevo:
un hallazgo repetido con otro número le hace creer al PO que el sistema empeoró.

#### (a) Resultado de NUESTRA pre-validación, corrida el 2026-08-23 contra ESTE deployment

**1. ARREGLADO — la credencial pública de una mascota perdida podía publicar el
teléfono de un tercero.**

Seis lugares resolvían "el titular" con `ended_at IS NULL` + `limit(1)` y **sin
filtrar por rol**. Un cuidado temporal aceptado inserta una SEGUNDA fila viva en
`ownerships`, así que quién ganaba lo decidía el orden del heap. En la página
pública de una mascota perdida eso publicaba **el teléfono y el nombre de pila
del CUIDADOR**, amparado en el consentimiento del titular. Los seis sitios: la
credencial pública, `/encontre` (×3 consultas), el cartel imprimible y la
notificación de avistaje.

**Cómo lo confirmás en un minuto:** `RI0823-C` marcada como perdida, sin sesión,
en `{{DEPLOY_URL}}/p/{token}` y en `/p/{token}/encontre`: el nombre y el teléfono
que se muestran son los del **titular** (`owner@dim.test` → *Dueño Demo CABA*).
Si aparece el dato de contacto de otra persona, **BLOQUEANTE** y aplica la
condición 4 de §7.3.

**Estado: ARREGLADO EN ESTE BUILD.**

---

**2. ARREGLADO — toda la familia de "cuidado temporal" escribía CERO filas de
auditoría.**

Tres acciones (`caretaker_designated`, `caretaker_grant_accepted`,
`caretaker_grant_revoked`) no estaban ni en el catálogo de TypeScript ni en el
CHECK de la base. Cada `INSERT` violaba la restricción y el error se tragaba con
un log que decía "(action did succeed)": la acción del usuario salía bien y el
rastro no existía. La migración **0201** las agrega.

> **PRECONDICIÓN DEL PO, no checkpoint tuyo:** staging necesita **0201 aplicada**.
> Aplicar migraciones a la base remota es decisión de Ignacio, no acción de un
> agente. Vos **no** podés verificar la fila de auditoría desde el navegador y
> **no es tu trabajo intentarlo**. Si el flujo de cuidado temporal funciona en la
> UI, para vos PASA.

**Estado: ARREGLADO EN ESTE BUILD (con la migración como precondición del PO).**

---

**3. ARREGLADO — la pantalla de éxito al ACEPTAR un cuidado temporal era
inalcanzable.**

`revalidatePath` sobre la misma ruta en la que estaba parado el usuario
desmontaba la isla cliente antes de que llegara a pintar: el mensaje de éxito
existía y nadie lo veía nunca. La superficie de éxito ahora es **el estado
aceptado, renderizado por el servidor**.

**Qué esperar (literal confirmado en `app/(app)/cuidado/[grantToken]/page.tsx`):**

> Título: *"Estás cuidando a {Mascota}"*
> Texto: *"Ya aparece en tus mascotas. Todo lo que anotes queda en su libreta."*
> más un enlace **"Ver su libreta"**.

**No reportes la ausencia del cartel viejo.** El de antes no está porque se
sacó a propósito. Lo que se verifica es que **este** aparezca.

**Estado: ARREGLADO EN ESTE BUILD.**

---

**4. SIGUE ABIERTO — una cuenta de gobierno NUNCA ve la franja de indicadores en
`/gob/panorama`.**

Confirmado en 3 de 3 renders. La página **degrada honestamente**: en vez de
números inventados muestra el aviso de que no pudo cargarlos.

**Literal esperado (confirmado en `components/panorama/KpiChips.tsx` y
`components/panorama/PanoramaMetricsColumn.tsx`):**

> *"No pudimos cargar los indicadores en este momento."*

Una variante más larga de la misma frase existe en el origen de datos
(*"…en este momento. Reintentá en unos segundos."*): si ves ésa, también es
correcta — anotá cuál viste.

**Por qué pasa** (contexto, no tarea): el cubo precalculado es sólo para admin,
así que un render de gobierno corre **48 statements en vez de 2**; un predicado
sobre JSONB no tiene estadísticas y el planificador subestima las filas por
**136x** y elige un nested loop con **5.035 sondeos de índice**; y un pool de
analítica de **2 conexiones** serializa todo.

**Tu tarea es de una línea: confirmá que el texto de degradación está presente y
es legible, y seguí. NO investigues.** Es esperado en este build. El resto del
panorama (mapa, drill, porcentajes) sí se revisa: §G.

**Estado: SIGUE ABIERTO, esperado, no es hallazgo nuevo.**

---

**5. SIGUE ABIERTO — `govt@dim.test` tiene UNA jurisdicción (CABA), no las dos
que promete el seed.**

Es la cuenta fixture de e2e, no `lucas@dim.test`. Un operador de una sola
provincia **correctamente** no recibe la opción "Todas". **No es un bug: no lo
reportes.** Está acá para que no lo descubras y lo cuentes como hallazgo de
alcance.

**Estado: SIGUE ABIERTO, conocido, NO reportable.**

---

**6. CONOCIDO — la base de staging corta conexiones de a ratos.**

Medido: `CONNECT_TIMEOUT` intermitente y un
`terminating connection due to administrator command`. Consecuencia práctica:

> **Una pantalla que muestra un estado vacío o degradado UNA vez y carga bien al
> recargar es INFRAESTRUCTURA, no un hallazgo de producto. Recargá una vez antes
> de reportar cualquier lista vacía.** Reportalo sólo si **reproduce**, y decí
> cuántas veces lo intentaste.

Esto te va a ahorrar media docena de hallazgos falsos. También te obliga a no
tapar uno real: si reproduce tres veces, ES un hallazgo, y va con el conteo.

**Estado: CONOCIDO, condición del entorno.**

---

**7. ARREGLADO — la ficha de una mascota dentro del portal de una organización
tiraba error 500.**

`src/modules/adoption/actions.ts` lleva la directiva `"use server"` y exportaba
una CONSTANTE (un objeto con los techos de consulta de DNI). Next valida **cada**
export de un módulo así y rechaza todo lo que no sea una función asíncrona, con
lo cual el módulo reventaba AL CARGARSE y se llevaba puesta toda página cuyo
grafo de imports lo alcanzara.

No lo veía nada: `tsc` contento, el linter contento, el bundle se genera. Sólo
aparece en runtime, en producción, como un 500. Lo encontró la telemetría de
Vercel del deploy anterior, sobre `/org/{orgToken}/mascotas/{petToken}`.

**Cómo lo confirmás, en diez segundos:** entrá como `alejo@dim.test` a una ficha
de mascota desde el portal de su organización. Tiene que **cargar**, con el
nombre del animal a la vista. Si ves una pantalla de error de aplicación, es un
hallazgo **BLOQUEANTE** y avisá: significa que la corrección no llegó a este
build.

Verificado contra este deployment antes de entregártelo: HTTP 200 y el nombre
del animal renderizado.

**Estado: ARREGLADO EN ESTE BUILD.**

#### (b) Los 12 hallazgos del recorrido del 2026-08-18 (`docs/reviews/2026-08-18-cowork-recorrido-9-roles-eb72f78.md`)

Ese recorrido caminó ~120 checkpoints sobre el build `eb72f78`. Desde entonces
pasaron ~110 commits. **Para cada uno de los 12: confirmá o refutá, en una
línea.** Formato en el informe:

```
0.5b-<n> · CONFIRMADO | REFUTADO | NO LLEGUÉ · <URL> · <hora ART> · <lo que viste>
```

Un **REFUTADO** es tan valioso como un hallazgo nuevo: significa que algo se
arregló y nadie lo sabía.

| # | Qué se encontró el 2026-08-18 | Dónde mirar | Qué esperar hoy |
|---|---|---|---|
| 1 | **Vacuna "Séxtuple (DHPPi-L)" no se puede registrar en Atender**: la desambiguación entra en loop (*"Confirmá la vacuna en el listado de abajo antes de continuar"* ↔ elegir opción ↔ mismo error). Con "Antirrábica" funciona al primer intento | `lilian@` → `/org/{orgToken}/atender/{token}?evento=vacuna` | El más grave de los 12. Probá Séxtuple **y** Antirrábica. Si Séxtuple registra, REFUTADO y decilo fuerte |
| 2 | **`/gob/decomisos` rechaza a las DOS cuentas de gobierno** (CABA y PBA): *"Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador."*, mientras `/gob/decomisos/nuevo` sí abre | `lucas@` y `gov-pba@` → `/gob/decomisos` | **CONOCIDO — no lo re-reportes como hallazgo nuevo.** Pero el código cambió: hoy debería ser un aviso de **sólo lectura** con la lista visible y los botones de mutación ocultos, con el literal *"Podés consultar los episodios de custodia. Para ejecutar o gestionar decomisos, tu usuario tiene que pertenecer a una autoridad sanitaria — pedile al administrador que te asocie a la organización que corresponda."* **Anotá cuál de las dos versiones ves.** Si sigue siendo el rechazo duro, CONFIRMADO |
| 3 | **Ficha pública de adopción con el refugio equivocado**: `/adoptar/DIM-S012-RECO` (Negro) decía *"REFUGIO RESPONSABLE Refugio Patitas del Norte · en custodia desde 7/7/2026"* mientras el catálogo y el hub de transferencias decían que Puerto Madero lo aceptó el 8/7 | sin sesión → `/adoptar/DIM-S012-RECO` | El detalle público debe nombrar la custodia **vigente**. Cruzalo también contra `RI0823-A` en §D.6 |
| 4 | **Check-in post-adopción**: (a) el envío no da confirmación visible, (b) el texto de "¿Cómo está?" no aparece ni en la libreta ni en el detalle, (c) al reabrir `/eventos/nuevo/checkin` vuelve a ofrecer el formulario en vez de "Sin check-ins pendientes" | `adoptante@` → `/eventos/nuevo/checkin` sobre Mora | **Fixture finito, y esto es importante: el recordatorio del 2026-08-18 pudo NO haberse consumido.** Los dos resultados son válidos y ninguno es nuevo: si ves **"Sin check-ins pendientes"**, el recordatorio se consumió (REFUTADO el punto c); si ves **el formulario otra vez**, sigue igual (CONFIRMADO). **No reenvíes** para forzarlo. Los puntos (a) y (b) sí se miden con un envío nuevo si el formulario está disponible |
| 5 | **Texto de desarrollo en la cara del usuario**: `/casos/CAS-SW47-MFMM` mostraba *"Detalle en `external_proceeding_reference` del dispute. Cada caso tiene su propia carátula y juzgado"* | `noeli@` → `/casos/CAS-SW47-MFMM` | Ningún identificador interno visible. Es el mismo patrón que §L.2 (`CAPABILITY_DENIED`): si ves cualquiera de los dos, es la misma clase de fuga |
| 6 | **En la libreta compartida, la vacuna FIRMADA por la vet muestra PROFESIONAL "—"**, mientras la declarada por el dueño muestra el nombre citado | `/libreta/compartir/{shareToken}`, tabla "Registro de vacunación" | La firmada tiene que mostrar la identidad/matrícula del firmante. Armá un link nuevo desde `owner@` (§H) |
| 7 | **Vacuna con foto (dueño)**: el asiento de vacuna no tiene "Ver detalle" (los otros tipos sí) y el adjunto no se ve en ningún lado | `owner@` → libreta de `RI0823-A` tras cargar una vacuna con foto | "Ver detalle" presente y el adjunto visible en algún lado |
| 8 | **Asimetría lectura UI/servidor**: `vet_individual` no ve Miembros ni Servicios en el rail, pero `/org/{t}/miembros` y `/org/{t}/servicios` abren en modo lectura (la escritura sí bloqueada) | `lilian@` tipeando las URLs | Se documentó como "lectura permitida por diseño". **No es la misma clase que §L.10**, donde lo que se leía era texto libre de terceros. Confirmá que sigue siendo sólo-lectura |
| 9 | **Reporte profesional de maltrato**: con "DESCRIPCIÓN DEL ANIMAL *" vacío el submit no da ningún feedback visible, y al enviarse aterriza en la pestaña "Recibidos" **vacía**, sin código ni toast (el reporte está en "Emitidos") | `alejo@` → `/org/{orgToken}/maltrato/nuevo` | Mensaje de validación visible + aterrizaje en la pestaña correcta con el código |
| 10 | **`/admin/programa` agotó el tiempo dos veces** (*"La consulta superó el tiempo de espera · Código 2d59a8bc"*) antes de cargar al tercer intento; `/admin/inteligencia` cargó parcial | `admin@` → `/admin/programa`, `/admin/inteligencia` | **Cruzalo con §0.5 (a) punto 6**: una vez es infraestructura. Dos o tres veces seguidas, con los códigos anotados, es el hallazgo |
| 11 | **Programa CABA muestra dos denominadores lado a lado**: *"faltan ~532 chips sobre el padrón"* vs *"~220.967 mascotas sin chip"* | `lucas@` → `/gob/programa` | Sigue explicado en el Briefing. Si los dos números siguen juntos sin nota adyacente, CONFIRMADO (es de copy, no de datos) |
| 12 | **`/gob/outbox` vacío** tras un reporte crítico y una mordedura de esa misma corrida; `/admin/outbox` sólo con entradas de seed ("transmisión pendiente de endpoint receptor") | `lucas@` → `/gob/outbox`; `admin@` → `/admin/outbox` | Coherente con "Fuera de alcance", pero el canal profesional promete *"notifica inmediatamente a las autoridades"*. Confirmá y anotá la contradicción de copy |

**Tres huecos conocidos más, que el brief anterior NO advertía. Ninguno es
hallazgo nuevo:**

- **`/sugerencias` no tiene formulario.** Literal confirmado en el código:
  *"Canal de sugerencias en preparación."* (título *"Hacer una sugerencia"*).
  Ni sin sesión ni logueado hay nada que enviar. **No lo re-reportes**; si
  aparece un formulario, ESO es la novedad.
- **`/gob/decomisos`** — ver la fila 2 de la tabla. Ya está reportado, para las
  DOS jurisdicciones.
- **El check-in post-adopción es un fixture finito** — ver la fila 4. Los dos
  desenlaces están previstos; ninguno se reporta como nuevo.

**Y estos, del mismo informe, que son cosméticos conocidos:** *"1 mascota
publicadas"*; el botón *"Iniciá sesión para postular"* que aterriza en
`/registro`; *"VACUNA PRÓXIMA A VENCER"* sobre una vacuna vencida hace meses;
*"Refugio verificado por miMAR"* sobre una Red de rescate; *"Buscá entre las orgs
en tus 1 localidad"*; el email crudo como nombre de dueño en `/gob/observaciones`;
la organización llamada *"Refugio Pendiente Verificación"* que figura como
verificada en tres lugares. **Anotalos en una sola línea agrupada si siguen ahí.
No abras siete hallazgos.**

### 1. Build check (antes de escribir una línea)

```
curl -s {{DEPLOY_URL}}/ | grep mimar-version
```

El meta tag trae **7 caracteres**. Compará por PREFIJO contra `{{SHA}}`. Si no
coincide, PARÁ. Sobre una URL inmutable no debería cambiar nunca: si cambia, algo
del lanzamiento está mal y todo lo que midas después es ruido. Se relee en **cada
checkpoint** (§7.1), no sólo al abrir y al cerrar.

La segunda opinión sobre la identidad del build está en §A.1, y es barata:
corrélas juntas.

---

### 2. Sesiones: login manual, de a una cuenta, en serie

**Si tu herramienta no puede escribir `document.cookie`, andá directo al login
manual.** La extensión de Chrome **no puede** — está verificado el 2026-08-18: el
`javascript_tool` bloquea la lectura y la escritura de cookies, así que las
`sb-*` no se pueden ni setear ni leer desde ahí. Eso **no es un fallo tuyo ni del
producto: es la herramienta**. Esa corrida hizo **nueve logins manuales, uno por
cuenta, y los nueve funcionaron**. Este es el modo ESPERADO; no lo declares como
desvío ni pierdas tiempo intentando el camino de cookies primero.

El modo de cookies pre-acuñadas (`qa-sessions.json`, generado con
`scripts/qa-mint-sessions.ts`) sigue existiendo para agentes que SÍ pueden setear
cookies. Si el operador te lo entrega y tu herramienta lo soporta, usalo: sale
gratis. Si no, seguí sin él y anotalo en una línea. **No hay endpoint de bypass y
no lo busques.**

#### El presupuesto de logins — leelo antes de tocar el formulario

| | Valor |
|---|---|
| Techo por **EMAIL** | **5 por minuto · 20 por hora** |
| Techo por IP | 10 por minuto · 100 por hora |
| Dónde se cobra | `src/modules/auth/application/login.ts`, **antes** de tocar el proveedor de auth |
| Se puede resetear en staging | **NO** |
| Un intento fallido | **también gasta presupuesto** |
| Forma de la ventana | **fija, alineada a la hora redonda** — no es deslizante |

**La ventana es fija, y eso te conviene.** La clave del limitador es
`auth_login_email:<hash del email>:hour:<inicio de la hora>` y el bucket vence
en la hora en punto, no 60 minutos después de tu primer intento. Medido en la
base de staging el 2026-08-23. Consecuencia práctica: si una cuenta se te
agotó a las 14:50, a las 15:00 tenés los 20 de vuelta — no esperes una hora,
esperá al cambio de hora. Y si arrancás la corrida justo pasada la hora en
punto, tenés la ventana entera por delante.

Ocho cuentas son ocho logins contra un techo de 20/hora **por email**. Sobra
margen, pero sólo si no lo tirás: **nunca reintentes un login fallido más de una
vez.** Dos intentos malos sobre la misma cuenta son dos de veinte gastados sin
haber entrado. Cambiar `x-real-ip` no esquiva el techo por email.

Los dos textos que vas a ver, y qué significa cada uno:

| Literal | Significa | Qué hacés |
|---|---|---|
| *"Correo o contraseña incorrectos."* | Llegó al proveedor y rebotó | Revisá el campo de email (autofill, ver abajo). **Un** reintento, no más |
| *"Demasiados intentos. Esperá un momento y volvé a probar."* | Se acabó el presupuesto | **PARÁ con esa cuenta.** Esperá a la hora siguiente o seguí con otra. No es hallazgo |

La contraseña compartida de las cuentas sembradas es `Test1234!`.

#### La trampa del autofill de Chrome

El autofill del navegador **precarga silenciosamente el email de una cuenta que
ya usaste** en el formulario de login. En la corrida del 2026-08-18 pasó
exactamente eso: un intento de entrar como `owner@` llevaba `alejo@dim.test` en
el campo. Lo frenó la validación HTML5 del navegador, no el revisor. Si esa
validación no hubiera saltado, la sesión habría sido de otra persona y **todo lo
medido después habría sido ruido con forma de hallazgo.**

Antes de apretar "Iniciar sesión", **leé el campo de email en el DOM** (no a ojo:
el autofill lo pinta igual) y confirmá que dice la cuenta que querés. Si dice
otra, borralo entero y tipealo de nuevo.

#### El ciclo de cambio de cuenta — los cinco pasos, en orden

1. **Cerrá sesión** desde el menú de cuenta. No dejes la anterior viva.
2. Andá a `{{DEPLOY_URL}}/iniciar-sesion`.
3. **Verificá el campo de email en el DOM** antes de enviar (trampa del autofill).
4. Enviá **una vez**. Si falla, un solo reintento; si vuelve a fallar, pará.
5. **VERIFICÁ BAJO QUÉ IDENTIDAD ESTÁS.** Abrí el menú de cuenta y copiá el
   nombre que muestra. Compará contra la tabla de §3. **Sin este paso no
   arranques el recorrido.** No es una nota al pie: es el paso 5, y todo hallazgo
   que escribas después lleva esa identidad al lado.

Los nombres esperados, verificados el 2026-08-18: Dueño Demo CABA · Adriana Sosa
· Dra. Lilian Marrone · Noelí Assandri · Alejo Caride · Lucas Etcheverry ·
Valeria Ocampo · Administración miMAR.

Si el menú de cuenta muestra a otra persona: **cerrá sesión, borrá las cookies
`sb-*` del host, y repetí el ciclo UNA vez.** Si vuelve a pasar, es hallazgo:
escribilo y seguí con otra cuenta.

#### Nota sobre la lista de cuentas del script de acuñado

`scripts/qa-mint-sessions.ts` tiene una lista **DEFAULT de 7 cuentas** que **NO
es la de esta revisión**:

```
owner@ · alejo@ · noeli@ · lilian@ · graciela@ · lucas@ · admin@
```

Contra las **8** de §3, la default **agrega** `graciela@dim.test` y **le faltan**
`adoptante@dim.test` y `gov-pba@dim.test`. Correrlo sin pasarle la lista
explícita te deja sin adoptante y sin la jurisdicción PBA — que es justamente el
contraste que §F y §G miden. Los emails se pasan como primer argumento posicional.

Y un tercer conjunto, distinto de los dos anteriores, que **no se usa acá**: los
fixtures de e2e (`owner@`, `owner2@`, `govt@`, `orgadmin@`, `vet@`, `admin@`),
sembrados por `scripts/seed-test-users.ts` para CI. Si ves esos nombres en algún
lado, no son las cuentas de esta corrida.

---

### 3. Las nueve identidades

| Cuenta | Rol | Lo que sólo se ve desde acá |
|---|---|---|
| *(sin sesión)* | Público | `/p/[token]`, `/adoptar`, `/perdidas`, `/t/[serial]`, denuncia anónima, la API pública, el aviso "encontré tu mascota" (§L.9) |
| `owner@dim.test` | Dueño | Libreta, eventos, perdida/hallazgo, **buscar hogar**, libreta-export, QR del hero, transferencia entre personas (§L.1) |
| `adoptante@dim.test` | Adoptante | Postulación a adopción, check-in post-adopción |
| `lilian@dim.test` | Veterinaria (Clínica Recoleta) | Firma profesional, contraste firmado/declarado, **la bandeja de mensajes sin permiso** (§L.10) |
| `noeli@dim.test` | Voluntaria / transitante | Oferta de tránsito, propuestas recibidas, la campanita del cuidado temporal |
| `alejo@dim.test` | Admin de organización (4 orgs) | **Bandeja de casos**, adopciones, intake, transferencias entre orgs, permisos (§L.3), mordedura (§L.5), techo de DNI (§L.8) |
| `lucas@dim.test` | Gobierno CABA | Panorama, vigilancia, brotes, directorio, la regla de dos personas (§L.7) |
| `gov-pba@dim.test` | Gobierno PBA (La Plata, Quilmes, Morón, Tigre) | Disputas de custodia; el contraste de alcance contra CABA |
| `admin@dim.test` | Admin plataforma | Moderación, chapas, reglas, outbox, usuarios, organizaciones |

Los dos `govt` **no son intercambiables**: uno ve datos donde el otro ve vacíos.
Ese contraste es el instrumento de §F y §G, no un detalle de logística.

> **No confundas estas cuentas con las de e2e.** Los fixtures de CI (`owner@`,
> `owner2@`, `govt@`, `orgadmin@`, `vet@`, `admin@`) son otro conjunto, sembrado
> por `scripts/seed-test-users.ts`. `govt@dim.test` en particular **no** es
> `lucas@dim.test`: mirá §0.5 (a), punto 5.

### 4. Reglas de método

Rigen las mismas que el resto de la familia de briefs
(`prompt-cowork-demo-recorridos.md` §3 y
`prompt-cowork-review-ui-adversa-2026-08-08.md` §1–2). Las cinco que este brief
exige explícitamente:

- **OBSERVACIÓN vs HIPÓTESIS vs SUGERENCIA**, siempre etiquetadas. No tenés el
  código: toda causa es conjetura y tiene que decirlo. Evidencia dura o no se
  reporta (URL + cuenta + hora ART + texto literal + valor medido + captura).
- **"No se puede probar desde el navegador" se reporta como tal, NUNCA como
  PASA.** Este brief nombra al menos cuatro casos así (§B.7, §F.2, §H.4 y la
  mitad comparativa de §L.9). Marcalos `NO VERIFICABLE` y decí qué te faltó. Un
  `PASA` sobre algo que no miraste es el peor resultado posible de esta corrida.
- **Recargá UNA vez antes de reportar un vacío.** La base de staging viene
  cortando conexiones de a ratos (§0.5 (a), punto 6). Una lista vacía que se
  llena al recargar es infraestructura, no producto.
- **La ventana al frente y visible.** En segundo plano Chrome no ejecuta los
  scripts de *reveal* del streaming SSR y la página queda en "Cargando…" con el
  HTML ya recibido. Verificá `document.visibilityState === "visible"`.
- **Trampa de herramienta conocida:** algunos sheets/modales con
  `backdrop-blur` cuelgan la captura por CDP aunque el DOM responda. Leé el DOM
  y anotalo como nota de automatización, no como bug de producto.

### 5. Run-prefix y seguridad del dataset

- Prefijá **todo dato que crees** con `RI0823`. Es append-only: lo que crees
  queda.
- **`RI0822` tiene que dar CERO filas.** Buscalo en los omniboxes de admin y de
  gobierno, y en `/mis-mascotas`. La corrida del 2026-08-22 **nunca se ejecutó**
  (el deploy venía fallando por OOM), así que ese prefijo no existe en ningún
  lado. Si aparece una fila `RI0822`, alguien corrió algo que no está
  documentado: **anotalo como dato**, no como hallazgo de producto, y decilo
  arriba de todo en el informe.
- **Lo que dejó nuestra propia pre-validación del 2026-08-23**, para que no se lo
  atribuyas ni al seed ni a vos:
  - un **reporte sintético marcado "PRUEBA SINTÉTICA"**, generado por el monitor.
    No lo toques y no lo cuentes como hallazgo;
  - un **caso de re-hogar abierto `CAS-EK8J-V9CF`** sobre la mascota
    `DIM-K3XE-5BP7`. Es autorreparable: se cierra solo por el camino normal.
    **Ignoralo**; no lo cierres, no lo uses de base para §D;
  - un **acompañamiento (cuidado temporal) activo sobre esa misma mascota**
    `DIM-K3XE-5BP7`. Misma regla: lectura si querés, escritura nunca.
- **No toques** `DIM-PAMP-0001` (Pampa), el elenco `DIM-DEMO-*`, ni datos
  `RD`/`RC`/`CW` de corridas anteriores — salvo como LECTURA donde este brief lo
  pida.
- **Stop-before-submit** en toda acción destructiva o que mute historia
  compartida ajena (moderación, aprobar/rechazar datos ajenos, renuncias,
  decomisos, lotes de chapas, avistajes sobre perdidas reales, **desactivar una
  cuenta**). El detalle está en `prompt-cowork-demo-recorridos.md`
  §"Repetibilidad".
- **Solo UI**, excepto §B, que ES una API pública y se prueba con `curl`. Si un
  flujo no se completa por la interfaz, eso es un hallazgo, no un motivo para
  buscar un atajo.

### 6. Severidad y formato del hallazgo

| | Criterio |
|---|---|
| **BLOQUEANTE** | Un flujo no se puede completar. O se completa y produce un dato falso. O corrompe datos compartidos. |
| **ALTA** | El usuario toma una decisión equivocada por culpa de la interfaz: consecuencia legal no divulgada, dato presentado como más firme de lo que es, pérdida de trabajo. |
| **MEDIA** | Fricción real, retrabajo, o inconsistencia que enseña algo falso sobre el sistema. |
| **BAJA** | Pulido. No cambia ninguna decisión. |
| **LUPA** | No pudiste verificarlo. Decí exactamente qué te faltó. |

```
### [SEVERIDAD] RI-nn · Título en una línea

**Dónde**: URL exacta · cuenta · hora ART
**Captura**: RI0823-<seccion>-<nn>-<slug>.png
**Observación**: qué viste. Valor medido. Texto literal.
**Reproducción** (obligatoria en ALTA/BLOQUEANTE): pasos numerados
**Impacto**: qué decisión equivocada toma el usuario por esto.
**Hipótesis** / **Sugerencia** (opcionales, marcadas como tales)
```

Sin nombre de captura, el hallazgo no está cerrado.

### 7. Contrato de corrida desatendida

Esta corrida es larga y probablemente cruce más de una sesión. El contrato es
corto y no admite interpretación.

**7.1 — Un checkpoint por sección.** Al cerrar cada sección (§A, §B, §C, …)
escribí una línea con este formato exacto:

```
CHECKPOINT §<sección> · <HH:MM ART> · mimar-version=<7 chars> · <hecho|parcial|bloqueado>
```

El SHA se **re-lee** en cada checkpoint, no se copia del anterior. Es el único
control de que estás midiendo un solo build.

**7.2 — El informe se escribe sobre la marcha, nunca al final.** Abrí el archivo
del informe con el encabezado antes de tocar la primera pantalla, y escribí cada
hallazgo y cada checkpoint **en el momento**. No acumules resultados en tu
contexto para redactarlos después: si la sesión se corta, se pierde todo lo
medido y la corrida hay que rehacerla entera.

**El archivo del informe ES el estado de la corrida.** Para retomar, se lee el
último `CHECKPOINT` escrito y se sigue por la sección siguiente. No hay otra
fuente de verdad, y no hace falta ninguna.

**7.3 — Parar y escalar: exactamente cuatro condiciones.** Ninguna otra cosa
justifica frenar. Todo lo demás se anota y se sigue.

| # | Condición | Qué hacés |
|---|---|---|
| 1 | **El SHA cambió** entre dos checkpoints | PARÁ. Escribí los dos valores y la hora. Todo lo medido después de un cambio de build es ruido |
| 2 | **Muro de autenticación**: el deployment contesta una pantalla de Vercel en vez del producto | PARÁ. Falta el token de bypass; no es un hallazgo de producto |
| 3 | **Todas las sesiones muertas**: no podés entrar con ninguna cuenta | PARÁ. Escribí el informe con una sola sección ("sesiones no disponibles, corrida no ejecutada") |
| 4 | **Hallazgo BLOQUEANTE que corrompe datos compartidos** (una escritura que pisa datos de otro, una custodia que se mueve sola, un dato de un tercero publicado) | PARÁ esa rama, escribí el hallazgo completo con reproducción, y avisá antes de seguir con el resto |

Fuera de esas cuatro: **seguís**. Una pantalla rota, un literal distinto, un
timeout, una lista vacía, un permiso mal puesto — todo eso se anota y la corrida
continúa. Frenar por algo que no está en la tabla cuesta más que el hallazgo.

---

## §A — Humo de 90 segundos (antes de invertir en nada)

Las migraciones que bloqueaban la corrida anterior están cerradas y verificadas.
Lo que reemplaza a aquella comprobación es más barato y más útil: **probar que
estás en el build correcto y que las sesiones sirven, antes de gastar una hora
caminando.**

**A.1 — Identidad del build, por dos caminos independientes.**

```
curl -s {{DEPLOY_URL}}/ | grep mimar-version
curl -sI {{DEPLOY_URL}}/p/DIM-PAMP-0001 | grep -i x-robots-tag
```

- El meta `mimar-version` trae **7 caracteres**; comparalo por PREFIJO contra
  `{{SHA}}`.
- La segunda línea es la **segunda opinión**: el header `X-Robots-Tag` con
  `noarchive, nosnippet` sobre una ficha pública **sólo existe en commits
  recientes**. Si el meta coincide pero el header no está, el meta te está
  mintiendo (caché de CDN, alias mal apuntado, deployment viejo): **PARÁ y
  avisá** en vez de medir un build fantasma.
- Esperado: las dos coinciden. Escribí ambos valores en el encabezado del
  informe.

**A.2 — Una página autenticada por portal.** Entrá con cada una de las cuatro
cuentas que abren un portal distinto y cargá UNA pantalla. Nada más: no camines
todavía.

| Cuenta | Pantalla | Esperado |
|---|---|---|
| `owner@dim.test` | `/mis-mascotas` | El listado con sus mascotas y los KPIs de cumplimiento |
| `alejo@dim.test` | `/org` | El picker "Pertenecés a 4 organizaciones" |
| `lucas@dim.test` | `/gob` | El chip de alcance **"GOB · CABA"** y la cola operativa |
| `admin@dim.test` | `/admin` | El briefing con las colas compartidas |

Después de cada login, **verificá la identidad en el menú de cuenta** (§2, paso
5). Si una cuenta no entra, seguí con las otras y anotalo; si no entra
**ninguna**, aplica la condición 3 de §7.3.

**A.3 — Escribí el primer checkpoint** con el formato de §7.1. Recién ahí
arranca §B.

---

## §B — API pública de credencial (`GET /api/v1/pets/{token}/credential`)

El primer endpoint público del sistema. Todo **sin sesión**, con `curl`.

1. **Camino feliz.** `curl -si {{DEPLOY_URL}}/api/v1/pets/DIM-PAMP-0001/credential`
   - **200**, `application/json`. Sobre con `payloadVersion` (=1), `issuedAt`,
     `staleAfter`, `publicToken`, y las secciones `identity`, `status`,
     `vaccination`, `notices`, `lost`, **cada una con su propio**
     `{"status":"ok","data":…}` o `{"status":"unavailable"}`.
   - `staleAfter` debe caer **5 minutos** después de `issuedAt`.
   - **`cache-control: no-store`** presente. Si falta es ALTA: una credencial
     cacheada es el bug de privacidad que se cerró el 2026-07-07.
2. **Paridad con la página.** Abrí `{{DEPLOY_URL}}/p/DIM-PAMP-0001` al lado: la
   API debe decir lo mismo (nombre, especie, estado, semáforo de vacunación) y
   **NO** debe traer número de microchip, UUIDs internos, fecha de nacimiento o
   de muerte (sólo `ageYears`), provincia, ni filas crudas de vacunación.
   Cualquiera de esos campos es **ALTA** (fuga).
3. **Token inexistente.** `curl -si {{DEPLOY_URL}}/api/v1/pets/DIM-ZZZZ-9999/credential`
   → **404**, cuerpo exactamente `{"error":"not_found"}`, con `no-store`.
4. **Throttle por token.** El límite por lookup es **120/min · 1.200/hora** por
   (token + IP) — B13 lo subió el 2026-08-25 desde 20/min · 100/hora, que era el
   número heredado de `atender_lookup` y refusaba al vecino nº 51 que escanea el
   mismo cartel detrás de una NAT de carrier.

   Pedí **121 veces el MISMO token** en menos de un minuto. Esperado: a partir
   del 121º, **429** con cuerpo exactamente `{"error":"rate_limited"}`. Ciento
   veintiún pedidos de un solo token siguen quedando muy por debajo del techo de
   superficie (es un quinto de él, por diseño), así que esto **no** te bloquea la
   IP.

   Si 121 pedidos secuenciales te resultan caros, es `NO VERIFICABLE` con ese
   motivo escrito — es un resultado honesto. No lo aproximes con menos pedidos y
   lo reportes como fallo: a 20 pedidos el 429 ya **no** tiene que aparecer.
5. **La prueba del oráculo (la más importante de §B).** Compará byte a byte el
   429 de un token que **existe** contra el de uno que **no existe**: tienen que
   ser indistinguibles salvo status y código — mismo cuerpo, mismos headers, y
   **el 429 NO lleva `retry-after`**. Cualquier diferencia es **ALTA**: el
   limitador se volvió un oráculo de existencia.
6. **Lo que NO reportes.** Variar el CASO del token (`dim-pamp-0001`) da un
   contador por-lookup fresco. Es un residual documentado y no escapa al límite
   de superficie.
7. **Degradado.** No podés provocarlo. Si aparece solo: **503**, cuerpo con
   `error: "temporarily_unavailable"` **más las secciones que sobrevivieron**, y
   `retry-after: 30`. Un 503 con cuerpo vacío sería BLOQUEANTE. Si no aparece,
   `NO VERIFICABLE`.
8. **ÚLTIMO de §B — el techo de superficie. Leé esto antes de tirar el primer
   pedido.**

   > **Este checkpoint se movió al final a propósito**, y desde el 2026-08-25 es
   > además **mucho más caro de disparar**. El techo de superficie es
   > **600/min · 6.000/hora POR IP** contando todos los tokens (B13 lo subió
   > desde 60/min · 400/hora). Al dispararlo te **auto-bloqueás la IP por una
   > hora**.
   >
   > OJO con un cambio importante: `/p/{token}`, `/encontre`, `/sighting` y el
   > `opengraph-image` ya **no** comparten techo con este endpoint — cada uno
   > tiene su propio bucket, y desde B13 parte 2 los cuatro también corren a
   > 600/min · 6.000/hora. Quemar el bucket del API ya no te deja sin la
   > credencial pública que necesitan §C, §L.9 y el TOUR 1. Igual va último:
   > 601 pedidos son 601 pedidos.

   Esperado: a partir del 601º token distinto, **429** con el mismo cuerpo
   `{"error":"rate_limited"}` y sin `retry-after`.

   **Lo más probable es que esto sea `NO VERIFICABLE`,** y está bien: 601 pedidos
   secuenciales contra staging no son un checkpoint manual razonable. Anotalo con
   ese motivo. Lo que **sí** conviene verificar barato es que el techo por lookup
   (§B.4) y el de superficie son distintos — si 121 pedidos del MISMO token dan
   429 y 121 pedidos de tokens DISTINTOS no, los dos buckets están separados,
   que es la propiedad que importa.

   **Cuándo correrlo:** al final de §B **sólo si** §C, §L.9 y el TOUR 1 ya están
   hechos. Si no lo están, dejalo para el cierre de toda la corrida y anotá en la
   matriz `PENDIENTE — se corre último`. Si nunca llegás, es `NO VERIFICABLE` con
   ese motivo escrito: es un resultado válido y honesto. Quemar la IP a mitad de
   camino, no.

---

## §C — El QR se dibuja en el cliente

Dejó de inyectarse como SVG del servidor: ahora lo dibuja el navegador como
función pura de la URL.

1. **Hero** — `owner@dim.test`, `/mis-mascotas/{token}`: el QR se ve
   **inmediatamente**, sin skeleton ni pop-in (el render es síncrono, SSR e
   hidratación emiten lo mismo). Es un `<svg role="img">` con `aria-label` —
   verificalo en el DOM. Tinta negra explícita: si se ve gris o teñido es ALTA
   (es el único artefacto que tiene que sobrevivir a la cámara de un teléfono).
2. **Alta** — usá `RI0823-A` (§D) y volvé a
   `/mis-mascotas/nueva/{token}/credencial`. Mismo chequeo, QR más grande.
3. **Escanealo** con el teléfono (o hacé zoom y compará contra `/p/{token}`).
   - Esperado: una **URL absoluta** que termina en `/p/{token}`. El host puede
     ser `{{ALIAS_URL}}` — es **correcto**, no es hallazgo (§0.4).
   - **BLOQUEANTE si** codifica algo relativo (`/p/DIM-…` sin host),
     `undefined`, o una URL que no abre esa ficha pública. Ya pasó una vez, con
     `NEXT_PUBLIC_SITE_URL` vacío.
4. Imprimí la credencial a PDF: el QR no se corta, el marco no le come módulos,
   sigue siendo escaneable en papel.

---

## §D — Buscar hogar por el titular, de punta a punta

El recorrido más largo y el más nuevo. Necesita `owner@dim.test` (titular) y
`alejo@dim.test` (org).

### D.0 — Tres mascotas, una por arco. Creálas ANTES de empezar.

En la corrida vieja un solo animal cargaba los tres arcos y cada negativa
heredaba la basura del paso anterior: una solicitud pendiente que no era la que
creías, un acompañamiento que ya no estaba. **Creá las tres de una, con
`owner@dim.test`, antes de tocar nada:**

| Mascota | Arco | Qué le pasa |
|---|---|---|
| **`RI0823-A`** | Principal | D.1 → D.6 (pedido, acepte, REQ-11, REQ-12), D.7 (las negativas que exigen acompañamiento VIVO) y D.8 (baja en cascada) |
| **`RI0823-B`** | Cancelación | D.9: pedido y **cancelación** por el titular. También la negativa de "ya hay una solicitud pendiente" |
| **`RI0823-C`** | Estado | Se marca como **perdida** para la negativa de mascota perdida, y es la mascota de `/encontre` en §L.9 |

**Localidad Y organización — leé esto antes de crearlas, es el error que mata
esta sección entera.** El panel de organizaciones sólo ofrece **refugios o redes
de rescate verificados que cubran la zona de la mascota**. Creá las tres en
**Palermo, CABA** y el panel te va a ofrecer varias.

**Elegí `Refugio Patitas del Norte`.** Es refugio verificado, cubre CABA /
Palermo y CABA / Recoleta, y `alejo@dim.test` es su **admin** — o sea que después
vas a poder aceptar el pedido desde el lado de la organización, que es el paso
D.2 y la mitad de lo que §D existe para probar.

**NO elijas `Refugio Test`.** También cubre Palermo, así que **te lo va a ofrecer
el panel** y parece una opción legítima. Pero sus miembros son `orgadmin@dim.test`
y `vet@dim.test`, no `alejo@`. Si lo elegís, el pedido se crea bien, y después
`alejo@` abre el caso y ve **"No encontramos ese caso"** — que es la respuesta
CORRECTA, porque el caso no es de ninguna de sus organizaciones. A partir de ahí
D.2 a D.9 quedan inalcanzables y no hay forma de darse cuenta de por qué.

Medido contra esta base el 2026-08-23. Las cuatro organizaciones de `alejo@` son
Patitas del Norte (refugio · Palermo, Recoleta), Clínica Veterinaria Recoleta
(clínica · Recoleta), Red de Rescate Puerto Madero (red · Puerto Madero, Retiro,
San Nicolás) y Mascotas BA Centro (autoridad sanitaria · Retiro, Puerto Madero,
San Nicolás). De esas, **sólo Patitas del Norte** es refugio o red que cubra
Palermo — así que es la única que sirve para §D.

Si creás una mascota fuera de esas localidades, **no tiene destino válido**: el
panel sale vacío. Eso **no es un bug** — es la cobertura, y el brief anterior no
lo decía. Un panel vacío significa "no hay organización elegible para esa zona":
anotá la localidad exacta que cargaste y seguí.

**Precondición de estado:** la mascota debe estar **viva, no perdida, sin disputa
de custodia, sin observación sanitaria y sin custodia de otra organización**, o
el pedido se rechaza. Tres mascotas recién creadas cumplen todo eso; `RI0823-C`
deja de cumplirlo a propósito cuando la marcás perdida — hacelo **después** de
haber usado su estado limpio si lo necesitás.

### D.1 — Estado `none` (`RI0823-A`)

`/mis-mascotas/{token}/buscar-hogar`: título *"Acompañamiento de adopción para
{Mascota}"* y la lista de organizaciones, cada una con su tipo (*Refugio* / *Red
de rescate*) y localidad, y el botón **"Pedir acompañamiento"** (aria-label
*"Pedir acompañamiento a {Org}"*).

El pedido **NO confirma** — es reversible en esta misma pantalla; si te aparece
un modal, es un cambio de comportamiento: anotalo.

Llegá acá **también navegando** (hoja "Más" de la ficha → **"Buscar hogar"**), no
sólo por URL. Si no encontrás el camino, ESO es el hallazgo.

**Anotá la lista completa de organizaciones con su localidad al lado.** Es el
insumo de §L.6.

### D.2 — Estado `pending` (`RI0823-A`)

Pedile acompañamiento a una org de `alejo@`. Esperado: callout azul *"Pedido
enviado a {Org}"*, texto *"Todavía no respondió. Mientras tanto nada cambia:
{Mascota} sigue con vos y no hay ninguna publicación."*, enlace **"Ver la
solicitud"** → `/casos/{código}`, y debajo **"Cancelar el pedido"**.

Verificá que la mascota **NO** aparece todavía en `/adoptar`.

### D.3 — La bandeja de la org

`alejo@dim.test`, `/org/{orgToken}/casos` (descubrí el `orgToken` navegando; no
lo inventes). Esperado: la solicitud en la cola, con chip de tipo **"Solicitud de
nuevo hogar"** y motivo de apertura *"Solicitud de nuevo hogar enviada por el
titular a {Org}"*.

**Aislamiento:** entrá con otra org de `alejo@` y comprobá que ahí NO figura.

### D.4 — El expediente y el acepte

`/casos/{código}` desde la cola. Sección **"Responder la solicitud"**: *"El
titular de {Mascota} le pide a {Org} que acompañe su adopción: publicarlo en la
búsqueda de hogar y evaluar a quienes se postulen."* Dos botones: **"Aceptar el
acompañamiento"** y **"Rechazar la solicitud"**.

- Confirmación del acepte, literal: *"{Org} pasa a tener la custodia registral de
  {Mascota} para publicarlo y evaluar postulantes. {Mascota} sigue viviendo con
  su familia: la organización no lo tiene en su poder. Solo el titular puede dar
  de baja el acompañamiento."* → **"Confirmar el acompañamiento"**.
- Mirá también el paso de rechazo **sin confirmarlo**: *"La solicitud se cierra
  como rechazada y el titular lo va a ver así. No se crea ninguna publicación; el
  titular puede pedírselo a otra organización."*
- Confirmá el acepte. En la línea de tiempo, como **TÍTULO** de la entrada (no
  una nota suelta sin título): **"Solicitud aceptada por la organización"**. Una
  entrada sin título es hallazgo.

**Desde acá `RI0823-A` tiene un acompañamiento VIVO.** D.7 y §L.1 dependen de
eso.

### D.5 — REQ-11: el aviso de posesión, en TODAS las pantallas de la org

Con `alejo@`, verificá que aparece **con las mismas palabras** en: el expediente,
la ficha de la mascota en la org (`/org/{orgToken}/mascotas/{token}`), la cola de
adopciones, la revisión de un postulante y la pantalla de finalizar.

- Literal: *"{Mascota} vive con su familia; {Org} acompaña la adopción."* y
  debajo *"No está en poder de {Org}: sigue en la casa de su titular hasta que se
  concrete la adopción. Solo el titular puede dar de baja el acompañamiento."*
- **Una sola pantalla donde falte es ALTA**: el resto del sistema asume que una
  custodia de refugio significa que el refugio TIENE al animal.

### D.6 — REQ-12: lo público

Sin sesión: en `/adoptar` la tarjeta dice *"Vive con su familia; {Org} acompaña
la adopción."*; en `/adoptar/{token}` la ficha dice *"{Mascota} vive con su
familia actual. {Org} publica la búsqueda de…"*.

**ALTA si** la ficha pública sugiere que el animal está en el refugio.

> **Cruce con §0.5 (b), hallazgo 3:** el detalle público de una mascota
> transferida mostraba la custodia ORIGINAL y no la vigente. Mirá si la ficha de
> `RI0823-A` nombra a la organización correcta.

### D.7 — Las negativas del acompañamiento — CORRE ACÁ, NO DESPUÉS

> **El orden no es estético.** D.7 necesita que `RI0823-A` tenga un
> acompañamiento **activo**. D.8 (la baja en cascada) y D.9 (la cancelación)
> **destruyen exactamente esa precondición**. Si corrés D.7 después, no vas a
> estar probando la negativa: vas a estar mirando una mascota sin
> acompañamiento, que responde otra cosa por otro motivo, y lo vas a reportar
> como si fuera esto. **Saltear el orden invierte la dependencia y produce un
> hallazgo falso.**

Verificá cada una, no las asumas. Frases exactas:

- **Segundo acompañamiento con uno activo** (`RI0823-A`) → *"Esta mascota ya
  tiene una organización acompañando su adopción. Dá de baja ese acompañamiento
  antes de pedir otro."*
- **Pedir con una solicitud pendiente** (usá `RI0823-B`, que quedó en `pending`)
  → *"Ya hay una solicitud de nuevo hogar pendiente para esta mascota. Esperá la
  respuesta o cancelala antes de enviar otra."*
- **Responder desde otra org** → *"Esta solicitud está dirigida a otra
  organización."*
- **Responder una ya respondida** (volvé atrás con el navegador y reintentá) →
  *"Esta solicitud ya fue respondida."*
- **Sobre una mascota perdida** (`RI0823-C`, marcada perdida) → *"Esta mascota
  está reportada como perdida."*
- **Transferencia entre ORGANIZACIONES de una mascota apadrinada** (`RI0823-A`) —
  desde la ficha en la org, proponé transferirla a otra organización. Literal:
  *"Esta custodia es un acompañamiento de adopción: el animal vive con su titular
  y solo el titular puede darlo de baja. No se puede transferir a otra
  organización."* **BLOQUEANTE si la transferencia se concreta.**

**Y acá, no después: corré §L.1** (transferencia entre PERSONAS de una mascota
apadrinada, con `owner@`). Es la gemela de la anterior, con otra frase y otro
actor, y muere con el mismo acompañamiento. Volvé a esta sección cuando la
termines.

### D.8 — La baja en cascada (`RI0823-A`)

Antes, postulate desde **`adoptante@dim.test`** (mensaje `RI0823-…`) para que
haya una postulación abierta que cerrar.

- `owner@`, estado `active`: callout *"{Org} acompaña la adopción de
  {Mascota}"*, texto *"{Mascota} sigue viviendo con vos…"*, enlace **"Ver el
  expediente"**, botón **"Dar de baja el acompañamiento"**.
- Confirmación: *"{Mascota} se retira de la búsqueda de hogar en este momento y
  {Org} deja de tener custodia registral. Las postulaciones que haya quedan
  cerradas y cada persona recibe un aviso…"* → **"Confirmar la baja"**.
- Verificá **las tres consecuencias**: (a) desaparece de `/adoptar`; (b) la
  postulación de `adoptante@` figura cerrada y esa cuenta **recibió aviso** en la
  campanita; (c) el expediente muestra la entrada titulada **"Cancelado por el
  titular"**. Una sola que falte es ALTA: la pantalla prometió las tres.

### D.9 — El otro camino de salida (`RI0823-B`)

Con `RI0823-B`, que quedó en `pending` desde D.7, apretá **"Cancelar el
pedido"**: *"El pedido a {Org} se cancela y la organización deja de verlo. No
empezó nada, así que no se pierde nada…"* → **"Confirmar la cancelación"**.
Verificá que desaparece de la bandeja de `alejo@`.

---

## §E — La banda de emergencias de la portada

Sin sesión, en `{{DEPLOY_URL}}/`.

1. Es un `<section>` con **`aria-label="Emergencias — sin cuenta"`** — verificalo
   en el DOM, no a ojo.
2. **Tres puertas, exactamente tres**, en este orden:
   - *"Perdí una mascota"* · *"Activá el modo perdido y alertá a los vecinos."* → `/mis-mascotas`
   - *"Encontré una mascota"* · *"Escaneá su QR o buscala por señas. Sin cuenta."* → `/perdidas`
   - *"Vi un caso de maltrato"* · *"Denunciá sin cuenta. Te damos un código para seguirla."* → `/denuncias/nueva`
3. **NO debe haber un buscador de códigos en la banda** — se sacó el 2026-08-19
   por decisión del PO. Si lo ves, estás en un build viejo: PARÁ y avisá
   (condición 1 de §7.3).
4. Recorrela **sólo con teclado**: orden de foco = orden visual, foco visible. La
   primera puerta pasa por login y **debe volver a `/mis-mascotas`** después.
5. Verificala a **642px** y con **zoom 200%**: las tres tarjetas legibles, nada
   cortado.

---

## §F — Historial de brotes y k-anonimato (gobierno)

Con `lucas@dim.test` y después `gov-pba@dim.test`, en `/gob/analytics`, sección
**"Historial de brotes"** (columnas **Enfermedad · Localidad · Provincia · Pico ·
Señales**).

1. **Lo que cambió NO se puede producir desde el navegador.** El agrupamiento
   pasó a ser por CÓDIGO de enfermedad y no por el texto de la etiqueta, así que
   dos deletreos de la misma enfermedad deben caer en **UNA sola fila**. No podés
   escribir señales con deletreos distintos desde la UI: **reportalo como
   `NO VERIFICABLE`**, con el motivo. No lo marques PASA.
2. **Lo que SÍ podés chequear** es la coherencia entre suprimidos y filas:
   - Con filas + aviso de agrupamientos ocultos: el número de ocultos tiene que
     ser un número, no un "0" con el aviso presente.
   - Sin filas pero con ocultos, el vacío esperado es **"Historial protegido por
     privacidad"**, explicando que los agrupamientos (enfermedad · localidad) no
     llegan al piso de k-anonimato.
   - Sin filas ni ocultos, el vacío esperado es **"Sin brotes registrados en
     miMAR"** con *"La ausencia de registro no implica ausencia de brotes
     históricos…"*.
   - **ALTA si** un escenario con datos ocultos muestra el vacío de "sin brotes":
     le dice al funcionario "no pasó nada" cuando lo medido es "pasó algo y no
     podemos decir dónde".
3. Compará las dos jurisdicciones: la misma enfermedad no puede aparecer con
   conteos contradictorios entre CABA y PBA para la misma localidad.

**Recordá la regla de la recarga (§4):** un vacío que se llena al recargar es la
base, no el k-anonimato.

---

## §G — Panorama, mapa y catálogo de localidades

El catálogo INDEC cambió río arriba (CABA pasó a publicarse por Comunas). La
regla del sistema es que **CABA son sus 48 barrios**; el importador se auto-cura
en su próxima corrida.

1. `lucas@` y `gov-pba@` en `/gob/panorama`: el mapa carga, se puede hacer drill
   por provincia y por departamento, y "atrás" del navegador devuelve la cámara a
   un estado coherente.
   **Ojo:** la franja de indicadores de arriba **no va a cargar** para una cuenta
   de gobierno. Está previsto y explicado en §0.5 (a), punto 4: confirmás el
   texto de degradación y seguís. **No investigues.**
2. **En cualquier selector de localidad de CABA** (wizard de denuncia, alta de
   mascota, filtros del panorama): esperado, **barrios** — Palermo, Recoleta,
   Villa Urquiza… **ALTA si aparecen "Comuna 1", "Comuna 2"…**: staging todavía
   no corrió el import que las reemplaza.
3. Contá las opciones de CABA. Esperado: **48**. Si son 15 o 63, anotá el número
   exacto — ése es el dato.
4. En el panorama, los porcentajes van con **coma decimal**, no punto.

---

## §H — Libreta sanitaria: exportación

1. `owner@dim.test`, desde la libreta de una mascota propia, botón de exportar
   (abre `/api/mis-mascotas/{token}/libreta-export` en pestaña nueva).
   - Esperado: **200**, HTML imprimible que **dispara solo el diálogo de
     impresión**. No es descarga y no debe pretender ser un `.pdf`.
   - Estructura: identidad → resumen sanitario → secciones por tipo →
     cronología. Imprimilo a PDF: que no se corte y se entienda solo.
2. **Sin sesión**, misma URL → **401**, cuerpo `No autorizado`, nada del
   contenido.
3. Con `alejo@` o `lilian@` (no titulares) → **404**: la exportación es sólo del
   titular, ni siquiera de un cuidador.
4. **Lo que NO podés probar**: una cuenta **borrada** (ARCO supresión) con sesión
   viva ya no puede bajarla. No hay forma de simularla desde el navegador →
   `NO VERIFICABLE`.
5. Mascota sin eventos: sale con estado vacío, no rota.

---

## §I — Regresión de los recorridos ya guionados

No se copian acá. Corré **`docs/agents/prompt-cowork-demo-recorridos.md`** (TOUR
1 a 9) con prefijo `RI0823`, buscando **regresiones**, no narrando. Veredicto
**PASA / FALLA por checkpoint**, nunca por tour entero.

**Antes de arrancar, releé §0.5 (b).** Doce de los checkpoints de esos tours ya
tienen un resultado conocido del 2026-08-18. Tu trabajo ahí es **confirmar o
refutar**, en una línea cada uno — no redescubrirlos.

**Precedencia de URL, otra vez y sin vueltas:** esos briefs son anteriores a la
regla de la URL inmutable y en algún paso pueden mandarte a `{{ALIAS_URL}}`. **Si
un paso te manda al alias, eso es un defecto de ESTE documento (o del que
referencia), no un hallazgo sobre el producto.** Traducí la URL a
`{{DEPLOY_URL}}` y seguí; anotalo una sola vez en una lista al final, sin abrir
un hallazgo por cada aparición.

Orden de prioridad si te quedás sin presupuesto: **TOUR 1 y 2** (el camino del
ciudadano: escanear el QR, ver la credencial, registrar, perder, recuperar — la
premisa del producto) → **TOUR 6** (org admin, donde más tocó el cambio de
custodia) → **TOUR 7 y 8** (gobierno) → **TOUR 9, 3, 4, 5**.

Además, estos puntos que ~110 commits pudieron mover:

- **Notificaciones.** Después de cada mutación que promete un aviso, abrí la
  campanita de la cuenta destinataria. En particular: la observación antirrábica
  (una notificación de vigilancia que podía desaparecer sin rastro), el rechazo
  de una solicitud de nuevo hogar (*"La organización rechazó la solicitud. Podés
  enviar una nueva solicitud a otra organización cuando quieras."*) y el aviso al
  postulante aprobado. **Un aviso prometido por la pantalla y ausente en la
  campanita es ALTA.**
- **Chip-match y perdidas — el segundo vecino.** Marcá `RI0823-C` como perdida y
  registrá el hallazgo/confirmación de chip con una cuenta. Después, **con OTRA
  cuenta, registrá el mismo hallazgo sobre la misma mascota**: el índice de
  custodia cambió y se acotó a propósito para que esto siga siendo posible.
  **BLOQUEANTE si el segundo vecino recibe un error de base de datos crudo o un
  rechazo sin explicación.**
- **Bienestar / maltrato.** Wizard completo de denuncia anónima (respetando
  1/min · 3/hora por IP) y, desde gobierno, la **derivación a organización** —
  que se movió a su propio escritor. Verificá que se completa y que el detalle
  refleja el destinatario correcto.
- **Transferencias entre organizaciones.** Además del rechazo de §D.7 y de §L.4,
  corré una transferencia normal entre dos orgs de `alejo@` sobre una mascota
  `RI0823` intakeada por vos: la propuesta llega, se acepta, la custodia se mueve
  **una sola vez**.
- **Imagen social de la ficha pública.** Pedí la imagen OG de `/p/{token}` para
  muchos tokens distintos: antes resolvía cualquier token sin límite y ahora
  debería estar acotada como el resto de las superficies con token. Si contesta
  200 indefinidamente sobre cientos de tokens inventados, anotalo como LUPA con
  los números que mediste. **Cuidado:** esto también consume el techo de
  superficie por IP; corrélo junto a §B.8, al final, no antes.

---

## §L — Las negativas nuevas

Una **negativa** es el sistema diciendo que no. Son lo más valioso de esta
corrida por una razón asimétrica: cuando una pantalla se rompe, alguien se queja
el mismo día; cuando una negativa deja de negar, **no se nota nunca** — el
sistema empieza a decir que sí y todo parece funcionar mejor. Nadie abre un
ticket porque le dejaron hacer algo.

Estas once son de las últimas ~70 commits. Cada una trae **cómo llegar**, el
**literal exacto** que tiene que aparecer, y **dos severidades**:

| | Cuándo |
|---|---|
| **BLOQUEANTE** | La negativa **no ocurre**: la acción se completa |
| **ALTA** | La negativa ocurre, pero **con las palabras equivocadas** (otra frase, un código crudo, un error genérico de servidor) |

Copiá el texto del DOM, no lo transcribas de memoria. Si el literal que ves
difiere aunque sea en una palabra, el hallazgo es ALTA y va con **las dos
frases**: la esperada y la real.

---

### L.1 — Transferencia entre personas de una mascota apadrinada

**Dónde:** `owner@dim.test` → ficha de una mascota con acompañamiento de adopción
activo → `?sheet=transferir-mascota` → mandarla por email a otra persona.

**Precondición:** la mascota tiene que tener un acompañamiento vivo. Si venís de
§D ya la tenés; si no, armala ahí primero.

**Esperado, literal:**

> *"Un refugio está acompañando la adopción de esta mascota. Antes de transferir
> la titularidad tenés que dar de baja el acompañamiento."*

**Por qué importa:** la transferencia dueño→dueño cierra la fila de dueño y nada
más. La custodia del refugio sobrevive al cambio de titular y queda parada sobre
un desconocido: el catálogo público sigue diciendo "vive con su familia" sobre el
animal de otra persona, y el refugio conserva el poder de finalizar una adopción
a un tercero — que le cierra al dueño nuevo su propia fila de propiedad. Nadie se
entera de que cambió la titularidad.

**Ojo — dos capas, y la frase es la MISMA:** el rechazo aparece al *iniciar* la
transferencia (antes de molestar al destinatario) y otra vez al *aceptarla* (el
acompañamiento puede empezar durante los 7 días de la ventana). Si tenés una
transferencia pendiente a mano, probá también la aceptación.

**No la confundas con su gemela cross-org** de §D.7 (*"Esta custodia es un
acompañamiento de adopción…"*): esa está escrita para la ORG que tiene la fila y
nombra otro actor y otro destino. Son dos frases distintas a propósito. Si acá te
sale la del cross-org, es ALTA.

`BLOQUEANTE` si la transferencia se concreta · `ALTA` si niega con otra frase

---

### L.2 — Gobierno revocando fuera de alcance: ¿se ve el código crudo?

**Esta negativa NO es sobre si niega. Es sobre CÓMO lo dice.** El servidor
contesta con el string `CAPABILITY_DENIED` — un identificador interno, en inglés,
en mayúsculas — y **no hay ninguna traducción en el camino**: la acción lo pasa
tal cual y la UI lo pinta en el `<p>` de error sin tocarlo.

**Precedente directo:** la corrida del 2026-08-18 encontró exactamente esta clase
de fuga en `/casos/CAS-SW47-MFMM`, que le mostraba al usuario *"Detalle en
`external_proceeding_reference` del dispute"*. Un identificador interno impreso
en la cara de un funcionario.

**Dónde, camino A (el que probablemente NO llega):** `lucas@` o `gov-pba@` →
`/gob/directorio?registro=usuarios`. Buscá un/a veterinario/a cuya jurisdicción
de matrícula esté FUERA de tu cobertura (para `gov-pba@`, una matrícula CABA).
**Esperado: el botón "Revocar rol vet" NO aparece.** La pantalla corre el mismo
chequeo de alcance del lado del cliente y esconde el botón. Si el botón aparece
sobre un objetivo fuera de alcance, ESO ya es el hallazgo (ALTA), y apretalo para
ver qué dice.

**Dónde, camino B (el que sí llega, y es seguro):** en esa misma pantalla, la
**selección múltiple** (checkbox por fila) **no filtra por alcance** — sólo por
rol vet. Seleccioná **únicamente** vets fuera de tu alcance (ni uno solo dentro,
para que no se revoque nada real), cargá motivo ≥30 caracteres + 1 archivo de
evidencia, y confirmá. El modal devuelve una lista de fallidos.

**Esperado:** una frase en castellano que le diga a un funcionario qué pasó
(algo del tenor de "fuera de tu jurisdicción"). **Lo que el código produce hoy es
la línea `<8 hex>… — CAPABILITY_DENIED`.**

> ⚠️ No hay literal en castellano que confirmar acá: **no existe**. La expectativa
> es "una frase que un humano entienda"; el valor a medir es qué texto exacto
> aparece en pantalla. Copiálo tal cual.

**Regla de fondo (por si el alcance te confunde):** desde 2026-08-23 revocar la
asignación de otro funcionario exige cobertura **estrictamente más ancha**, no
mera contención. Provincia sobre localidad: sí. Localidad sobre la misma
localidad, o provincia sobre la misma provincia: **NO** — los pares no se pueden
sacar el mandato entre ellos. Y la auto-revocación se niega antes que todo lo
demás, con su propio código crudo: `SELF_REVOCATION_DENIED`.

`BLOQUEANTE` si la revocación fuera de alcance se aplica · `ALTA` si el usuario
lee `CAPABILITY_DENIED` (o cualquier otro identificador interno) en pantalla

---

### L.3 — Concederse un permiso a uno mismo

**Contexto:** `capability.grant` existe para DELEGAR — que un coordinador de
refugio despache los pedidos del equipo sin ser admin. Hasta el 2026-08-22 ni
conceder ni decidir comparaban al beneficiario contra el actor: ese coordinador
podía pedir `custody.transfer` o `adoption.finalize` para sí mismo, entrar a la
pantalla de permisos, encontrar su PROPIO pedido con un botón Aprobar que
funcionaba, y tomarlo. Incluido `capability.grant`, que convierte una delegación
puntual en permanente. **El control ya existía, del lado del navegador; el
servidor nunca preguntaba.**

**Dónde:** `alejo@dim.test` → `/org/{orgToken}/admin/permisos`. En Recoleta hay
solicitudes pendientes (las 5 de la Dra. Lilian Marrone, del 09/08/2026).

**Tres cosas que verificar, en la misma pantalla:**

1. **La matriz:** en la fila del que mira (la propia), las celdas vacías muestran
   un guion `—`, no un botón. El `title` del guion dice, literal:
   > *"No podés concederte permisos a vos mismo"*
   
   y el `aria-label` dice *"Autoconceción bloqueada"*. Verificalo en el DOM.
2. **El bloque "Tus solicitudes":** si tenés un pedido propio pendiente, **no
   tiene botón Aprobar**, y en su lugar dice, literal:
   > *"La tiene que decidir otra persona de la organización: no podés aprobarte
   > permisos a vos mismo."*
3. **Los pedidos ajenos SÍ tienen Aprobar/Denegar.** Si la pantalla escondió
   todo, la delegación se rompió y eso también es hallazgo.

**La frase del servidor** —
> *"No podés concederte permisos a vos mismo. Pedíselo a otro administrador de la
> organización."*

— existe pero **no es alcanzable desde el navegador si los puntos 1 y 2 están
bien**: es la segunda cerradura, la que sostiene cuando la primera no se dibuja.
Si llegás a verla, quiere decir que la UI dejó pasar un botón que no debía
existir: anotá **las dos** observaciones.

`BLOQUEANTE` si podés concederte o aprobarte un permiso · `ALTA` si el guion, el
`title` o la frase del bloque de solicitudes propias faltan o cambiaron

---

### L.4 — Aceptar una transferencia entre organizaciones con disputa de custodia abierta

**Contexto:** *proponer* una transferencia cross-org sí chequeaba que no hubiera
disputa abierta. *Aceptarla*, no — y entre las dos cosas hay una **ventana de 30
días**. Si alguien abre una disputa en el medio, el animal se movía igual, y
después la resolución de la disputa nombraba como "titular anterior" a una
institución que nunca fue parte del pleito. El spine es append-only: esa mala
atribución **no se puede corregir**.

**Dónde:** `alejo@dim.test`. Staging tiene disputas abiertas (§7 del recorrido
2026-08-18 nombra `DIS-PHZ9-SYC6` sobre Bruno, y PBA tiene `DIS-PANO-0002` /
`DIS-PANO-0004`). Necesitás una mascota **con disputa abierta** que esté en
custodia de una de sus orgs. Si no hay ninguna en esa forma, el checkpoint es
`NO VERIFICABLE` — decilo, no lo marques PASA.

Camino: `/org/{orgToken}/mascotas/{token}/transfer` → proponer a otra org de
`alejo@` → aceptar desde `/org/{orgTokenDestino}/transferencias/recibidas`.

**Esperado, literal, en las DOS capas (proponer y aceptar):**

> *"No podés transferir una mascota con disputa de custodia abierta."*

**Ojo con el envoltorio:** la frase tiene que llegar **tal cual**, no envuelta en
un *"No se pudo aceptar la transferencia: …"*. El passthrough del catch está
puesto a propósito para eso. Si la ves envuelta, es ALTA.

**Lo que NO es hallazgo:** una mascota **perdida** SÍ se puede transferir entre
organizaciones — un refugio pasándole a otro un animal encontrado y todavía no
reclamado es el caso normal, no un error. Está fijado con un test. Si te la
rechaza por perdida, ESO es el hallazgo.

`BLOQUEANTE` si la transferencia se acepta · `ALTA` si niega con otra frase o
envuelta en un error genérico

---

### L.5 — Reportar una mordedura desde una organización sin verificar

**Contexto — la más grave de la lista.** Crear una organización no pide más que
un DNI que nadie verifica, y el que la crea queda de admin. Con eso, y el token
DIM leído de una chapita, se podía declarar que el perro de un tercero mordió a
alguien: cartel rojo en la credencial pública, alerta a las autoridades
sanitarias, rehome y adopción bloqueados, y **el dueño no lo puede levantar** —
sólo un profesional o el Estado cierran la ventana. Era la única escritura de org
con consecuencias sin ninguna compuerta.

La regla nueva es una conjunción cuyo segundo término es una disyunción:

```
verificada  Y  (atendió/tuvo a este animal  O  cubre la jurisdicción del INCIDENTE)
```

El brazo de cobertura además está **anclado** a la provincia con la que la
organización fue verificada (una columna que la org no puede editar), porque
antes se lo firmaba ella misma agregándose provincias a su propia lista.

**Dónde.** Necesitás ser admin de una organización **no verificada**. Dos
caminos, en este orden:

- **A (preferido, si existe).** Con `alejo@dim.test`, mirá sus cuatro
  organizaciones en `/org` y buscá una sin el sello de verificada. Si hay una,
  entrá a `/org/{orgToken}/mordedura/nuevo` desde ahí.
- **B (si las cuatro están verificadas).** Ésta es la reproducción fiel del
  hallazgo, y **está permitida porque es exactamente lo que el arreglo tiene que
  frenar**: con `owner@dim.test` → `/cuenta/upgrade` → crear una organización
  llamada `RI…`. Crear una org no exige ningún rol y te deja de admin, así que
  tenés `bite.report` de entrada y la org nace **sin verificar**. Entrá a
  `/org/{orgTokenNuevo}/mordedura/nuevo`.

Completá el wizard sobre **una mascota ajena** (usá el token de una mascota del
elenco de demo como LECTURA — no hace falta tocarla: sólo tipeás su token) y
enviá.

**Esperado, literal — organización sin verificar:**

> *"Tu organización todavía no está verificada por miMAR. Solo una organización
> verificada puede iniciar una observación antirrábica."*

**Esperado, literal — organización verificada pero sin relación ni cobertura**
(la mascota no la atendió nunca y el incidente cae fuera de su jurisdicción):

> *"Tu organización no atendió a esta mascota ni tiene cobertura en la
> jurisdicción del incidente. Reportá la mordedura a la autoridad sanitaria de
> esa zona."*

**La zona que se compara es la del INCIDENTE, no el domicilio de la mascota.** Si
al mover la ubicación del incidente a la zona que cubre la org el sistema sigue
negando, o si al ponerla lejos sigue aceptando, anotá el valor exacto que cargaste.

`BLOQUEANTE` si se crea la observación antirrábica · `ALTA` si niega con otra
frase o con un error genérico de servidor

---

### L.6 — Pedirle acompañamiento a una organización que no cubre la zona

**Contexto (commit `747a1cd58`):** el selector de la página del titular filtraba
las organizaciones por cobertura, pero **la regla de dominio no lo chequeaba**.
La acción es un server action: cualquiera con sesión de titular podía mandar el
id de una org fuera de la lista y crearle una solicitud real. Rojo medido: un
refugio verificado con cobertura Córdoba recibiendo un pedido por una mascota de
La Plata.

**Dónde:** `owner@dim.test` → `/mis-mascotas/{token}/buscar-hogar` (la mascota
`RI…` de §D).

**Lo que se verifica desde el navegador es el filtro:** el panel sólo puede
ofrecer refugios o redes de rescate **verificados** que cubran la localidad (o
que sean provinciales de esa provincia). Anotá la lista completa con su localidad
al lado. Un panel vacío significa "no hay org elegible para esa zona": es un
dato, anotalo, no es bug.

**El literal de la regla de dominio** —
> *"{Org} no cubre la zona de {Mascota}. Elegí una organización que trabaje en
> {localidad}."*

— es la segunda cerradura. **Sólo lo vas a ver si el filtro del selector se
rompió** y te ofreció una org que no corresponde. Si aparece: anotá LAS DOS
cosas, porque el filtro dejó pasar algo.

**Asimetría documentada, para que no la reportes mal:** con localidad, una fila
de cobertura matchea esa localidad **o** es provincial (localidad nula); sin
localidad, cualquier fila de la provincia; sin provincia, nada.

`BLOQUEANTE` si el pedido se crea para una org que no cubre la zona · `ALTA` si
niega con otra frase

---

### L.7 — Decidir una solicitud de la que sos parte (regla de dos personas)

**Contexto:** crear una organización no exige ningún rol. Un funcionario podía
fundar un refugio en su propio barrio, entrar a su propia cola de aprobaciones y
verificarlo él mismo. `verified` no es una medallita: habilita recibir decomisos,
ser destino de re-hogar y figurar en el directorio público. Un solo ser humano,
de punta a punta.

Ahora **tres identidades** descalifican al que decide: solicitante, destinatario e
**iniciador** (quien propuso).

**Dónde — y este camino es completo con UNA sola cuenta:**

1. `lucas@dim.test` → `/gob/directorio?registro=organizaciones`. Buscá una org
   **PENDIENTE** en su alcance (el recorrido 2026-08-18 nombra "Refugio Pendiente
   Verificación" en Recoleta; PBA tiene "Refugio Panorama La Plata (Seed)").
2. Apretá **"Proponer verificación"**. Eso crea una solicitud con `lucas@` como
   iniciador.
3. Andá a `/gob/cola`, abrí **esa** solicitud y apretá **"Aprobar"**.

**Esperado, literal:**

> *"No podés decidir una solicitud en la que sos parte. La tiene que resolver
> otra persona con autoridad en la jurisdicción."*

**La hermana** cubre el atajo de verificación directa (sin pasar por ninguna
solicitud):

> *"No podés verificar una organización que creaste vos. La tiene que verificar
> otra persona."*

Ese botón **hoy no está montado en ninguna pantalla** — el componente existe y su
acción está anotada como "guardada para el futuro". Si te aparece un botón de
verificar-directo en algún lado, **eso solo ya es un dato**: anotá dónde lo
viste, y si lo apretás sobre una org que creaste vos, esperá esa frase.

**Orden importante, para no reportar mal:** el chequeo de dos personas corre
**DESPUÉS** del chequeo de alcance. Una autoridad fuera de jurisdicción tiene que
seguir recibiendo el error de jurisdicción — no enterarse de que la solicitud
resulta ser suya.

**Lo que NO es hallazgo:** la auto-verificación de una clínica de vet solo al
crear la organización. Ese camino verifica por decisión del sistema apoyada en
una matrícula ya verificada, no por una persona aprobándose a sí misma.

`BLOQUEANTE` si podés aprobar tu propia propuesta · `ALTA` si niega con otra
frase, o si niega por "estar fuera de jurisdicción" cuando estás dentro

---

### L.8 — El techo de consultas de DNI del mostrador

**Contexto:** al finalizar una adopción, la organización tipea el DNI del
adoptante para confirmar que tiene cuenta miMAR. Cualquiera con
`adoption.finalize` podía escribir un DNI y aprender si esa persona tiene cuenta
**y cómo se llama**: un oráculo de confirmación sobre datos personales. El PO
eligió **rastro + techo**, no sacar la función: confirmar al adoptante frente al
mostrador es el uso legítimo y no se toca.

| | Valor |
|---|---|
| Techo | **8 por minuto · 60 por hora · 200 por día** |
| Contado por | **ORGANIZACIÓN**, no por usuario — tres cuentas del mismo refugio son un solo barrido |
| Se cobra | **antes** de la lectura: una consulta rechazada no toca los datos |

**Dónde:** `alejo@dim.test` →
`/org/{orgToken}/mascotas/{token}/adoption` (finalizar adopción) → campo de DNI.
Tipeá 9 DNIs inventados de 8 dígitos en menos de un minuto, uno tras otro.

**Esperado a partir del 9º, literal:**

> *"Demasiadas consultas de DNI desde esta organización. Esperá unos minutos y
> volvé a intentar."*

**Antes del techo**, un DNI de formato inválido tiene que dar:

> *"DNI inválido (deben ser 7 a 9 dígitos)."*

**No finalices la adopción.** Este checkpoint termina en el campo de DNI:
stop-before-submit sobre todo lo demás de esa pantalla.

`BLOQUEANTE` si podés hacer 20 consultas seguidas sin que corte · `ALTA` si corta
con otra frase o con un error genérico

---

### L.9 — El aviso "encontré tu mascota" no dice si el token existe

**Contexto:** la puerta anónima de aviso al dueño resolvía el token **antes** de
cobrar el intento, con la justificación escrita de que "un envío rechazado no
debería gastar presupuesto". Esa lectura quedó derogada para todos los demás POST
públicos: **una puerta que resuelve el token antes de cobrar el intento ES un
oráculo de existencia** — la negativa por token desconocido se distingue de la
negativa por token conocido, y sale gratis. Pagar por un tipeo es el costo
aceptado de no responder esa pregunta de arriba.

**Dónde: sin sesión.** Es el checkpoint más barato de esta sección: no gasta
presupuesto de login ni toca ninguna cuenta.

| | Valor |
|---|---|
| Techo del **envío** | **1 por minuto · 10 por hora** por (IP + token) |
| Techo de la **lectura** de `/p/{token}`, `/encontre` y `/sighting` | **60 por minuto · 400 por hora** por IP, cobrado también antes de resolver el token |

**Lo que SÍ podés medir:**

1. Marcá como perdida una mascota `RI…` tuya (**no** toques una perdida real
   ajena) y abrí `{{DEPLOY_URL}}/p/{token}/encontre`.
2. Mandá un aviso. Esperado: se envía.
3. **Mandá otro, dentro del minuto.** Esperado, literal:
   > *"Ya enviaste un aviso hace poco. Probá de nuevo en unos minutos."*

La frase tiene que llegar **antes** que cualquier mensaje sobre la mascota: el
orden es el arreglo. Si en el segundo intento te contesta algo sobre el estado
del animal en vez del techo, el limitador volvió a correr después de resolver el
token — y eso es la regresión.

**Lo que NO podés medir desde el navegador, y por qué:** la mitad interesante de
esta negativa es comparar la respuesta de un token que existe contra la de uno
inventado. **No se puede:** `/p/DIM-ZZZZ-9999/encontre` da un **404 duro** antes
de llegar al formulario, así que no hay envío que comparar. Marcá esa mitad
`NO VERIFICABLE` con este motivo escrito; **no la marques PASA.**

**Dos cosas que NO son hallazgo:**

- El techo de lectura **falla abierto** a propósito si el limitador mismo se
  cae: la credencial es la página de la que depende alguien parado en la calle
  con un perro perdido, y una base degradada no puede convertir al limitador en
  lo que rompe la página. No reportes "no me cortó a los 61" sin haber medido de
  verdad los 61.
- **Un tercer literal** que podés cruzarte si la mascota está en disputa (es la
  ruta correcta, no un error):
  > *"En esta credencial los avisos los recibe la autoridad competente, no la
  > persona registrada como dueña. Enviá tu aviso desde la credencial de la
  > mascota."*

`BLOQUEANTE` si el segundo envío dentro del minuto pasa · `ALTA` si el techo
llega con otra frase, o después de una respuesta que ya reveló algo del animal

---

### L.10 — La bandeja de mensajes de la organización exige el permiso

**Contexto:** la página llamaba al guard **sin atar el resultado**. El resolver
devuelve el fallo, nunca lanza — así que la llamada era decorativa: cualquier
miembro de la org, con cualquier rol y sin el permiso, abría la bandeja tipeando
la URL y **leía nombre, email y texto libre de un tercero**. El encabezado del
archivo afirmaba lo contrario. La fence de authz mira acciones y route handlers,
no páginas, y no lo vio.

**Dónde:** `lilian@dim.test` (vet de planta en Clínica Recoleta, **sin**
`member.invite` — su rail no muestra Miembros y sus 5 permisos siguen pendientes)
→ tipeá `/org/DIM-9XKC-ZDQK/mensajes` en la barra de direcciones.

**Esperado:** un `<h1>` que diga **"Sin acceso"**, y debajo, literal:

> *"No tenés permiso para esta acción. Pedile el alta a un administrador."*

más un enlace **"← Volver al panel"**. **Ningún nombre, ningún email, ningún
texto de mensaje en la página.**

**Contraste obligatorio:** con `alejo@` (admin de esa misma org) la bandeja **sí**
abre. Si niega a los dos, el arreglo se pasó de rosca y eso también es hallazgo.

**Variante, misma familia:** con una cuenta que no pertenece a ninguna
organización activa, el literal esperado es
> *"No pertenecés a ninguna organización activa."*

`BLOQUEANTE` si `lilian@` lee un mensaje ajeno · `ALTA` si niega con otra frase o
con un 404/500 en vez de la pantalla "Sin acceso"

---

### L.11 — Una cuenta institucional desactivada no escribe

**Contexto:** los guards de capacidad resolvían el usuario y el chequeo de
borrado, nada más. Unos 18 puntos de entrada de las organizaciones
(transferencias, tránsito, miembros, vigilancia, rehome, atender) seguían
escribiendo con el kill-switch de mantenimiento activo, y una cuenta
institucional desactivada seguía mutando. Ahora las **lecturas** siguen abiertas
para una cuenta desactivada y las **escrituras** se rechazan.

**Esperado, literal** (en el login y en cualquier escritura de organización):

> *"Tu cuenta institucional está desactivada. Contactá al equipo de miMAR."*

**Precondición honesta:** esto sólo se prueba si **ya existe** una cuenta
institucional desactivada en staging. Mirá `/admin/directorio?registro=usuarios`
con `admin@`: las filas desactivadas llevan el chip **"Desactivada"**.

- **Si hay una:** intentá login con ella y verificá el literal.
- **Si no hay ninguna:** **NO desactives una para probarlo.** Marcá el checkpoint
  `NO VERIFICABLE` y decí que no había ninguna. Desactivar una cuenta es una
  mutación de historia compartida y cae en stop-before-submit.

`BLOQUEANTE` si una cuenta desactivada completa una escritura de organización ·
`ALTA` si niega con otra frase

---

### Resumen de §L para la matriz de §J

| # | Negativa | Cuenta | Literal |
|---|---|---|---|
| L.1 | Transferencia P2P de mascota apadrinada | `owner@` | confirmado |
| L.2 | Revocación fuera de alcance | `lucas@` / `gov-pba@` | **código crudo, sin frase** |
| L.3 | Autoconcesión de capacidad | `alejo@` | confirmado (3 literales) |
| L.4 | Accept cross-org con disputa abierta | `alejo@` | confirmado |
| L.5 | Mordedura desde org sin verificar | `alejo@` | confirmado (2 literales) |
| L.6 | Buscar hogar fuera de cobertura | `owner@` | confirmado |
| L.7 | Decidir la solicitud propia | `lucas@` | confirmado (el 2º literal no tiene botón montado) |
| L.8 | Techo de consultas de DNI | `alejo@` | confirmado (2 literales) |
| L.9 | Oráculo del aviso de mascota encontrada | *(sin sesión)* | confirmado (la mitad comparativa es `NO VERIFICABLE`) |
| L.10 | Bandeja de mensajes sin permiso | `lilian@` | confirmado |
| L.11 | Cuenta institucional desactivada | `admin@` (lectura) | confirmado |

---

## §M — Verificado por ingeniería, no clickeable

Esto **no lo busques.** Cada línea está cubierta por una suite automatizada que
corre en cada gate. Cazarlas desde el navegador cuesta horas y no agrega nada:
son propiedades de la base, del planificador de crons o de transacciones
concurrentes, y el navegador es el peor instrumento posible para medirlas.

La regla es al revés: **si te las cruzás de casualidad y las ves fallar, ES un
hallazgo** — y de los buenos, porque significa que staging divergió de lo que la
suite certifica. Reportalo con la evidencia que tengas. Pero no gastes ni un
minuto yendo a buscarlas.

| Cosa | Estado |
|---|---|
| **Permisos RLS / funciones ejecutables por anónimo** | Cubierto por `__tests__/rls/function-hardening.test.ts` y `__tests__/check-rls-coverage.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Presupuesto de crons (techos declarados y honrados)** | Cubierto por `__tests__/cron-budget-ceiling.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Presupuesto de consultas por request** | Cubierto por `__tests__/check-db-budget.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **El índice de la migración 0195** (una sola custodia de organización viva por mascota) | Cubierto por `__tests__/rehome-shelter-custody-index.test.ts` — corre contra Postgres real, no contra un mock, justamente porque el invariante ES un índice; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Candados de carrera en los escritores de custodia** | Cubierto por `src/modules/rehome/__tests__/owner-row-lock.test.ts` (la fence que deriva la lista de escritores), `src/modules/foster/infrastructure/__tests__/foster-repository.test.ts` y `__tests__/cross-org-transfer.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Candados de carrera en reservas y decisiones** | Cubierto por `__tests__/booking-race.test.ts` y `__tests__/decision-race-guard.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **La fila de auditoría `pii_queried`** | Cubierta por `__tests__/admin-pii-audit-log.test.ts` y `__tests__/adoption-registered-adopter-finalize.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Re-derivación de caché (`rederivePetCache`)** | Cubierta por `__tests__/pet-cache-rederivation.test.ts` y `__tests__/rederive-pet-ownerships.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques |
| **Que las páginas de org aten el resultado del guard de capacidad** | Cubierto por `__tests__/org-page-capability-gate-bound.test.ts`; si lo ves fallar ES un hallazgo, pero no lo busques (el caso alcanzable desde el navegador es §L.10) |

**Una advertencia sobre la primera fila.** Las migraciones `0199` y `0200` —las
que le sacan a `anon` el permiso de ejecutar dos funciones internas— **se
aplicaron sólo a la base local**. Aplicarlas a la base remota es decisión de
Ignacio, no acción de un agente. O sea: la suite está verde y staging **puede no
tener el endurecimiento**. Eso no lo podés medir desde el navegador y **no es tu
trabajo intentarlo**: es una precondición del PO, no un checkpoint tuyo.

---

### Declarado NO VERIFICABLE: una mascota perdida cuyo dueño se borró la cuenta

**`NO VERIFICABLE` (cubierto por `__tests__/public-soft-delete-resolution.test.ts`).**

La superficie pública `/perdidas` no debe publicar la mascota de alguien que
ejerció la supresión de sus datos (Ley 25.326 art. 16). Es una negativa real y
vale la pena verificarla — pero **no acá**:

- Staging tiene **cero** mascotas perdidas con dueño borrado.
- Producir una exige ejecutar un borrado de datos personales **irreversible**
  contra el mismo dataset del que se alimenta `/perdidas`.
- El rédito sería **un solo checkpoint**.

No se hace. **No intentes armarlo**, ni borrando una cuenta de prueba ni pidiendo
que alguien la borre.

**Por qué está escrito acá y no simplemente omitido:** una celda que dice
`NO VERIFICABLE (cubierto por X)` es **una decisión**. Una celda vacía es **un
olvido**. En el informe se ven exactamente igual, y quien lo lea seis meses
después no tiene forma de distinguirlas. Esta línea existe para que se
distingan.

La misma suite cubre las tres superficies públicas de la familia: el listado de
perdidas, el listado de adopción y el aviso al dueño de una mascota encontrada —
las tres resuelven el token por el predicado canónico que filtra los perfiles
suprimidos, y la fence las certifica por conteo con una lista de deuda que **sólo
puede achicarse**.

---

## §J — Matriz de cobertura (obligatoria)

Tabla **sección × cuenta** con `OK`, `HALLAZGO RI-nn`, `NO APLICA` (con motivo),
`NO VERIFICABLE` (con qué te faltó) o `BLOQUEADO` (con qué lo bloqueó). **No se
acepta una celda vacía.** Una celda vacía y una celda que dice
`NO VERIFICABLE (cubierto por X)` se leen igual seis meses después: la primera es
un olvido, la segunda es una decisión. Por eso no se acepta la primera.

Filas mínimas:

| Bloque | Filas |
|---|---|
| **§0.5 (a)** | Los **6** puntos de la pre-validación, cada uno `CONFIRMADO` / `REFUTADO` / `NO LLEGUÉ` |
| **§0.5 (b)** | Los **12** hallazgos del 2026-08-18, mismo veredicto de tres valores |
| **§A** | A.1 identidad de build (meta + header) · A.2 las cuatro sesiones |
| **§B** | B.1 200 · B.2 paridad · B.3 404 · B.4 429 por token · B.5 oráculo · B.6 no-reportable · B.7 503 · **B.8 techo de superficie (o `PENDIENTE — se corre último`)** |
| **§C** | C.1 hero · C.2 alta · C.3 escaneo · C.4 impresión |
| **§D** | D.0 (las tres mascotas creadas, con localidad) y D.1 a D.9 como sub-filas |
| **§E** | La banda: `aria-label`, tres puertas, ausencia del buscador, teclado, 642px/200% |
| **§F** | F.1 (`NO VERIFICABLE` declarado) · F.2 coherencia de suprimidos · F.3 contraste CABA/PBA |
| **§G** | G.1 mapa y drill · G.2 barrios vs comunas · G.3 el conteo exacto · G.4 coma decimal |
| **§H** | H.1 export 200 · H.2 401 · H.3 404 · H.4 (`NO VERIFICABLE` declarado) · H.5 vacío |
| **§L** | **L.1 a L.11**, una fila cada una, con el literal real copiado del DOM al lado del esperado |
| **§M** | **Una sola fila**: `NO VERIFICABLE (cubierto por ingeniería)`. Va escrita aunque no hayas hecho nada — ésa es toda la gracia. Más la línea de la mascota perdida con dueño borrado |
| **§I** | Los nueve tours · notificaciones · chip-match · bienestar · transferencias entre orgs · imagen social |

Y una fila final, aparte de la matriz: **`RI0822` → cantidad de filas
encontradas.** Esperado: **0**.

---

## §K — Definition of Done

1. Build check hecho al empezar y al cerrar, con ambos SHA escritos, **más un
   `CHECKPOINT` por sección** con el SHA releído (§7.1).
2. La matriz de §J completa, sin celdas vacías.
3. §B con los cuatro status probados (200, 404, 429 y el 503 declarado
   `NO VERIFICABLE` si no apareció) y la comparación de oráculo hecha. **B.8
   corrido último o declarado pendiente con el motivo** — nunca corrido temprano.
4. §D llegó hasta la baja en cascada, o dice exactamente en qué paso se trabó, y
   **el orden D.6 → D.7 → D.8 se respetó** (si no, decilo: los resultados de D.7
   no valen).
5. §L con las once negativas cerradas: cada una `BLOQUEANTE` / `ALTA` / `OK` /
   `NO VERIFICABLE`, y **el texto real copiado del DOM** al lado del esperado
   cuando difieren.
6. Cada frase literal que este brief pide, verificada como literal (copiada del
   DOM) o reportada como distinta, con el texto real al lado.
7. Cada hallazgo con URL, cuenta, hora ART, valor medido y **nombre de captura**;
   los ALTA/BLOQUEANTE con pasos numerados de reproducción.
8. Tres secciones sí o sí: **"verificado y limpio"** (con el método), **"no pude
   verificar"** (con el motivo exacto — este brief nombra al menos §B.7, §F.2,
   §H.4 y la mitad comparativa de §L.9) y **"retractaciones"** si mediste algo dos
   veces y la segunda te contradijo.
9. Tabla de todo lo creado con prefijo `RI0823`, la constancia de que lo tomado
   del dataset curado volvió a su estado original, y el conteo de filas `RI0822`
   (esperado 0).
10. **Los 18 puntos de §0.5 cerrados** — los 6 de (a) y los 12 de (b) — cada uno
    con `CONFIRMADO`, `REFUTADO` o `NO LLEGUÉ`. Un `REFUTADO` es un resultado
    valioso y va explicado; un `NO LLEGUÉ` es honesto y también va. Lo único
    inaceptable es que un punto de §0.5 no aparezca en el informe, o que aparezca
    como si fuera un hallazgo nuevo.
11. **El contrato de §7 cumplido**: un `CHECKPOINT` por sección con hora ART y
    SHA; el informe escrito sobre la marcha (no redactado al final); y, si
    frenaste, que haya sido por **una de las cuatro condiciones de §7.3** y esté
    escrito cuál.

**Entregable:** un solo markdown, con el SHA verificado en el encabezado y las
secciones en el orden de este brief.

---

## Pendientes del PO — antes de lanzar

> No es contexto: son **precondiciones**. Cowork no puede resolver ninguna.

**1. Un deploy verde y su URL inmutable.** El brief del 2026-08-22 murió acá: los
builds venían fallando por falta de memoria en Vercel (OOM) y no existía un
`{{DEPLOY_URL}}` que sirviera el código del día. La corrida arranca cuando un
deploy de HEAD o posterior termina verde y su URL inmutable responde el meta
`mimar-version` con el prefijo correcto **y** el header
`X-Robots-Tag: noarchive, nosnippet` sobre `/p/{token}` (§A.1).

**2. La migración `0201_caretaker_audit_actions.sql` aplicada en staging.** Sin
ella, cada acción de la familia de cuidado temporal vuelve a violar el CHECK de
`audit_log` y el error se traga: la UI dice que salió bien y no queda rastro.
Aplicarla a la base remota es trabajo de Ignacio (gate del PO): el agente escribe
migraciones, el humano las aplica. **No es un checkpoint de Cowork** — no puede
verlo desde el navegador y tiene instrucción explícita de no intentarlo.

**3. Las migraciones `0199` y `0200`** —las que le sacan a `anon` el permiso de
ejecutar dos funciones internas— **se aplicaron sólo a la base local**. La suite
está verde y staging **puede no tener el endurecimiento**. También es decisión de
Ignacio, y también está fuera del alcance de Cowork (§M).

**4. Las cuentas y su contraseña.** El modo de sesión de esta corrida es **login
manual, uno por cuenta** (§2): no hace falta acuñar nada, pero sí que las nueve
cuentas de §3 existan en staging con la contraseña compartida `Test1234!`. Si
además querés darle el modo de cookies pre-acuñadas a una herramienta que sí
puede setearlas, el comando es:

```
QA_SUPABASE_URL=https://<ref>.supabase.co QA_SUPABASE_ANON_KEY=<anon> \
  pnpm exec tsx scripts/qa-mint-sessions.ts \
  owner@dim.test,adoptante@dim.test,lilian@dim.test,noeli@dim.test,alejo@dim.test,lucas@dim.test,gov-pba@dim.test,admin@dim.test \
  --json qa-sessions.json
```

Pasá la lista explícita: la default del script trae `graciela@` y **le faltan**
`adoptante@` y `gov-pba@`, que son justamente las dos que sostienen §D y el
contraste de §F/§G.

**5. Los tres valores del handover**, que NO van en este archivo: `{{DEPLOY_URL}}`
(la URL inmutable), `{{ALIAS_URL}}` (el alias de staging) y `{{SHA}}` (7
caracteres). Van en el mensaje que le pegás a Cowork. Un documento con un commit
hardcodeado miente al día siguiente.
