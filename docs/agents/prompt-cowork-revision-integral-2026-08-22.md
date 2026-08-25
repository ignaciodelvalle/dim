# Prompt — revisión integral del sistema (Cowork), 2026-08-22

> **SUPERSEDIDO por `docs/agents/prompt-cowork-revision-integral-2026-08-23.md`.** Este archivo queda como el registro de que la corrida del 2026-08-22 no se ejecutó, y por qué (ver "Pendientes del PO" al final).

> **Cómo usar este archivo.** Copiá el bloque de abajo y reemplazá
> `{{DEPLOY_URL}}` y `{{SHA}}` por los datos del lanzamiento. Como en el resto
> de la familia (`prompt-cowork-demo-recorridos.md`,
> `prompt-cowork-recorridos-ciegos.md`,
> `prompt-cowork-review-ui-adversa-2026-08-08.md`), el SHA **no** está escrito
> acá a propósito: un documento con un commit hardcodeado miente al día
> siguiente.
>
> **Qué es esto.** El PO pidió "probar todo el sistema y asegurarnos de que
> estamos al 100%". Es mitad verificación dirigida de lo que cambió en ~110
> commits (§B–§H, con el resultado esperado escrito al lado), mitad regresión de
> los recorridos que ya existen (§I, por referencia — no se copian acá). No es
> la corrida ciega: acá SÍ hay guion, porque se mide si funciona, no si se
> entiende.
>
> **Antes de lanzarlo, leé "Pendientes del PO" al final.** Hoy la corrida es
> imposible.

---

## El bloque para pegar

Sos un agente de QA de navegador (Cowork) revisando miMAR de punta a punta, en
serie, con un solo navegador. Tu trabajo es doble: **verificar lo nuevo** contra
el resultado esperado escrito, y **re-tocar lo viejo** para que ~110 commits no
se hayan llevado nada puesto.

**Entorno:** `{{DEPLOY_URL}}`
**Build a revisar:** `{{SHA}}`

### 0. La URL es la INMUTABLE del deploy, no el alias

**NO uses `https://dim-staging.vercel.app`.** Ese alias se re-apunta solo con
cada push, y este proyecto ya pagó una corrida entera hecha contra un build que
cambió a mitad de camino. `{{DEPLOY_URL}}` es la URL inmutable del deployment
del SHA bajo prueba: mientras exista, sirve ese commit y ningún otro.

Tres consecuencias, ninguna es hallazgo:

1. Si el deployment tiene protección y te contesta una pantalla de
   autenticación de Vercel en vez del producto, **PARÁ y avisá** — falta el
   token de bypass.
2. Las cookies son por **host**: seteálas sobre el host de `{{DEPLOY_URL}}`, no
   sobre el alias.
3. El QR y los enlaces absolutos salen de `NEXT_PUBLIC_SITE_URL`, que apunta al
   **alias**. Un QR que codifique `https://dim-staging.vercel.app/p/…` estando
   vos en la URL inmutable es **correcto** (§C).

### 1. Build check (antes de escribir una línea)

```
curl -s {{DEPLOY_URL}}/ | grep mimar-version
```

El meta tag trae **7 caracteres**. Compará por PREFIJO contra `{{SHA}}`. Si no
coincide, PARÁ. Sobre una URL inmutable no debería cambiar nunca: si cambia,
algo del lanzamiento está mal y todo lo que midas después es ruido. Releelo al
cerrar.

### 2. Sesiones: cookies pre-acuñadas, y cómo saber si vencieron

El operador te entrega `qa-sessions.json` (raíz del repo, gitignored), generado
con `scripts/qa-mint-sessions.ts`: un login normal contra Supabase hecho FUERA
del producto. No hay endpoint de bypass y no lo busques.

Cambio de cuenta: (1) borrá todas las cookies `sb-*` del host, (2) seteá la del
JSON con nombre y valor exactos (`path=/`, `secure`, `samesite=lax`), (3)
recargá, (4) **verificá la identidad en el menú de cuenta antes de operar**. Sin
el paso 4 no arranques.

**El JSON está fechado `2026-08-15T18:34:40Z`.** Su access token dura 1 hora; lo
que mantiene viva la sesión es el refresh token, y **rota**. Después de una
semana puede ya no servir. Detectalo así:

