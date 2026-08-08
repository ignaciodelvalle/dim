# S2 · Dueño: ciclo completo de la mascota
**Cuentas:** `owner@dim.test` (Dueño Demo CABA) · `graciela@dim.test` (Graciela) · anónimo intercalado
**Ventana:** 08/08/2026 10:49–11:35 ART · `visibilityState: "visible"` verificado

---

## Entidades creadas

| Tipo | Código | Cómo se creó | Estado |
|---|---|---|---|
| Mascota | **DIM-WR9N-Y7BN** (CW-Tero) | `/mis-mascotas/nueva`, 2 pasos, foto **WebP** | Perro · Macho · Mestizo · Palermo CABA · **PERDIDO** |
| Caso de pérdida | **CAS-A9F2-MV8R** | "Marcar como perdido", 3 pasos | Abierto · con avistaje |
| Evento sanitario | Antirrábica **DECLARADA** en CW-Tero | "Anotar → Registrar vacuna" | 08/08/2026 · próxima 08/08/2027 |
| Avistaje | (sobre CAS-A9F2-MV8R) | `/p/DIM-WR9N-Y7BN/sighting`, **anónimo** | 11:06 ART · Plaza Serrano |
| Transferencia | **PTR-Q23V-RSC9** | CW-Luna `owner@ → graciela@` | **ACEPTADA** 11:11 ART |

**Cambio de titularidad:** `DIM-CYTK-5MTD` (CW-Luna) pasó de `owner@` a `graciela@`. Es entidad CW- propia; lo dejo asentado para que se pueda revertir.
Seed ajena: **intacta**. Sólo lectura sobre `DIM-AVJ8-F9SA`, `DIM-UBKS-FWXC` y `DIM-S013-PLRM`.

---

## Hallazgos

### S2-F01 (ALTA) — La credencial pública muestra "ANTIRRÁBICA · VIGENTE" para una vacuna que cargó el dueño, igual que para una firmada por veterinario

**OBSERVACIÓN — medido dos veces** (DOM del cliente y HTML servido con `fetch(..., {cache:'no-store'})`), 11:05 y 11:08 ART.

Registré en CW-Tero una antirrábica **por el formulario del dueño**, sin veterinario, dejando "APLICADA POR (VET / CLÍNICA)" vacío. El producto la clasificó bien puertas adentro: en `/mis-mascotas/DIM-WR9N-Y7BN` el asiento aparece como **"DECLARADA · Antirrábica cargada por vos"**, el contador quedó en **"0 de 4 al día"** y el propio producto explica por qué, textual:

> "Para figurar "al día" en el registro oficial, un veterinario matriculado tiene que firmarla."

**Puertas afuera, esa distinción desaparece.**

| | `/p/DIM-CYTK-5MTD` (CW-Luna, firmada por vet) | `/p/DIM-WR9N-Y7BN` (CW-Tero, declarada por el dueño) |
|---|---|---|
| ANTIRRÁBICA | **VIGENTE** | **VIGENTE** |
| VACUNACIÓN | Con registros | Con registros |
| "Verificado por veterinario matriculado" | **presente** | **ausente** |
| Alguna mención de "declarada" | — | **ausente** |
| Ocurrencias de "VIGENTE" en el HTML servido | 2 | 2 |

La única diferencia es una línea que **está en una y falta en la otra**. La ausencia sólo funciona como señal si sabés cómo se ve la presencia — y quien escanea un QR en la calle ve una credencial sola, nunca las dos al lado.

**Por qué lo pongo en ALTA:** la credencial pública es lo que mira un inspector, un hotel, una guardería o un adoptante. "ANTIRRÁBICA: VIGENTE" en un documento titulado "CREDENCIAL PÚBLICA · Registro Nacional de Mascotas" es una afirmación citable. Acá la respalda solamente que el dueño la tipeó.

**SUGERENCIA** — marcar positivamente el estado no verificado en `/p`: "VIGENTE (declarada por el dueño)", o un ícono distinto. La distinción ya existe en los datos; falta mostrarla del lado público.

---

### S2-F02 (MEDIA) — El formulario de vacuna promete "firmado digitalmente en la libreta oficial"; el resultado dice lo contrario

