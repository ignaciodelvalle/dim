# S1 · Público, anónimo y denuncia
**Build:** ≥18c354c8 · **Cuenta:** anónimo (sin sesión) · **Ventana:** 08/08/2026 10:12–10:55 ART
**Contrato de evidencia:** OBSERVACIÓN (medida) / HIPÓTESIS (etiquetada) / SUGERENCIA (etiquetada)
`document.visibilityState === "visible"` verificado antes de cada medición.

---

## Precondición §10.0 — PASA 5/5

| # | Check | Resultado |
|---|---|---|
| 1 | Títulos de pestaña distintos | ✅ `"Gobierno — miMAR"` / `"Admin — miMAR"` |
| 2 | Selector de archivo en español | ✅ "Elegir archivos", `P2_ingles: false` |
| 3 | Porcentajes con coma | ✅ `P3_conPunto: []` — 36,6% · 34,2% · 72,7% |
| 4 | `/org/DIM-UATE-YXZK/adopciones/cualquier-cosa-invalida` | ✅ HTTP **404** + "No encontramos esta página" |
| 5 | Etiquetas de prioridad textuales | ✅ "PRIORIDAD ALTA"/"PRIORIDAD MEDIA" (`w:663 h:13 px:10px`, no sr-only) |

Extra: admin visitando `/gob` ve el rail de Gobierno.

---

## Entidades creadas

| Tipo | Código público | Cómo se creó | Estado |
|---|---|---|---|
| Denuncia | **DEN-RCDE-GY9P** | `/denuncias/nueva`, anónima, 5 pasos, con 1 foto adjunta | ABIERTA · CRÍTICA · Palermo CABA · 10:30 ART |

Seed tocada: **ninguna**. Sólo lectura sobre `DIM-AVJ8-F9SA`, `DIM-S013-PLRM`, `DIM-CYTK-5MTD` y las chapas del lote CW-.
Limpieza hecha: borré el borrador `localStorage.denuncia_draft_v1` que quedó de la prueba de recarga.

---

## Hallazgos

### S1-F01 (ALTA) — El formulario anónimo de denuncia revela al dueño; la credencial pública dice explícitamente que no lo hace

**OBSERVACIÓN — medido dos veces** (10:22 y 10:36 ART), anónimo, sin sesión, en dos recorridos independientes del wizard.

En `/denuncias/nueva`, paso 4, campo `#subjectPetToken` ("CÓDIGO MIMAR O MICROCHIP (opcional)"), tipeando `DIM-CYTK-5MTD` el formulario responde, en texto literal:

> **"Esta mascota está registrada como CW-Luna (activa). Dueño: D.D."**

La credencial pública de esa misma mascota, `/p/DIM-CYTK-5MTD`, visitada anónima en la misma sesión, **no muestra dueño ni iniciales**. Su única mención es "Tocá acá para avisarle al dueño."

Y en `/p/DIM-AVJ8-F9SA` (mascota en estado perdida) el producto enuncia su propio contrato, textual:

> **"Por privacidad no mostramos el teléfono del dueño: completá uno de estos avisos y le llega al instante."**

Dos superficies anónimas, el mismo token, respuestas opuestas sobre la identidad del dueño. El token no es secreto: está impreso en la chapa que el animal lleva en el cuello.

**HIPÓTESIS** — el widget de verificación del paso 4 se escribió para dar confianza al denunciante ("sí, es esta mascota") y reusó un resumen interno que incluye iniciales; no pasó por la misma revisión de privacidad que `/p`. No tengo el código: es conjetura.

**Pendiente de confirmar (S2):** si `owner@` tiene el toggle "Tu nombre" apagado. Si está apagado, la contradicción es directa: la denuncia ignora una preferencia explícita del dueño.

**SUGERENCIA** — que el paso 4 confirme identidad sin identificar persona: "Esta mascota está registrada (activa)." El denunciante necesita saber que acertó el código, no de quién es el animal.

---

### S1-F02 (ALTA) — El wizard promete que la denuncia llega a la autoridad; el comprobante avisa que no, después de enviarla

**OBSERVACIÓN** — 10:30 ART, denuncia DEN-RCDE-GY9P, anónima.

Paso 3 del wizard, texto literal bajo el mapa:

> "Marcá el lugar exacto tocando el mapa, arrastrando el pin o con "Usar mi ubicación". **La denuncia necesita un punto preciso para llegar a la autoridad de esa zona.**"

Comprobante, después de enviar, texto literal:

> "**Esta denuncia aún no fue enviada a la herramienta gubernamental** — la integración con los canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será enviado cuando la integración esté disponible."

Nada en los cinco pasos anticipa esto. El aviso aparece **sólo en el comprobante**, y ahí ocupa el peor lugar de la página: medido, está al **72 % de la altura** (`top: 1273 px` sobre 1771 px), a **12 px**, en ámbar `rgb(150, 96, 14)` — el texto más chico de la pantalla.

La denuncia que acabo de mandar quedó clasificada **"CRÍTICA — PELIGRO INMEDIATO"** y yo había marcado "Ahora mismo · Estoy viendo la situación en este momento".

**OBSERVACIÓN adicional (mismo comprobante):** paso 3 pide "MARCÁ EL LUGAR **EXACTO**" y exige "un punto preciso"; el comprobante rotula ese mismo punto como "**Ubicación aproximada**".

**SUGERENCIA** — mover el aviso al paso 5, arriba del botón de envío, al mismo tamaño que el resto del texto. Que la persona decida sabiendo. Hoy la información existe y es honesta: sólo llega tarde y en cuerpo 12.

**Pendiente (S5):** verificar si DEN-RCDE-GY9P aparece igual en `/gob/denuncias`. Si aparece, la frase "no fue enviada a la herramienta gubernamental" también es confusa hacia adentro.

---

### S1-F03 (MEDIA) — Al recargar, el borrador restaura todo menos la ubicación, y devuelve al usuario un paso más adelante del que perdió

**OBSERVACIÓN** — 10:38 ART. Con el wizard en paso 4 y todo cargado, recargué la página.

| Qué | Antes | Después de recargar |
|---|---|---|
| Paso mostrado | 4 de 5 | **4 de 5** |
| Descripción | 72 chars | ✅ intacta |
| "¿Cuándo pasó?" | Hoy o ayer | ✅ intacta |
| `locationLat` / `locationLng` | `-34.588755` / `-58.4301669` | ❌ **`""` / `""`** |
| `provinceName` / `localityName` | CABA / Palermo | ❌ **`""` / `""`** |
| Campo "Dirección o referencia" | Plaza Serrano, Palermo | ❌ **vacío** |

El borrador vive en `localStorage.denuncia_draft_v1` (221 bytes) con las claves `step`, `step1`, `step2`, `step3`, `savedAt`. Su `step3` guarda **sólo** `{description, when}` — la ubicación no se persiste.

El usuario queda parado en el paso 4, **pasado el control del paso 3**, sin ningún aviso. Seguí adelante: el paso 4 → 5 pasó sin advertencia.

**Lo que SÍ funciona** — el envío está bien protegido. Al tocar "Enviar denuncia →" apareció, en rojo y visible en pantalla: *"Marcá el lugar exacto en el mapa (paso "Dónde") antes de enviar."* **No se creó ninguna denuncia sin ubicación.** El dato nunca se corrompe.

El problema es de recorrido, no de integridad: te llevan dos pasos más allá de un campo obligatorio que se vació solo, y te avisan recién en el último click. El único camino de vuelta es el botón "←" ("Paso anterior") dos veces, y el mensaje de error no es un link.

**SUGERENCIA** — o persistir la ubicación en el borrador, o restaurar al paso 3 cuando falte. Cualquiera de las dos cierra el hueco.

---

### S1-F04 (MEDIA) — El botón para quitar una foto adjunta es invisible en pantallas táctiles y mide 20 × 20 px

**OBSERVACIÓN** — 10:28 ART, paso 5, con `cw-evidencia-s1.jpg` (22 KB) adjunto.

```
class="… w-5 h-5 … opacity-0 group-hover:opacity-100 focus:opacity-100 …"
aria-label="Quitar cw-evidencia-s1.jpg"
```

Medido: `opacity` inicial **0**; con foco de teclado pasa a **1**; tamaño **20 × 20 px**.

Con mouse (hover) y con teclado (foco) se ve bien. En una pantalla táctil no hay ninguna de las dos cosas: el botón existe y responde, pero **es invisible**. La denuncia es el flujo más de celular que tiene el producto — una persona en la calle, sacando una foto.

**A favor:** el `aria-label` es excelente, nombra el archivo. Eso está mejor resuelto que en muchos formularios del producto.

**SUGERENCIA** — visible siempre en `(hover: none)`, y llevarlo a 44 × 44 px de área táctil (el círculo puede seguir viéndose de 20).

---

### S1-F05 (MEDIA) — El "no encontramos" de un código de denuncia habla de credenciales, QR y mascotas perdidas