| Síntoma | Significa | Qué hacés |
|---|---|---|
| Seteás, recargás y te manda a `/iniciar-sesion` | Sesión muerta | **No reintentes.** Pedí re-acuñar al operador: es un comando |
| Carga, pero el menú de cuenta muestra otra persona | Quedó una `sb-*` vieja | Borrá todas las `sb-*` y repetí el ciclo UNA vez |
| Funciona un rato y a mitad de recorrido desloguea | El refresh rotó | Recorrido **no ejecutado** (no es hallazgo). Avisá |

**Nunca hagas login manual para destrabarte:** 5/min y 20/hora **por EMAIL**
(`src/modules/auth/application/login.ts`), contados antes de tocar GoTrue —
hasta un intento fallido suma, y cambiar `x-real-ip` no lo esquiva.

Si al empezar fallan TODAS las cuentas, escribí el informe con una sola sección
("sesiones vencidas, corrida no ejecutada") y pará. Vale más que media corrida
hecha desde la pestaña anónima.

### 3. Las ocho cuentas

| Cuenta | Rol | Lo que sólo se ve desde acá |
|---|---|---|
| *(sin sesión)* | Público | `/p/[token]`, `/adoptar`, `/perdidas`, `/t/[serial]`, denuncia anónima, la API pública |
| `owner@dim.test` | Dueño | Libreta, eventos, perdida/hallazgo, **buscar hogar**, libreta-export, QR del hero |
| `adoptante@dim.test` | Adoptante | Postulación a adopción, check-in post-adopción |
| `lilian@dim.test` | Veterinaria (Clínica Recoleta) | Firma profesional, contraste firmado/declarado |
| `noeli@dim.test` | Voluntaria / transitante | Oferta de tránsito, propuestas recibidas |
| `alejo@dim.test` | Admin de organización (4 orgs) | **Bandeja de casos**, adopciones, intake, transferencias entre orgs |
| `lucas@dim.test` | Gobierno CABA | Panorama, vigilancia, brotes — jurisdicción con datos |
| `gov-pba@dim.test` | Gobierno PBA (La Plata, Quilmes, Morón, Tigre) | Disputas de custodia; el contraste de alcance contra CABA |
| `admin@dim.test` | Admin plataforma | Moderación, chapas, reglas, outbox, usuarios, organizaciones |

Los dos `govt` **no son intercambiables**: uno ve datos donde el otro ve vacíos.

### 4. Reglas de método

Rigen las mismas que el resto de la familia de briefs (`prompt-cowork-demo-recorridos.md`
§3 y `prompt-cowork-review-ui-adversa-2026-08-08.md` §1–2). Las cuatro que este
brief exige explícitamente:

- **OBSERVACIÓN vs HIPÓTESIS vs SUGERENCIA**, siempre etiquetadas. No tenés el
  código: toda causa es conjetura y tiene que decirlo. Evidencia dura o no se
  reporta (URL + cuenta + hora ART + texto literal + valor medido + captura).
- **"No se puede probar desde el navegador" se reporta como tal, NUNCA como
  PASA.** Este brief nombra al menos tres casos así (§B.7, §F.2, §H.4). Marcalos
  `NO VERIFICABLE` y decí qué te faltó. Un `PASA` sobre algo que no miraste es
  el peor resultado posible de esta corrida.
- **La ventana al frente y visible.** En segundo plano Chrome no ejecuta los
  scripts de *reveal* del streaming SSR y la página queda en "Cargando…" con el
  HTML ya recibido. Verificá `document.visibilityState === "visible"`.
- **Trampa de herramienta conocida:** algunos sheets/modales con
  `backdrop-blur` cuelgan la captura por CDP aunque el DOM responda. Leé el DOM
  y anotalo como nota de automatización, no como bug de producto.

### 5. Run-prefix y seguridad del dataset

- Prefijá **todo dato que crees** con `RI0822`. Es append-only: lo que crees
  queda.
- **No toques** `DIM-PAMP-0001` (Pampa), el elenco `DIM-DEMO-*`, ni datos
  `RD`/`RC`/`CW` de corridas anteriores — salvo como LECTURA donde este brief lo
  pida.