**OBSERVACIÓN** — `/mis-mascotas/DIM-WR9N-Y7BN/eventos/nuevo/vacuna`, bloque "Asiento certificable", texto literal:

> "Este registro **queda firmado digitalmente en la libreta oficial**. Si la aplicó un veterinario matriculado y **agregás su nombre**, el asiento **puede certificarse como oficial**."

El campo al que alude es "APLICADA POR (VET / CLÍNICA)": **texto libre, sin validación de matrícula**. Escribir un nombre no es una verificación de nadie.

Y una pantalla después, el mismo producto dice: *"Para figurar "al día" en el registro oficial, un veterinario matriculado tiene que firmarla."*

Las dos frases no pueden ser ciertas a la vez. La que se lee **en el momento de decidir** es la optimista.

**A favor:** el dato final es honesto — el asiento queda **DECLARADA** y no suma al cumplimiento. El problema es de promesa, no de registro.

**SUGERENCIA** — "Queda asentado en la libreta como **declarado por vos**. Para que cuente como oficial, tiene que firmarlo un veterinario matriculado."

---

### S2-F03 (MEDIA) — Las notificaciones a ciudadanos dicen la especie en inglés: "CW-Tero — dog"

**OBSERVACIÓN** — `/notificaciones` como `graciela@`, 11:33 ART. Tres notificaciones, texto literal:

> "CW-Tero — **dog**, Mestizo. Color: Marron con pecho blanco. Tocá "Ver credencial" para detalles y contacto."
> "E2EDeg-1786192617515 — **dog**. Tocá "Ver credencial" para detalles y contacto."
> "CursorPet-001 — **dog**. Color: Atigrado gris pecho blanco. Tocá "Ver credencial" para detalles y contacto."

Todo lo demás de la misma frase está en español, incluido el "Tocá" voseado. Es el valor interno del enum saliendo a la superficie.

**HIPÓTESIS** — la plantilla de la alerta de zona interpola `pet.species` crudo en vez de pasarlo por el diccionario que sí usan las fichas (donde dice "Perro"). Conjetura: no tengo el código.

**Alcance:** aparece en la alerta "Mascota perdida en tu zona", que es de las pocas que el producto manda **sin que la persona haya pedido nada** — llega a vecinos por proximidad. §10.0 bis dice que el "Choose File" en inglés ya se corrigió; esta fuga quedó.

---

### S2-F04 (MEDIA) — "EN ADOPCIÓN" sigue pegado en la credencial de una mascota ya adoptada

**OBSERVACIÓN** — `graciela@`, 11:22 ART, `/mis-mascotas/DIM-RUQ9-6QZV` (CW-Refu-Manchas). El encabezado de la credencial muestra el chip **"EN ADOPCIÓN"**.

La adopción está cerrada: en las notificaciones de la misma cuenta, textual, *"**Adoptaste a CW-Refu-Manchas** · LISTO · ADOPCIÓN FINALIZADA · Refugio Test te registró como dueño/a de CW-Refu-Manchas. Bienvenida a la familia."* (hace 2 días).

Verifiqué el resto de las superficies y **están todas bien**:

| Superficie | ¿Dice "EN ADOPCIÓN"? |
|---|---|
| `/mis-mascotas/DIM-RUQ9-6QZV` (privada, la dueña) | ❌ **sí** |
| `/p/DIM-RUQ9-6QZV` (credencial pública) | no ✅ |
| `/adoptar/DIM-RUQ9-6QZV` | no ✅ |
| Listado `/adoptar` | no aparece ✅ |

O sea: el único lugar donde la mascota sigue figurando en adopción es la pantalla de su nueva dueña. Es el peor lugar posible para ese error.

---

### S2-F05 (MEDIA) — Quien acepta una transferencia recibe menos información que quien la envía

**OBSERVACIÓN** — 11:10 ART, `graciela@`, `/transferencias/PTR-Q23V-RSC9`.

Lo que ve **quien envía** (`owner@`), textual:
> "Le traspasás la titularidad de CW-Luna a otro usuario. El receptor recibe una invitación y debe aceptarla — **la libreta sanitaria viaja con la mascota**." + "La propuesta vence en 7 días. Mientras esté pendiente, podés cancelarla."