**OBSERVACIÓN** — 10:34 ART. `/denuncias/codigo/DEN-RCDE-GY9Q` (formato válido, inexistente) renderiza, textual:

> "**No encontramos esa credencial**
> El código puede estar mal tipeado, o la **credencial** pudo haber expirado o haber sido dada de baja. Revisá el enlace o **el QR** e intentá de nuevo.
> [**Ver mascotas perdidas**] [Volver al inicio]"

Es la pantalla vacía de la credencial pública de mascotas, servida para un código de denuncia. La persona que busca su reporte de maltrato lee que no encontramos su "credencial", que revise "el QR" que nunca tuvo, y la única salida que se le ofrece es un listado de mascotas perdidas.

**Los códigos de estado, en cambio, están perfectos** (medidos con `fetch` + `redirect:'manual'`):

| URL | HTTP |
|---|---|
| `/denuncias/codigo/DEN-RCDE-GY9P` (existe) | 200 |
| `/denuncias/codigo/DEN-RCDE-GY9Q` (formato ok, no existe) | **404** |
| `/denuncias/codigo/DEN-ZZZZ-0000` (formato inválido) | **404** |
| `/denuncias/codigo/basura` | **404** |

**SUGERENCIA** — copy propio: "No encontramos esa denuncia · Revisá el código, tiene el formato DEN-XXXX-XXXX", con salida a `/denuncias/buscar`.

---

### S1-F06 (MEDIA) — `/iniciar-sesion` y `/registro` dan 404: las dos rutas de auth son las únicas en inglés

**OBSERVACIÓN** — medido dos veces, ~10:10 ART, anónimo.

| Ruta | HTTP |
|---|---|
| `/login` · `/signup` · `/recuperar` | **200** |
| `/iniciar-sesion` · `/registro` | **404** |
| `/recuperar-contrasena` · `/olvide-contrasena` · `/reset-password` | 404 |

Los links del home apuntan a `/login` y `/signup`. Todo el resto de la superficie pública es español: `/perdidas`, `/adoptar`, `/refugios`, `/denuncias`, `/recuperar`, `/mis-mascotas`, `/cuenta`, `/t/…`, `/p/…`.

Nota de alcance: la matriz §5 del prompt lista `/iniciar-sesion` y `/registro` como superficies. **No existen en este build.**

**Por qué importa:** son las dos únicas URLs que alguien escribe o comparte de memoria. Quien tipee la versión en español —la que el resto del producto le enseñó a esperar— se come un 404 en la puerta de entrada.

**SUGERENCIA** — dos redirects 301 en `next.config`. No toca componentes.

---

### S1-F07 (MEDIA) — Los controles públicos no tienen piso de altura: 16, 31, 35, 39 y 44 px conviven en una misma barra

**OBSERVACIÓN** — alturas computadas (`getBoundingClientRect().height`), anónimo:

| Superficie | Control | Alto |
|---|---|---|
| `/perdidas` filtros | selects ESPECIE / PROVINCIA / ¿CUÁNDO SE PERDIÓ? | **35 px** |
| `/perdidas` filtros | input LOCALIDAD | **44 px** |
| `/perdidas` filtros | input COLOR | **35 px** |
| `/perdidas` filtros | checkboxes (Con microchip, Castrado/a, Crítica 24h) | **16 px** |
| `/perdidas` filtros | botón **Buscar** (submit) | **31 px** |
| `/adoptar` filtros | search + 4 selects | **35 px** · LOCALIDAD **44 px** · checkboxes **16 px** |
| `/denuncias/buscar` | input CÓDIGO + botón Buscar | **39 px** |

Cinco alturas distintas en la misma fila de filtros, y el control más chico es el **botón de submit (31 px)**. El mínimo táctil accesible es 44 px; sólo LOCALIDAD lo cumple.

**No lo llamo "dos sistemas de componentes"** — esa lectura ya se probó equivocada en la corrida anterior. Lo que mido es un hecho más simple: **falta un piso de altura**, y el único control que lo tiene es justamente el que ya se migró.

**SUGERENCIA** — `min-height: 44px` en el control base. LOCALIDAD ya demuestra que el layout lo tolera.

---

### S1-F08 (BAJA) — Los títulos de pestaña siguen sin criterio único

§10.0 bis dice que los títulos idénticos ya se arreglaron. El arreglo quedó a medias — y eso el prompt pide reportarlo.

**OBSERVACIÓN** — `document.title` medido ruta por ruta:

| Ruta | `<title>` | `<h1>` |
|---|---|---|
| `/perdidas` | **"mascotas perdidas — miMAR"** (minúscula) | "Mascotas perdidas" |
| `/adoptar` | **"mascotas en adopción — miMAR"** (minúscula) | "Adoptar en miMAR" |
| `/refugios` | "Refugios y redes de rescate — miMAR" | igual ✅ |
| `/adoptar/DIM-S013-PLRM` | "Adoptá a Bichita — miMAR" ✅ | — |
| `/p/DIM-CYTK-5MTD` | "CW-Luna **\|** Credencial miMAR" (separador distinto) | — |
| `/p/DIM-AVJ8-F9SA` | "SE BUSCA: satrio **\|** miMAR" ✅ (buen copy) | — |
| `/denuncias`, `/denuncias/nueva`, `/denuncias/buscar`, `/denuncias/codigo/…` | **"miMAR — Mi Mascota Argentina"** (genérico, las 4) | varios |
| `/perdidas?provincia=TF` | **"mascotas perdidas en TF — miMAR"** — código INDEC crudo | el cuerpo dice "Tierra del Fuego" ✅ |

Cuatro criterios: dos empiezan en minúscula, `/p` usa `|` donde el resto usa `—`, todo el árbol de denuncias no tiene título propio, y el filtro por provincia mete el código interno en la pestaña del navegador.

**SUGERENCIA** — `metadata.title` en el árbol `/denuncias`, capitalizar los dos índices, un solo separador, y resolver el código a nombre.

---

### S1-F09 (BAJA) — En el paso 3 conviven tres formas de marcar "obligatorio", y el asterisco no tiene leyenda

**OBSERVACIÓN** — textos literales del wizard:

| Paso | Marca |
|---|---|
| 1 | "Tipo de situación **(obligatorio)**" |
| 2 | "Gravedad de la situación **(obligatorio)**" |
| 3 | "CONTANOS LO QUE VISTE **\*** " |
| 3 | "¿CUÁNDO PASÓ?**\*** **(OBLIGATORIO)**" ← las dos juntas |
| 3 | "MARCÁ EL LUGAR EXACTO EN EL MAPA **\*** " |

No hay en toda la página ninguna leyenda que explique qué significa el asterisco.

En el paso 4, "CÓDIGO MIMAR O MICROCHIP" lleva "(opcional)" y "DESCRIPCIÓN DEL ANIMAL" no, aunque las dos lo son.

---

### S1-F10 (BAJA) — Al llegar a 2000 caracteres el contador no cambia de estado

**OBSERVACIÓN** — `#description`, `maxlength="2000"` nativo. Medí el color del contador en tres puntos: 100/2000, 1990/2000 y 2000/2000 → **`rgb(103, 116, 125)` en los tres**, idéntico.

El campo invita a un relato largo ("Describí la situación: qué pasó, cómo estaba el animal, dónde exactamente…"). Cuando la persona llega al techo, las letras dejan de aparecer y **nada en pantalla cambia**.

**Aclaración honesta:** en una medición anterior forcé 2100 caracteres por JS y el contador mostró "2100 / 2000". Eso **no es un hallazgo** — el `maxlength` nativo impide pasarse tipeando o pegando; el exceso lo produje yo evadiendo el navegador. Lo dejo escrito para que nadie lo persiga.

---

### S1-F11 (BAJA) — El autocomplete de dirección resuelve solo el primer resultado, y no responde a las flechas

**OBSERVACIÓN — medido dos veces**, una por JS y otra tipeando de verdad con el teclado (10:24 y 10:25 ART).

Tipeando `Defensa 1200, San Telmo` y **sin tocar ninguna sugerencia**, con la lista de 5 opciones abierta en pantalla, los campos ocultos ya quedaron cargados:

```
locationLat: -34.6169194   locationLng: -58.3716839
provinceName: CABA         localityName: San Telmo
locationSource: geocodificada
```

y el cartel verde ya decía "Encontramos: Defensa, San Telmo, …" — **sin la altura 1200**, o sea la calle entera, no la dirección.