- **Stop-before-submit** en toda acción destructiva o que mute historia
  compartida ajena (moderación, aprobar/rechazar datos ajenos, renuncias,
  decomisos, lotes de chapas, avistajes sobre perdidas reales). El detalle está
  en `prompt-cowork-demo-recorridos.md` §"Repetibilidad".
- **Solo UI**, excepto §B, que ES una API pública y se prueba con `curl`. Si un
  flujo no se completa por la interfaz, eso es un hallazgo, no un motivo para
  buscar un atajo.

### 6. Severidad y formato del hallazgo

| | Criterio |
|---|---|
| **BLOQUEANTE** | Un flujo no se puede completar. O se completa y produce un dato falso. |
| **ALTA** | El usuario toma una decisión equivocada por culpa de la interfaz: consecuencia legal no divulgada, dato presentado como más firme de lo que es, pérdida de trabajo. |
| **MEDIA** | Fricción real, retrabajo, o inconsistencia que enseña algo falso sobre el sistema. |
| **BAJA** | Pulido. No cambia ninguna decisión. |
| **LUPA** | No pudiste verificarlo. Decí exactamente qué te faltó. |

```
### [SEVERIDAD] RI-nn · Título en una línea

**Dónde**: URL exacta · cuenta · hora ART
**Captura**: RI0822-<seccion>-<nn>-<slug>.png
**Observación**: qué viste. Valor medido. Texto literal.
**Reproducción** (obligatoria en ALTA/BLOQUEANTE): pasos numerados
**Impacto**: qué decisión equivocada toma el usuario por esto.
**Hipótesis** / **Sugerencia** (opcionales, marcadas como tales)
```

Sin nombre de captura, el hallazgo no está cerrado.

---

## §A — Precondición: ¿están las migraciones?

Antes de §D, 60 segundos de comprobación indirecta (no podés consultar la base):

1. Con `owner@dim.test`, en una mascota propia, abrí
   `/mis-mascotas/{token}/buscar-hogar`.
2. **Si las migraciones están:** renderiza *"Acompañamiento de adopción para
   {Mascota}"* (titular) o *"Buscar nuevo hogar para {Mascota}"* (tránsito), con
   el panel de organizaciones.
3. **Si FALTAN:** la página cae al error boundary ("Algo salió mal"), o
   renderiza y **"Pedir acompañamiento" falla al confirmar** con un error de
   servidor genérico. La feature lee y escribe en columnas e índices que
   0194–0196 crean.
4. En ese caso **§D queda `BLOQUEADA`**, lo escribís así, y seguís con el resto.
   No es hallazgo de producto: es una precondición faltante.

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
4. **Throttle.** ⚠️ **NÚMEROS DESACTUALIZADOS — este brief quedó superseded por
   `prompt-cowork-revision-integral-2026-08-23.md`; usá ése.** Los valores de
   abajo (20/min · 100/hora por lookup; 60/min · 400/hora de superficie) fueron
   los vigentes hasta el 2026-08-25, cuando B13 los llevó a **120/min ·
   1.200/hora** y **600/min · 6.000/hora** respectivamente. Se dejan escritos
   para que un informe viejo siga siendo legible, no para correrlos.

   Más de **20 pedidos del mismo token en un minuto** → **429**, cuerpo
   exactamente `{"error":"rate_limited"}`. El límite por lookup es
   **20/min · 100/hora** por (token + IP); el de superficie, **60/min · 400/hora
   por IP** contando todos los tokens — para verlo, pedí >60 tokens distintos en
   un minuto.
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

---

## §C — El QR se dibuja en el cliente

Dejó de inyectarse como SVG del servidor: ahora lo dibuja el navegador como
función pura de la URL.

1. **Hero** — `owner@dim.test`, `/mis-mascotas/{token}`: el QR se ve
   **inmediatamente**, sin skeleton ni pop-in (el render es síncrono, SSR e
   hidratación emiten lo mismo). Es un `<svg role="img">` con `aria-label` —
   verificalo en el DOM. Tinta negra explícita: si se ve gris o teñido es ALTA
   (es el único artefacto que tiene que sobrevivir a la cámara de un teléfono).
