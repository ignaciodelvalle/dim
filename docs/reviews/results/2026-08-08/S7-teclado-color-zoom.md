# S7 · Teclado, color y zoom (L7 · L8)
**Ventana:** 08/08/2026 15:36–16:20 ART · **Sesión:** `graciela@` + rutas públicas
**Método:** contraste calculado con la fórmula WCAG 2.x sobre los colores computados reales (`getComputedStyle`), resolviendo el fondo efectivo subiendo por el árbol y descartando los nodos con `background-image` (donde el cálculo no aplica). Umbrales: 4.5:1 texto normal, 3:1 texto grande (≥24 px, o ≥18.66 px en negrita).

---

## Hallazgos

### S7-F01 (MEDIA) — Las tarjetas de opción del wizard de denuncia no muestran ningún indicador de foco

**OBSERVACIÓN** — `/denuncias/nueva`, paso 1. La estructura es un `<input type=radio>` oculto con la técnica sr-only y un `<label>` que es la tarjeta visible:

```
input[name=kindCard]  →  1 × 1 px · position: absolute · clip-path: inset(50%)
                          al enfocarlo recibe  outline: 3px solid
label (la tarjeta que se ve)  →  al enfocar el input NO cambia nada:
   outline    : none      (antes y después)
   box-shadow : none      (antes y después)
   border     : rgb(228, 223, 211)   (antes y después)
   background : rgb(255, 255, 255)   (antes y después)
```

El anillo de foco se dibuja sobre un elemento de 1 × 1 px recortado con `clip-path`, así que no se ve. **Lo verifiqué en pantalla**, no sólo en el DOM: enfoqué la tercera tarjeta ("Maltrato físico / golpes / lesiones"), confirmé `document.activeElement`, y la captura ampliada muestra la tarjeta **idéntica a sus vecinas** — mismo borde, mismo fondo, sin anillo.

**Alcance medido:** dos grupos en el wizard usan el patrón y los dos fallan igual.

| Grupo | Opciones | Input oculto | ¿La etiqueta cambia con el foco? |
|---|---|---|---|
| `kindCard` (paso 1, "¿Qué pasó?") | 9 | sí (1×1, `clip-path`) | **no** |
| `occurredAtOption` (paso 3, "¿Cuándo pasó?") | 3 | sí (1×1, `clip-path`) | **no** |

**Por qué importa.** Es el primer paso del formulario de denuncia: nueve tarjetas iguales, y quien navega con teclado no puede saber en cuál está parado. El resto del producto **sí** resuelve bien el foco (ver "Verificado y limpio"), así que esto es un hueco puntual, no una carencia general.

**SUGERENCIA** — `peer-focus-visible:` sobre la tarjeta (el input ya es hermano del label), replicando el mismo `outline: 3px solid` que usa todo lo demás.

---

### S7-F02 (BAJA) — El chip "Con chip" no llega al contraste mínimo; sus hermanos de la misma fila sí

**OBSERVACIÓN** — `/perdidas`, chips de las tarjetas, todos sobre fondo blanco:

| Chip | Tamaño | Color | Contraste | Mínimo | |
|---|---|---|---|---|---|
| Castrado / Castrada / Castrado-a | 12 px | `rgb(46, 125, 79)` | **5,05** | 4,5 | ✅ |
| Castrado/a (variante chica) | 10 px | `rgb(60, 75, 85)` | **9,01** | 4,5 | ✅ |
| **Con chip** | 12 px | **`rgb(78, 151, 209)`** | **3,15** | 4,5 | ❌ |

Mismo tamaño, mismo fondo, misma fila: el verde pasa con holgura y el azul se queda a un tercio del umbral. Es un token de color, no un problema de layout.

Detalle menor del mismo barrido: el chip "Castrado/a" aparece con **dos tratamientos** distintos (10 px gris oscuro y 12 px verde) según la tarjeta.

---

### S7-F03 (BAJA) — Texto auxiliar de la credencial a 4,37:1 sobre el fondo crema

**OBSERVACIÓN** — `/mis-mascotas/[token]`, marcadores de foto de la credencial:

| Texto | Tamaño | Color | Fondo | Contraste |
|---|---|---|---|---|
| "Foto" | 10 px | `rgb(103, 116, 125)` | `rgb(246, 244, 237)` | **4,37** |
| "+" | 22 px | `rgb(103, 116, 125)` | `rgb(246, 244, 237)` | **4,37** |

Queda 0,13 por debajo de 4,5. El mismo gris **sí pasa sobre blanco** (4,80), así que lo que lo empuja debajo del umbral es el fondo crema de la tarjeta, no el color en sí.

---

## Verificado y limpio