Dos consecuencias: la persona cree que todavía tiene que elegir y el sistema ya eligió por ella; y un resultado a nivel calle se acepta con el mismo cartel verde que uno exacto, aunque el paso exija "el lugar exacto". Con `Av. Santa Fe 3253` las 5 sugerencias eran comercios (Alto Palermo, Wendy's, Frano, Quotidiano, Mostaza) y la elegida sola fue el shopping.

**Accesibilidad, medido:** el input no tiene `role`, ni `aria-expanded`, ni `aria-autocomplete`, ni `aria-controls`; no hay `role="listbox"` ni `role="option"` en la página. **`ArrowDown` no hace nada** (el foco queda en el input, ningún ítem resaltado). `Tab` **sí** llega a las sugerencias, que son `<button>` — así que se puede operar con teclado, pero por el camino equivocado y sin que un lector de pantalla anuncie que aparecieron opciones.

**SUGERENCIA** — no comprometer coordenadas hasta que la persona elija; distinguir el cartel de "coincidencia exacta" del de "calle sin altura"; y patrón combobox completo (`aria-expanded`, `role="listbox"/"option"`, flechas + Enter).

---

### S1-F12 (BAJA) — "No importa cuál elijas" vs. el chip "CRÍTICA — PELIGRO INMEDIATO"

**OBSERVACIÓN** — paso 2, bajo las tres opciones de gravedad, texto literal:

> "No importa cuál elijas — todas las denuncias son revisadas por el equipo."

Elegí "Grave / urgente". El comprobante muestra un chip prominente: **"CRÍTICA — PELIGRO INMEDIATO"**, al lado de "ABIERTA".

**HIPÓTESIS** — la gravedad alimenta la prioridad de la cola de gobierno (que ya vimos rotula "PRIORIDAD ALTA"/"PRIORIDAD MEDIA"). Si es así, la frase tranquiliza a costa de ser inexacta: sí importa cuál elijas.
**Pendiente (S5):** confirmar el mapeo gravedad → prioridad en `/gob/denuncias`.

**SUGERENCIA** — si importa, decirlo bien: "Elegí lo que mejor describa la situación; todas se revisan, esto nos ayuda a priorizar."

---

### S1-F13 (BAJA) — En `/adoptar/[token]` el estado médico se comunica con glifos sin leyenda

**OBSERVACIÓN** — `/adoptar/DIM-S013-PLRM` (Bichita), bloque "Salud":

| Glifo | Etiqueta | Color / tamaño del glifo |
|---|---|---|
| **—** | Vacunación al día | `rgb(97,110,119)` · 12 px |
| **—** | Castración | `rgb(97,110,119)` · 12 px |
| (otro) | Microchip miMAR | — |

El guión no está explicado en ninguna parte. Quien está decidiendo si adopta no puede distinguir "no" de "no sabemos" de "no lo decimos todavía". El pie aclara que "el detalle clínico completo se comparte al finalizar la adopción", que explica reservar el detalle pero no qué significan las marcas.

---

## Verificado y limpio (también es entregable)

- **`/t/[serial]`, los cuatro estados.** Inventado `TAG-ZZZZ-9999` → **404**. Virgen `TAG-MQ3B-774D` → 200, "Esta chapa todavía no fue activada" + CTA, **cero** datos de mascota. Activa `TAG-9XDZ-2DKP` → redirige a `/p/DIM-7W26-TUZ8`. Revocada `TAG-H4AB-MMYX` → 200, "Esta chapa fue dada de baja", **cero** datos, sin razón. La compuerta pública no filtra existencia en ningún estado.
- **Borrador del wizard: sobrevive la recarga.** `localStorage.denuncia_draft_v1` restaura tipo, gravedad, descripción y "cuándo" tras un reload completo. Ida y vuelta con el botón Atrás del navegador también restaura (paso 4 con la descripción intacta). Buena ingeniería para un flujo de celular — con la salvedad de la ubicación (S1-F03).
- **Validación de paso.** "Continuar" sin elegir nada en el paso 1 → `role="alert"` con "Elegí una opción para continuar." No avanza.
- **Confirmación en dos tiempos al enviar.** "Enviar anónima" no envía: revela "Enviar denuncia →". La consecuencia se declara antes: *"Sin datos de contacto. El código DEN-XXXX es tu única forma de seguimiento."*
- **Adjuntar evidencia.** Subí un JPG de 22 KB: miniatura inmediata, contador "1/5", `accept` coherente con el copy, `aria-label` que nombra el archivo.
- **Búsqueda por código.** `/denuncias/buscar`: formato inválido → "Código inválido. El formato es DEN-XXXX-XXXX."; código válido → navega al comprobante. **Enter envía** (hay `<form>` real). El comprobante sin `?nueva=1` omite el cartel de "recién registrada" y muestra lo mismo.
- **Los KPI de `/perdidas` dicen la verdad.** Los conté uno por uno sobre las 24 tarjetas: "NUEVAS EN 24H: 3" ↔ 59 min, 6 h, 6 h = **3** ✅. "NUEVAS EN 7 DÍAS: 3" ✅ (la siguiente es de 7 días). *Lo di por sospechoso al principio porque 24h y 7d coincidían; los conté y estaban bien.*
- **Vacíos con acción.** `/perdidas?especie=conejo&provincia=TF&color=fucsia` → ofrece "Limpiar" y "Limpiar filtros".
- **`/p` en modo perdida.** Título "SE BUSCA: satrio | miMAR", banda de emergencia con antigüedad, dos CTA claras ("Lo tengo conmigo" / "Lo vi cerca de acá") y la promesa de privacidad explícita. Muy bien resuelto.
- **`/adoptar/[token]` no muestra dígitos de microchip** — sólo el booleano, como está decidido.
- **Pasos anteriores del wizard: `inert` + `aria-hidden="true"`**, fuera de pantalla en `left: -9983px`. Bien hecho. *(Me hizo dudar: `getBoundingClientRect()` los reporta con alto > 0 y llegué a medir "dos pasos visibles a la vez". La captura lo desmintió. Anotado para no volver a caer.)*
- **Vocabulario público.** Cero `filas`/`items`/`payload`, cero `a. m.`/`p. m.`, cero decimales con punto. Fechas del comprobante correctas en ART: "Enviada 8 de agosto de 2026 a las 10:30" con hora real 10:30.

---

## No pude verificar

1. **Layout mobile real (<640 px).** Chrome en Windows no baja de 642 px de viewport y `zoom` no mueve las media queries. S1-F04 (botón invisible sin hover) y S1-F07 (alturas) **son hallazgos de teléfono medidos desde escritorio**: la inferencia sobre táctil es sólida (`(hover: none)` no dispara `:hover`), pero no los vi en un teléfono.
2. **Descargar comprobante.** Es un `<button>` (no un link con `href`), o sea que genera el archivo en el cliente. **No lo ejecuté**: no descargo archivos sin confirmación explícita. Queda para S8.
3. **Límites del adjunto** (>25 MB, 6º archivo, tipo no permitido). Sólo probé la ruta feliz con 1 JPG de 22 KB.
4. **"Sumar mi contacto"** en el paso 5 — no lo recorrí; entra en el mismo bloque que el punto 3.
5. **"Usar mi ubicación actual"** — dispara el permiso de geolocalización del navegador; no lo toqué para no bloquear la sesión.
6. **Reportar avistaje desde `/p`** ("Lo tengo conmigo" / "Lo vi cerca de acá"). Las mascotas perdidas del listado **no son mías**. Lo hago en S2 con una CW- propia marcada como perdida.

---

## HANDOFF S1 → S2 (§10.2)

**Estado: PARCIAL.** Cubrí público anónimo, chapas públicas, denuncia completa de punta a punta y las tres superficies de listado. Quedan los 6 puntos de arriba.

**Entidades:** `DEN-RCDE-GY9P` (denuncia anónima, ABIERTA, CRÍTICA, Palermo CABA, con 1 adjunto).
**Seed:** intacta. Ninguna acción destructiva. Borrador de localStorage borrado.

**Pendientes que dejo anotados en vez de volver:**

| Para | Qué verificar |
|---|---|
| **S2** (`owner@`) | Estado del toggle "Tu nombre" en CW-Luna → cierra S1-F01 |
| **S2** (`owner@`) | Marcar una CW- como perdida y recorrer el avistaje anónimo desde `/p` |
| **S5** (`govt-local@`) | ¿`DEN-RCDE-GY9P` aparece en `/gob/denuncias`? → matiza S1-F02 |
| **S5** (`govt-local@`) | Mapeo gravedad → PRIORIDAD → cierra S1-F12 |
| **S5** (`govt-local@`) | ¿La ubicación llegó como Palermo/CABA? El `localityNameIndecId` quedó **vacío** al geocodificar |
| **S7** (teclado/color) | Contraste del asterisco rojo de obligatorio; foco visible en las tarjetas-radio del wizard |
| **S8** (documentos) | "Descargar comprobante" de DEN-RCDE-GY9P |

**Observación de ambiente, no de producto:** el primer lugar del listado público de perdidas lo ocupa `E2EDeg-1786192617515` (PERDIDO, Palermo CABA, hace 59 min) — residuo de una corrida e2e. En staging es esperable; lo anoto sólo porque es lo primero que vería alguien a quien se le muestre la pantalla.