2. **Alta** — creá `RI0822-<nombre>` y llegá a
   `/mis-mascotas/nueva/{token}/credencial`. Mismo chequeo, QR más grande.
3. **Escanealo** con el teléfono (o hacé zoom y compará contra `/p/{token}`).
   - Esperado: una **URL absoluta** que termina en `/p/{token}`. El host puede
     ser `dim-staging.vercel.app` — es correcto (§0.3).
   - **BLOQUEANTE si** codifica algo relativo (`/p/DIM-…` sin host),
     `undefined`, o una URL que no abre esa ficha pública. Ya pasó una vez, con
     `NEXT_PUBLIC_SITE_URL` vacío.
4. Imprimí la credencial a PDF: el QR no se corta, el marco no le come módulos,
   sigue siendo escaneable en papel.

---

## §D — Buscar hogar por el titular, de punta a punta

El recorrido más largo y el más nuevo. Necesita `owner@dim.test` (titular) y
`alejo@dim.test` (org). Usá una mascota **creada por vos** (`RI0822-…`).

La mascota debe estar **viva, no perdida, sin disputa de custodia, sin
observación sanitaria y sin custodia de otra organización**, o el pedido se
rechaza (§D.7). La org debe ser **refugio o red de rescate verificado** que
cubra la zona — el panel sólo ofrece esas. Panel vacío = no hay org elegible
para esa zona: es un dato, anotalo, no es bug.