Lo que ve **quien recibe**, textual y completo:
> "Recibiste a CW-Luna · Dueño Demo CABA te quiere transferir esta mascota." + MOTIVO / COMENTARIO / VENCE / EMAIL DEL RECEPTOR + [Rechazar] [Aceptar]

Busqué en la pantalla del receptor las palabras "titular", "irreversible", "libreta", "responsab": **cero coincidencias**. La parte que asume la titularidad y las obligaciones sanitarias es la que menos información tiene.

Los dos botones miden **35 × ~188 px**; "Aceptar" es verde sólido y "Rechazar" tiene borde rojo — la jerarquía visual está bien.

**A favor:** hay confirmación en dos pasos (aparece un diálogo con "Cancelar" / "Aceptar transferencia"), así que no se acepta de un click distraído.
**No pude verificar:** el texto del cuerpo de ese diálogo de confirmación — la página navegó antes de que lo capturara. Si ahí sí se explican las consecuencias, este hallazgo baja a BAJA.

---

### S2-F06 (BAJA) — El resumen de cumplimiento dice "POR VENCER" en una mascota que no tiene nada registrado

**OBSERVACIÓN — medido dos veces**, 10:57 y 11:04 ART, `/mis-mascotas/DIM-WR9N-Y7BN`. Chip a la derecha del bloque CUMPLIMIENTO, `10px`, ámbar `rgb(150,96,14)` sobre `rgb(253,246,234)`:

```
CUMPLIMIENTO
0 de 4 al día                                    [ POR VENCER ]
  Régimen PPP            [ FALTAN DATOS ]
  Vacuna antirrábica     [ SIN REGISTRO ]   ← primera medición
  Esterilización         [ SIN REGISTRO ]
  Microchip              [ SIN REGISTRO ]
```

La mascota tenía 60 segundos de vida. No había nada que pudiera estar por vencer. Volví a medirlo después de cargar la antirrábica (próxima dosis **08/08/2027**, a un año) y el chip **seguía diciendo "POR VENCER"** — o sea que tampoco se deriva de una fecha próxima.

Para comparar: CW-Luna, con 3 de 3, muestra **"AL DÍA"** en la misma posición.

**HIPÓTESIS** — el resumen mapea "no todo cumplido" a "POR VENCER" porque no existe un estado para "todavía no hay nada". Conjetura.

**SUGERENCIA** — un tercer estado, "SIN DATOS" o "INCOMPLETO". Una mascota nueva debería leerse como incompleta, no como vencida.

---

### S2-F07 (BAJA) — "Marcar CW-Tero como perdida" para un perro macho, en la misma pantalla que dice "Marcar como perdido"

**OBSERVACIÓN** — 10:59 ART, hoja `?sheet=marcar-perdida` de CW-Tero (**Macho**). Tres títulos en pantalla:

| Elemento | Texto literal |
|---|---|
| `<p>` | "Marcar como perdid**o**" |
| `<h2>` | "Marcar como perdid**o**" |
| `<h1>` | "Marcar **CW-Tero** como perdid**a**" |

El `<h1>` interpola el nombre pero no el género. El cuerpo sigue en femenino: *"Paso 2 de 3 · Datos para reconocer**la**"*, *"Cualquiera que **la** encuentre sin documentación…"*.

Como el `<h1>` está fijo en femenino y el `<h2>`/`<p>` fijos en masculino, **siempre hay uno mal**, sea macho o hembra.

*(El listado público `/perdidas` sí concuerda el género por mascota — "PERDIDO" / "PERDIDA" / "PERDIDO/A" según el sexo registrado. Ahí está bien resuelto; el problema es sólo esta hoja.)*

---

### S2-F08 (BAJA) — El separador de los chips de notificación se come el espacio: "ATENCIÓN ·ALERTA DE MASCOTA PERDIDA"

**OBSERVACIÓN** — `/notificaciones`, verificado **en captura de pantalla** además de en el DOM, en **dos cuentas distintas** (`owner@` y `graciela@`) y en **cuatro tipos** de notificación:

```
ATENCIÓN ·ALERTA DE MASCOTA PERDIDA
ATENCIÓN ·AVISTAJE REPORTADO
LISTO ·ADOPCIÓN FINALIZADA
LISTO ·TRANSFERENCIA DE MASCOTA ACEPTADA
```