- **El foco se ve en todo lo demás, y se ve bien.** Recorrí los 40 primeros focusables de `/perdidas` (links, botones, selects, inputs, checkboxes): **40 de 40** cambian de estilo al recibir foco, con `outline: 3px solid`. Cero elementos sin indicador.
  *Nota de alcance, para no sobrevender:* medí con `.focus()` programático. Como el foco de teclado siempre activa `:focus-visible`, un indicador que aparece con foco programático también aparece con teclado — el sentido de la inferencia es seguro.
- **Texto al 200 % sin romper nada.** Con `html { font-size: 200% }` (32 px de base): `scrollWidth` **1677** = `clientWidth` **1677** → **cero scroll horizontal**. Cero elementos desbordando `main`. Cero texto recortado real *(el único candidato era la leyenda sr-only "Tipo de situación (obligatorio)", que mide 1 px por diseño)*.
- **Barrido de contraste automático, página por página:**

| Página | Fallas |
|---|---|
| `/denuncias/nueva` | **0** |
| `/perdidas` | 1 (S7-F02) |
| `/mis-mascotas/[token]` | 2 (S7-F03, mismo color y fondo) |

- **Los chips de 10 px del portal de operador pasan.** "POR VENCER": `rgb(150, 96, 14)` sobre `rgb(253, 246, 234)` → **4,92**. Lo verifiqué porque el tamaño lo hacía sospechoso; el color está bien elegido.
- **Los guiones de estado de `/adoptar`**: `rgb(97, 110, 119)` sobre blanco → **5,24** ✅. (Su problema es de significado, no de contraste — ver S1-F13.)
- **La severidad no se comunica sólo por color.** Las tarjetas de alerta del portal de gobierno llevan el ícono en `aria-hidden="true"` y la palabra en texto para lector de pantalla: `"SLA ENO, Atención"`, `"Antirrábica vencida, Peligro"`. Y las prioridades del briefing son texto visible: "PRIORIDAD ALTA" / "PRIORIDAD MEDIA".
- **El skip link funciona en las páginas normales:** `main#main-content` existe y `#main-content` resuelve. *(Falla sólo en la página de 404 — reportado como S6-F05.)*
- **Las sugerencias del autocomplete son alcanzables con teclado** (son `<button>`, se llega con Tab) — aunque no con flechas, que es lo esperable en un combobox (S1-F11).

---

## No pude verificar

1. **Layout mobile real (< 640 px).** Chrome en Windows no baja de ~657 px de ventana / 642 px de viewport, y `zoom` sobre `documentElement` escala el render pero **no mueve las media queries** (`clientWidth` sigue reportando 642). Lo que puedo afirmar es que **a 642 px y con texto al 200 % no hay scroll horizontal ni texto cortado**; lo que **no** puedo afirmar es nada sobre el layout base de teléfono. Es el mismo hueco que quedó en la corrida anterior y sigue siendo el más relevante de todo el QA: es el ancho de quien escanea un QR en la calle.
2. **Contraste en los portales de operador** (gob y admin) con el barrido automático: lo corrí sobre páginas públicas y de ciudadano. Los valores de operador que reporto (POR VENCER, `<dt>` de 12 px) los medí puntualmente, no con el barrido completo. **Falta pasar el auditor por `/gob/*` y `/admin/*` con sesión de operador.**
3. **Orden de tabulación** dentro de la cola de denuncias y del panel lateral de detalle (¿el foco entra al panel al abrirlo? ¿queda atrapado? ¿vuelve a la lista al cerrar?). No llegué.
4. **Navegación completa por teclado de un flujo entero de punta a punta** (denuncia de 5 pasos sin tocar el mouse). Probé el foco elemento por elemento, no el recorrido.
5. **Lector de pantalla real.** Todo lo de accesibilidad acá es inspección de DOM y estilos computados, no escucha con NVDA/VoiceOver.
6. **`prefers-reduced-motion`** y modo de alto contraste del sistema — sin probar.

---

## HANDOFF S7 → S8 (§10.2)

**Estado: PARCIAL.** Foco, contraste y resize de texto medidos con evidencia numérica. Faltan los 6 puntos de arriba, y el más importante sigue siendo mobile real.

**Sesión actual:** `graciela@dim.test`. Sin entidades creadas ni modificadas en esta sesión — fue sólo medición.

| Para | Qué queda |
|---|---|
| **S8** | Catálogo de formatos de fecha; ventana 21:00–00:00 ART para el desfasaje ART/UTC; cerrar `CAS-A9F2-MV8R` marcando a CW-Tero como encontrado |
| **Cierre** | Pasar el auditor de contraste por `/gob/*` y `/admin/*`; matriz consolidada |