1. **Estado `none`** — `/mis-mascotas/{token}/buscar-hogar`: título
   *"Acompañamiento de adopción para {Mascota}"* y la lista de organizaciones,
   cada una con su tipo (*Refugio* / *Red de rescate*) y localidad, y el botón
   **"Pedir acompañamiento"** (aria-label *"Pedir acompañamiento a {Org}"*).
   El pedido **NO confirma** — es reversible en esta misma pantalla; si te
   aparece un modal, es un cambio de comportamiento: anotalo.
   Llegá acá **también navegando** (hoja "Más" de la ficha → **"Buscar
   hogar"**), no sólo por URL. Si no encontrás el camino, ESO es el hallazgo.
2. **Estado `pending`** — pedile a una org de `alejo@`. Esperado: callout azul
   *"Pedido enviado a {Org}"*, texto *"Todavía no respondió. Mientras tanto nada
   cambia: {Mascota} sigue con vos y no hay ninguna publicación."*, enlace **"Ver
   la solicitud"** → `/casos/{código}`, y debajo **"Cancelar el pedido"**.
   Verificá que la mascota **NO** aparece todavía en `/adoptar`.
3. **La bandeja de la org** — `alejo@dim.test`, `/org/{orgToken}/casos`
   (descubrí el `orgToken` navegando; no lo inventes). Esperado: la solicitud en
   la cola, con chip de tipo **"Solicitud de nuevo hogar"** y motivo de apertura
   *"Solicitud de nuevo hogar enviada por el titular a {Org}"*.
   **Aislamiento:** entrá con otra org de `alejo@` y comprobá que ahí NO figura.
4. **El expediente** — `/casos/{código}` desde la cola. Sección **"Responder la
   solicitud"**: *"El titular de {Mascota} le pide a {Org} que acompañe su
   adopción: publicarlo en la búsqueda de hogar y evaluar a quienes se
   postulen."* Dos botones: **"Aceptar el acompañamiento"** y **"Rechazar la
   solicitud"**.
   - Confirmación del acepte, literal: *"{Org} pasa a tener la custodia
     registral de {Mascota} para publicarlo y evaluar postulantes. {Mascota}
     sigue viviendo con su familia: la organización no lo tiene en su poder.
     Solo el titular puede dar de baja el acompañamiento."* → **"Confirmar el
     acompañamiento"**.
   - Mirá también el paso de rechazo **sin confirmarlo**: *"La solicitud se
     cierra como rechazada y el titular lo va a ver así. No se crea ninguna
     publicación; el titular puede pedírselo a otra organización."*
   - Confirmá el acepte. En la línea de tiempo, como **TÍTULO** de la entrada
     (no una nota suelta sin título): **"Solicitud aceptada por la
     organización"**. Una entrada sin título es hallazgo.
5. **REQ-11 — el aviso de posesión, en TODAS las pantallas de la org.** Con
   `alejo@`, verificá que aparece **con las mismas palabras** en: el expediente,
   la ficha de la mascota en la org (`/org/{orgToken}/mascotas/{token}`), la cola
   de adopciones, la revisión de un postulante y la pantalla de finalizar.
   - Literal: *"{Mascota} vive con su familia; {Org} acompaña la adopción."* y
     debajo *"No está en poder de {Org}: sigue en la casa de su titular hasta
     que se concrete la adopción. Solo el titular puede dar de baja el
     acompañamiento."*
   - **Una sola pantalla donde falte es ALTA**: el resto del sistema asume que
     una custodia de refugio significa que el refugio TIENE al animal.
6. **REQ-12 — lo público**, sin sesión: en `/adoptar` la tarjeta dice *"Vive con
   su familia; {Org} acompaña la adopción."*; en `/adoptar/{token}` la ficha
   dice *"{Mascota} vive con su familia actual. {Org} publica la búsqueda de…"*.
   **ALTA si** la ficha pública sugiere que el animal está en el refugio.
7. **Las negativas — verificalas, no las asumas.** Frases exactas:
   - Segundo acompañamiento con uno activo → *"Esta mascota ya tiene una
     organización acompañando su adopción. Dá de baja ese acompañamiento antes
     de pedir otro."*
   - Pedir con una solicitud pendiente → *"Ya hay una solicitud de nuevo hogar
     pendiente para esta mascota. Esperá la respuesta o cancelala antes de
     enviar otra."*
   - Responder desde otra org → *"Esta solicitud está dirigida a otra
     organización."*
   - Responder una ya respondida (volvé atrás con el navegador y reintentá) →
     *"Esta solicitud ya fue respondida."*
   - Sobre una mascota perdida → *"Esta mascota está reportada como perdida."*
   - **Transferencia entre orgs de una mascota apadrinada** — desde la ficha en
     la org, proponé transferirla a otra organización. Literal: *"Esta custodia
     es un acompañamiento de adopción: el animal vive con su titular y solo el
     titular puede darlo de baja. No se puede transferir a otra organización."*
     **BLOQUEANTE si la transferencia se concreta.**
8. **La baja en cascada.** Antes, postulate desde **`adoptante@dim.test`**
   (mensaje `RI0822-…`) para que haya una postulación abierta que cerrar.
   - `owner@`, estado `active`: callout *"{Org} acompaña la adopción de
     {Mascota}"*, texto *"{Mascota} sigue viviendo con vos…"*, enlace **"Ver el
     expediente"**, botón **"Dar de baja el acompañamiento"**.
   - Confirmación: *"{Mascota} se retira de la búsqueda de hogar en este momento
     y {Org} deja de tener custodia registral. Las postulaciones que haya quedan
     cerradas y cada persona recibe un aviso…"* → **"Confirmar la baja"**.
   - Verificá **las tres consecuencias**: (a) desaparece de `/adoptar`; (b) la
     postulación de `adoptante@` figura cerrada y esa cuenta **recibió aviso** en
     la campanita; (c) el expediente muestra la entrada titulada **"Cancelado
     por el titular"**. Una sola que falte es ALTA: la pantalla prometió las
     tres.
9. **El otro camino de salida.** Con otra mascota `RI0822`, repetí §D.1–2 y
   apretá **"Cancelar el pedido"**: *"El pedido a {Org} se cancela y la
   organización deja de verlo. No empezó nada, así que no se pierde nada…"* →
   **"Confirmar la cancelación"**. Verificá que desaparece de la bandeja.

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
   por decisión del PO. Si lo ves, estás en un build viejo: PARÁ y avisá.
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
   dos deletreos de la misma enfermedad deben caer en **UNA sola fila**. No
   podés escribir señales con deletreos distintos desde la UI: **reportalo como
   `NO VERIFICABLE`**, con el motivo. No lo marques PASA.
2. **Lo que SÍ podés chequear** es la coherencia entre suprimidos y filas:
   - Con filas + aviso de agrupamientos ocultos: el número de ocultos tiene que
     ser un número, no un "0" con el aviso presente.
   - Sin filas pero con ocultos, el vacío esperado es **"Historial protegido por
     privacidad"**, explicando que los agrupamientos (enfermedad · localidad)
     no llegan al piso de k-anonimato.
   - Sin filas ni ocultos, el vacío esperado es **"Sin brotes registrados en
     miMAR"** con *"La ausencia de registro no implica ausencia de brotes
     históricos…"*.
   - **ALTA si** un escenario con datos ocultos muestra el vacío de "sin
     brotes": le dice al funcionario "no pasó nada" cuando lo medido es "pasó
     algo y no podemos decir dónde".
3. Compará las dos jurisdicciones: la misma enfermedad no puede aparecer con
   conteos contradictorios entre CABA y PBA para la misma localidad.

---

## §G — Panorama, mapa y catálogo de localidades

El catálogo INDEC cambió río arriba (CABA pasó a publicarse por Comunas). La
regla del sistema es que **CABA son sus 48 barrios**; el importador se auto-cura
en su próxima corrida.

1. `lucas@` y `gov-pba@` en `/gob/panorama`: el mapa carga, se puede hacer drill
   por provincia y por departamento, y "atrás" del navegador devuelve la cámara
   a un estado coherente.
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
1 a 9) con prefijo `RI0822`, buscando **regresiones**, no narrando. Veredicto
**PASA / FALLA por checkpoint**, nunca por tour entero.