Hay espacio antes del punto medio y no después. En el resto del producto el separador es " · " con espacio a los dos lados (p. ej. "11 sin leer · 26 en total", tres líneas más arriba en la misma página).

---

### S2-F09 (BAJA) — La hoja "Anotar" ofrece el mismo menú dos veces, en dos formatos, con dos conectores casi iguales

**OBSERVACIÓN** — `?sheet=anotar` de CW-Tero, 11:02 ART:

> "**o cargá directamente**" → chips: Vacuna · Antiparasit. · Peso · Visita al vet · Castración · Microchip · Nota · Síntoma **(8)**
> "**o elegí directamente**" → lista: Registrar vacuna · Registrar antiparasitario · Registrar peso · Visita al veterinario · Castración / esterilización · Reportar síntoma **(6)**

Seis de los ocho están repetidos; Microchip y Nota sólo están arriba. Es peor que una duplicación exacta: el usuario tiene que comparar las dos listas para descubrir que no son la misma.

Detalle suelto: "Antiparasit." es la única etiqueta abreviada con punto de todo el conjunto.

---

### S2-F10 (BAJA) — Dos formatos de fecha en la misma pantalla de transferencias

**OBSERVACIÓN** — `/transferencias`, `graciela@`, 11:24 ART:

| Bloque | Formato |
|---|---|
| RECIBIDAS | "Vence **15 de agosto de 2026**" (largo) |
| ENVIADAS | "**1 de ago de 2026**" (abreviado) |

En el mismo listado, el destinatario también se muestra de dos maneras: "Para: **Noelí Assandri**" (nombre) y "Para: **carla@dim.test**" (email).

---

## Verificado y limpio (también es entregable)

- **Aceptar transferencia funciona de punta a punta.** Es uno de los dos rojos del e2e que el prompt marcó como posible territorio de producto. Por UI cierra completo: propuesta 11:08 → `graciela@` la ve en RECIBIDAS → confirmación en dos pasos → aceptada 11:11 → CW-Luna aparece en su cuenta **con la libreta intacta** ("3 de 3 al día", "VIGENTE · HASTA 06/08/2027", "Esterilización VERIFICADA", "Microchip verificado"). El vencimiento a 7 días se calculó bien: propuesta 08/08 11:08 → vence 15/08 11:08.
- **Avistaje anónimo → notificación al dueño: instantánea.** Reporté a las 11:06 sin sesión desde `/p/DIM-WR9N-Y7BN/sighting`; al reloguear, la notificación decía "**ahora**", con el mensaje completo y el contacto del finder ("📞 CW-Vecina Anonima dejó 11-5555-0001"). El contador pasó de 54 a 56 sin leer. Este era el punto marcado ALTA si fallaba: **no falla**.
- **`/p` respeta exactamente lo que se eligió en "Qué se muestra al público".** Con "Tu nombre" OFF y "Última ubicación" ON, la credencial pública muestra el mapa con el pin y el texto *"Por privacidad no mostramos el teléfono del dueño"*, y **no muestra nombre ni iniciales**. Los toggles hacen lo que dicen.
- **El paso 3 de "marcar como perdido" es la hoja "Qué se muestra al público"** que pedía el checklist. Cuatro toggles, todos **OFF por defecto** salvo "Formulario para avisarte". Copy textual: *"No se comparte nada que no actives acá, y podés cambiarlo desde su perfil en cualquier momento."* Es de lo mejor escrito del producto.
- **Fecha futura rechazada.** Puse 31/12/2027 como fecha de aplicación → *"La fecha no puede ser futura."*, no se guardó. *(Nota menor: el input no tiene `max`, así que el calendario nativo igual ofrece fechas futuras y el rechazo llega recién al enviar.)*
- **WebP funciona de punta a punta** en la foto de mascota: subida, preview, y renderizado tanto en `/p` como en la vista del dueño. El copy dice "JPG o PNG" pero el `accept` es `image/*` y el WebP entra sin problema — **el texto es más angosto que el producto**, no al revés. Con una cámara de iPhone (HEIC) el copy desalienta una subida que probablemente funcione.
- **La foto de la mascota tiene botón "Quitar foto" visible y con texto** — justo lo contrario del adjunto de la denuncia (S1-F04). Ya existe el patrón bueno adentro del producto.
- **Empty state de `/mis-turnos`** con acción: "No hay turnos reservados · Buscar turnos · Reservá tu primer turno buscando un servicio disponible."
- **Estados de la libreta bien diferenciados del lado del dueño:** DECLARADA / VERIFICADA / SIN REGISTRO / FALTAN DATOS / VIGENTE, con la explicación de por qué una declarada no cuenta.
- **Fechas y horas correctas en ART y en 24 h:** vacuna prellenada 08/08/2026, avistaje 08/08/2026 11:05, vencimiento "15 de agosto de 2026 a las 11:08". Cero a. m./p. m.
- **Alerta de zona a terceros:** `graciela@` recibió "Mascota perdida en tu zona: CW-Tero" 11 minutos después de marcarlo. El circuito de proximidad anda (con el defecto de copy de S2-F03).