Orden de prioridad si te quedás sin presupuesto: **TOUR 1 y 2** (el camino del
ciudadano: escanear el QR, ver la credencial, registrar, perder, recuperar — la
premisa del producto) → **TOUR 6** (org admin, donde más tocó el cambio de
custodia) → **TOUR 7 y 8** (gobierno) → **TOUR 9, 3, 4, 5**.

Además, estos puntos que ~110 commits pudieron mover:

- **Notificaciones.** Después de cada mutación que promete un aviso, abrí la
  campanita de la cuenta destinataria. En particular: la observación
  antirrábica (una notificación de vigilancia que podía desaparecer sin rastro),
  el rechazo de una solicitud de nuevo hogar (*"La organización rechazó la
  solicitud. Podés enviar una nueva solicitud a otra organización cuando
  quieras."*) y el aviso al postulante aprobado. **Un aviso prometido por la
  pantalla y ausente en la campanita es ALTA.**
- **Chip-match y perdidas — el segundo vecino.** Marcá una mascota `RI0822` como
  perdida y registrá el hallazgo/confirmación de chip con una cuenta. Después,
  **con OTRA cuenta, registrá el mismo hallazgo sobre la misma mascota**: el
  índice de custodia cambió y se acotó a propósito para que esto siga siendo
  posible. **BLOQUEANTE si el segundo vecino recibe un error de base de datos
  crudo o un rechazo sin explicación.**
- **Bienestar / maltrato.** Wizard completo de denuncia anónima (respetando
  1/min · 3/hora por IP) y, desde gobierno, la **derivación a organización** —
  que se movió a su propio escritor. Verificá que se completa y que el detalle
  refleja el destinatario correcto.
- **Transferencias entre organizaciones.** Además del rechazo de §D.7, corré una
  transferencia normal entre dos orgs de `alejo@` sobre una mascota `RI0822`
  intakeada por vos: la propuesta llega, se acepta, la custodia se mueve **una
  sola vez**.
- **Imagen social de la ficha pública.** Pedí la imagen OG de `/p/{token}` para
  muchos tokens distintos: antes resolvía cualquier token sin límite y ahora
  debería estar acotada como el resto de las superficies con token. Si contesta
  200 indefinidamente sobre cientos de tokens inventados, anotalo como LUPA con
  los números que mediste.

---

## §J — Matriz de cobertura (obligatoria)

Tabla **sección × cuenta** con `OK`, `HALLAZGO RI-nn`, `NO APLICA` (con motivo),
`NO VERIFICABLE` (con qué te faltó) o `BLOQUEADO` (con qué lo bloqueó). **No se
acepta una celda vacía.**

Filas mínimas: §B API · §C QR · §D rehome (los 9 pasos como sub-filas) · §E
banda · §F brotes · §G panorama/localidades · §H libreta · §I los nueve tours ·
notificaciones · chip-match · bienestar · transferencias.

---

## §K — Definition of Done

1. Build check hecho al empezar y al cerrar, con ambos SHA escritos.
2. La matriz de §J completa, sin celdas vacías.
3. §B con los cuatro status probados (200, 404, 429 y el 503 declarado
   `NO VERIFICABLE` si no apareció) y la comparación de oráculo hecha.
4. §D llegó hasta la baja en cascada, o dice exactamente en qué paso se trabó.
5. Cada frase literal que este brief pide, verificada como literal (copiada del
   DOM) o reportada como distinta, con el texto real al lado.
6. Cada hallazgo con URL, cuenta, hora ART, valor medido y **nombre de
   captura**; los ALTA/BLOQUEANTE con pasos numerados de reproducción.
7. Tres secciones sí o sí: **"verificado y limpio"** (con el método),
   **"no pude verificar"** (con el motivo exacto — este brief nombra al menos
   §B.7, §F.2 y §H.4) y **"retractaciones"** si mediste algo dos veces y la
   segunda te contradijo.
8. Tabla de todo lo creado con prefijo `RI0822`, y constancia de que lo tomado
   del dataset curado volvió a su estado original.
9. Las cuatro preguntas de cierre de la familia: ¿en qué momento no supiste si
   algo había pasado? ¿hiciste algo dos veces por no saber si salió? ¿qué número
   no le creíste? ¿qué pareció abandonado, inalcanzable o contradictorio?

**Entregable:** un solo markdown, con el SHA verificado en el encabezado y las
secciones en el orden de este brief.

---

## Pendientes del PO — la corrida NO se lanza hasta que los tres estén cerrados

> No es contexto: son **precondiciones**. Cowork no puede resolver ninguna, y
> lanzarlo antes produce un informe que no significa nada.

**1. No hay deploy de staging desde `9abbfb5f`** — los builds vienen fallando por
falta de memoria en Vercel (OOM). Mientras siga así **no existe un
`{{DEPLOY_URL}}` que sirva el código de hoy**, y §B, §C, §D y §F son
inejecutables: son cambios de las últimas ~110 commits. La corrida arranca
cuando un deploy de HEAD o posterior termina verde y su URL inmutable responde
el meta `mimar-version` con el prefijo correcto.

**2. Las migraciones 0194, 0195 y 0196 tienen que estar aplicadas en staging
ANTES de §D:**

- `0194_titular_only_add_rehome_sponsorship.sql`
- `0195_ownerships_one_active_org_shelter_custody_per_pet.sql`
- `0196_drop_draft_shelter_custody_index.sql`

Sin ellas el síntoma esperado es que `/mis-mascotas/{token}/buscar-hogar` caiga
al error boundary, o que renderice y **"Pedir acompañamiento" falle al
confirmar** con un error de servidor genérico. Cowork tiene la comprobación
indirecta en §A y la orden de marcar §D como `BLOQUEADA` — pero eso convierte el
recorrido más nuevo del sistema en una fila vacía de la matriz. Aplicarlas es
trabajo de Ignacio (gate del PO): el agente escribe migraciones, el humano las
aplica. Nota sobre 0195: trae un pre-flight que **se niega a aplicarse sobre
datos sucios** (una mascota con dos custodias de organización vivas). Si eso
salta en staging hay que inventariar y limpiar a mano antes de reintentar —
"aplicada" no es "cerrada".

**3. `qa-sessions.json` está fechado 2026-08-15 y muy probablemente venció.** El
access token dura una hora; lo que mantiene viva la sesión es el refresh token, y
rota. Re-acuñalo antes de lanzar:

```
QA_SUPABASE_URL=https://<ref>.supabase.co QA_SUPABASE_ANON_KEY=<anon> \
  pnpm exec tsx scripts/qa-mint-sessions.ts \
  owner@dim.test,adoptante@dim.test,lilian@dim.test,noeli@dim.test,alejo@dim.test,lucas@dim.test,gov-pba@dim.test,admin@dim.test \
  --json qa-sessions.json
```

Si no se re-acuña, Cowork tiene instrucciones de detectarlo y **parar** (§2) en
vez de improvisar logins manuales: el limitador de 5/min · 20/hora por email
convertiría el intento en una corrida entera bloqueada.