---

## No pude verificar

1. **El cuerpo del diálogo de confirmación de "Aceptar transferencia"** — la navegación se lo llevó antes de la captura. Afecta la severidad de S2-F05.
2. **Que `owner@` haya perdido el acceso a CW-Luna** después de la transferencia. Es exactamente el objeto de S6 (cross-perfil): lo dejo anotado en vez de gastar un login ahora.
3. **Reservar un turno** — `/mis-turnos` está vacío y la oferta CW- vive en la organización. Va en S3, con `orgadmin@`.
4. **Cargar el microchip / peso / PPP** en CW-Tero — no llegué. El régimen PPP con "FALTAN DATOS" queda sin recorrer.
5. **Recuperar a CW-Tero** ("Apareció — marcar como encontrado"). Lo dejo perdido a propósito: sirve como objeto vivo para S5 (gobierno) y S6 (cross-perfil). **Anotado para cerrarlo en S8.**
6. **Activar una chapa sobre CW-Tero** — el lote CW- ya tiene una chapa virgen (`TAG-MQ3B-774D`), pero la activación consume rate limit y no era el foco. Queda para S3/S4.

---

## HANDOFF S2 → S3 (§10.2)

**Estado: PARCIAL.** Cerré el ciclo alta → perdida → avistaje anónimo → notificación, y la transferencia completa entre dueños. Quedan los 6 puntos de arriba.

**Sesión actual:** `graciela@dim.test` logueada. **Logins gastados:** `owner@` ×2, `graciela@` ×1.

**Cierre de un pendiente de S1:** encontré el toggle **"Tu nombre"**. Vive en el paso 3 de "Marcar como perdido", es **por caso de pérdida** y viene **OFF por defecto**, bajo el texto *"No se comparte nada que no actives acá"*. CW-Luna no tiene ningún caso de pérdida abierto, así que su dueño nunca activó nada — y sin embargo el formulario anónimo de denuncia entrega "Dueño: D.D.". **S1-F01 queda confirmado como ALTA**, ahora contra cuatro promesas explícitas del propio producto:
1. `/p` (perdida): *"Por privacidad no mostramos el teléfono del dueño…"*
2. Alta de mascota: *"…nunca tus datos sin que los actives."*
3. Marcar como perdido, paso 3: *"No se comparte nada que no actives acá."*
4. Editar perfil: *"…podemos mostrarle estos contactos (según tus preferencias de privacidad)."*

**Pendientes que dejo anotados:**

| Para | Qué verificar |
|---|---|
| **S3** (`orgadmin@`) | Publicar servicio CW- + agenda; después reservar turno como dueño |
| **S3** (`vet@`) | Firmar una antirrábica sobre CW-Tero y **volver a mirar `/p`** → si ahí aparece "Verificado por veterinario matriculado", confirma que S2-F01 es sólo falta de marca en el caso declarado |
| **S4** (`admin@`) | ¿El chip "POR VENCER" del padrón usa la misma regla que S2-F06? |
| **S5** (`govt-local@`) | CW-Tero perdido en Palermo: ¿aparece en las vistas de gobierno? |
| **S6** | `owner@` ya no debe poder ver ni editar CW-Luna |
| **S7** | Chips de 10 px (POR VENCER, DECLARADA): contraste y tamaño |
| **S8** | Marcar a CW-Tero como encontrado y cerrar `CAS-A9F2-MV8R` |
