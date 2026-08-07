# Crítica de diseño: Alta y primeros pasos del dueño (C4)

> **Persona**: dueño nuevo, no técnico, que registra porque el municipio se lo pidió. No eligió estar acá; cualquier fricción o palabra rara es un motivo para irse.
> **Evidencia**: bundle `docs/reviews/results/2026-07-27-critique-screenshots/alta/` (desk-vacio, desk-wizard-1, desk-wizard-validacion, mob-vacio, mob-wizard-1 a 390px). Ambos `index.json` listan todas las capturas sin pasos fallidos y sin errores de consola; **desk-wizard-validacion sí muestra validación**, así que se evalúa desde el pixel + código.
> **Declaración sobre el "modal post-alta"**: el `PostCreateModal` del plan **ya no existe** — fue borrado (audit 2026-07-03 + decisión PO, ver comentario en `app/(app)/mis-mascotas/[publicToken]/page.tsx:1143-1146`). El momento post-alta lo posee la página `PetCreatedAha` (`app/(app)/mis-mascotas/nueva/[publicToken]/credencial/PetCreatedAha.tsx`), **evaluada desde código, sin captura**.
> **[ENTORNO]**: datos sintéticos; cuenta seed "Mara (MF)"; la campanita con badge "1" en cuenta fresca es artefacto del seed y no se critica. En mob-wizard-1 la tab bar aparece "encima" del campo Sexo/Provincia: es un artefacto de captura full-page (elemento `fixed` renderizado en su posición de viewport), **no** un bug de layout — lo real y verificado en código es que la barra persiste durante el wizard (`AppShell.tsx:119` reserva el padding).

---

### Impresión general

En los primeros 2 segundos, `/mis-mascotas` vacío se ve prolijo, institucional y legible (desk-vacio.png, mob-vacio.png): marca miMAR, un recuadro punteado con un botón claro. Pero el mensaje que la persona necesita —"acá le creás a tu mascota una credencial con QR"— **no está en ninguna parte de la pantalla de entrada**: el estado vacío dice "Cargá una mascota para verla acá" (razón circular: registrar para… ver una lista), y la palabra "credencial" recién aparece en la letra chica del footer. Alrededor del recuadro, la página habla en idioma de mostrador: "Bandeja", "Casos abiertos", "postulación", "Reclamar", "0 activas" — para una cuenta con cero historia, eso **burocratiza** antes de invitar. El wizard en sí es lo mejor del flujo: corto (2 pasos), con lenguaje humano ("Luna, Milo, Chicho…", "No sé") y una bifurcación dueño/cuidador muy bien explicada. El remate conceptual ("la mascota es la credencial") existe y está bien escrito… pero recién en la pantalla de éxito, cuando ya cruzaste todo el flujo sin saber para qué era.

Respuestas a las preguntas rectoras: **¿el vacío invita o burocratiza?** — el recuadro invita tibio, la página alrededor burocratiza. **¿Cada campo dice para qué?** — solo Localidad lo dice explícito; Raza lo dice en jerga (PPP). **¿El dueño termina entendiendo que el carnet/QR es el producto?** — sí, pero recién al final y sin forma de llevárselo impreso.

---

### Usabilidad

| Sev. | Hallazgo | Evidencia | Detalle e impacto |
|---|---|---|---|
| 🔴 | **Cuatro verbos distintos para "dar de alta"** en el mismo recorrido: "+ Inscribir mascota" (header), "Cargar una mascota" (estado vacío), "Registrar tu primera mascota" (wizard) y "Asentar" (tab bar móvil, que además NO es el alta). | desk-vacio.png, mob-vacio.png, desk-wizard-1.png · `app/(app)/mis-mascotas/page.tsx:213,283-288` · `MinimalNewPetForm.tsx:271` · `components/layout/CitizenTabBar.tsx:153` | El dueño no técnico no puede formar un modelo mental único de "esto es LO que vine a hacer". En desktop-vacío hay dos botones primarios azules simultáneos con nombres distintos para la misma acción. "Inscribir" y "Asentar" son además los verbos más notariales posibles. |
| 🔴 | **"Asentar" con 0 mascotas es un callejón sin salida**: el botón central de la tab bar (el "+" más parecido a un FAB de "agregar", lo primero que un usuario nuevo va a tocar) apunta a `/inicio?sheet=anotar`, que con cero mascotas redirige de vuelta a `/mis-mascotas` con el parámetro inerte — documentado como inerte en el propio código. | mob-vacio.png · `components/layout/CitizenTabBar.tsx:128-130` · `app/(app)/inicio/page.tsx:88-90` (comentario: "?sheet=anotar itself is INERT there") | El usuario toca "+", la página se recarga sobre sí misma y no pasa nada. Para la persona de esta crítica eso se lee como "está roto" en el primer minuto de uso. |
| 🟡 | **El estado vacío no vende el producto**: "No tenés mascotas registradas. / Cargá una mascota para verla acá." no menciona credencial, QR, chapita ni libreta. La única mención de "chapita" en la página está en la card secundaria "Reclamar una mascota". | desk-vacio.png, mob-vacio.png · `app/(app)/mis-mascotas/page.tsx:280-290` | El municipio le dijo "registrala"; miMAR no le dice qué gana. El momento de mayor atención (primer login) se gasta en una tautología. |
| 🟡 | **Validación secuencial, al pie y sin marcar el campo**: con el formulario vacío, "Continuar" muestra UN solo error por vez ("Escribí el nombre de tu mascota.") en texto mono de 11.5px al fondo del form; el campo Nombre no se pinta, no recibe foco ni scroll. Con todo vacío hacen falta 3 clics para descubrir los 3 problemas (nombre → especie → localidad). | desk-wizard-validacion.png · `MinimalNewPetForm.tsx:213-228` (guard secuencial), `:470-477` (render del error) | El tono del mensaje es excelente (voseo, imperativo claro). La mecánica no: `LnField` ya soporta `error` por campo con `aria-invalid` autoinyectado (`components/ui/Field.tsx:69-108`) y el form no lo usa — la plomería existe, está desconectada. |
| 🟡 | **[código, sin captura] La pantalla post-alta pide guardar el QR en el collar pero no da cómo**: `PetCreatedAha` dice "Guardalo en el collar o compartilo con el veterinario", y sus 3 CTAs son Compartir / Ver perfil / Ver credencial pública — no hay "Descargar QR", "Imprimir" ni camino a la chapita. Además "Ver perfil" vs "Ver credencial pública" es una distinción (privado vs público) que esta persona no tiene por qué conocer. | `PetCreatedAha.tsx:104-107` (copy), `:143-170` (CTAs) | El siguiente paso correcto para el dueño municipal es físico (QR/chapita en el animal). La pantalla enseña el concepto perfecto y corta justo antes del acto. |
| 🟡 | **El "para qué" de Raza llega en jerga**: para perros, el hint es "En perros, la raza (y el peso) definen si entra en el régimen PPP." — sigla sin expandir en el caso más común del sistema (perro). El callout posterior sí explica bien, pero solo aparece si la raza ya es PPP. | [código; condicional a especie=perro, no visible en capturas] · `MinimalNewPetForm.tsx:328-331` | Primer contacto de la persona con lenguaje regulatorio críptico dentro de un wizard que venía impecable. |
| 🟡 | **Buscador con cero mascotas**: "Buscar por nombre" se renderiza incondicionalmente, incluso con lista vacía, empujando el recuadro de invitación hacia abajo. | desk-vacio.png, mob-vacio.png · `app/(app)/mis-mascotas/page.tsx:245-249` | Buscar sobre un conjunto vacío es ruido puro y refuerza la sensación de "sistema de registro" en vez de "tus mascotas". |

Lo que **no** es fricción: el mínimo pedido (nombre + especie + provincia/localidad; sexo con default "No sé", raza y foto opcionales, paso 2 completamente salteable) es genuinamente bajo y está bien calibrado. Localidad es el único campo que declara su para qué ("Ayuda a las campañas regionales de salud animal") — ese patrón es el que falta en el resto.

---

### Jerarquía visual

- 🟢 **Indicador de paso huérfano en desktop** (desk-wizard-1.png): "Paso 1 de 2 / Identidad" vive en la esquina superior izquierda mientras el formulario está centrado; el ojo no los conecta. La barra de progreso además arranca en 0% con 2px de alto (`WizardShell.tsx:44,110`) — en paso 1 es invisible, así que todo el peso del progreso queda en un texto gris de 12px.
- 🟢 **Doble primario en el vacío desktop** (desk-vacio.png): "+ Inscribir mascota" (header) y "Cargar una mascota" (recuadro) son dos botones azules sólidos compitiendo por la misma acción. Uno debería ceder (el del header a `variant="secondary"` mientras no haya mascotas, o directamente uno solo).
- 🟢 **Móvil 390px** (mob-vacio.png): el H1 "Mis mascotas" parte en dos líneas y el botón "+ Inscribir mascota" también — cuatro líneas de texto apretadas para una sola idea. Dentro del wizard la jerarquía sí es correcta: un solo primario por paso, título > pregunta > campos.
- La sección "Bandeja" con numeración editorial "01" y "Casos abiertos" tiene un peso tipográfico similar al del recuadro principal: en una cuenta fresca, la segunda pantalla completa del scroll móvil es toda burocracia vacía (ver Prioridad 2).

---

### Consistencia

- 🟡 **Dos sistemas de labels en el mismo formulario** (desk-wizard-1.png, mob-wizard-1.png): NOMBRE / ESPECIE / RAZA / SEXO usan el label mono-mayúsculas gris del design system (`components/ui/Field.tsx:113-115`), pero "Provincia" y "Localidad o barrio" renderizan sentence-case en tinta oscura porque `LocationFields` arma sus labels a mano (`components/LocationFields.tsx:429-436,456-463`). Mismo form, dos anatomías. De paso, la convención de requerido queda mixta: asterisco rojo sin leyenda en unos, "opcional" explícito en otros, y un "Requerido." suelto en mono 10.5px bajo Localidad.
- 🟡 **Hover ≈ seleccionado en los chips de especie**: el estado hover de un chip no elegido pinta el mismo borde azul y el mismo fondo celeste que el estado activo; solo cambia el color del texto (`MinimalNewPetForm.tsx:559-562`). Es exactamente lo que se ve en desk-wizard-1.png: "Gato/a" parece elegido (era el hover del mouse de la captura) mientras Raza sigue diciendo "Elegí la especie primero". Un usuario con mouse puede creer que ya eligió especie y comerse el error de validación.
- 🟢 **Copy asertivo en "Reclamar una mascota"**: "Tu mascota ya tiene chapita o microchip registrado." es una afirmación, no una condición — a un dueño flamante le dice algo falso sobre su mascota. Debería ser "¿Tu mascota ya tiene…?" o "Si tu mascota ya tiene…" (`app/(app)/mis-mascotas/page.tsx:413-416`). En la misma línea menor: "0 activas" como subtítulo de una cuenta vacía es contabilidad, no bienvenida.
- Consistente y bien: el voseo es uniforme en todo el flujo; los placeholders instructivos ("Elegí la especie primero", "Elegí primero la provincia") repiten el mismo patrón de gating; footer y marca idénticos en todas las pantallas.

---

### Accesibilidad

**Sólido (y poco común de ver):**
- `LnField` autoinyecta `id`, `aria-required` y `aria-invalid` para que ningún caller rompa la asociación label↔control (`Field.tsx:74-108`).
- El cambio de paso mueve el foco a la progressbar con `aria-label="Paso X de Y"` (`WizardShell.tsx:53-64,107-123`); la página de éxito enfoca el `h1` al montar y el QR lleva `role="img"` con la URL en el `aria-label` (`PetCreatedAha.tsx:33-35,113-117`).
- Touch targets: tabs con `min-h-12` (test dedicado `__tests__/a11y-touch-targets.test.tsx`), inputs ≥44px y fuente ≥16px en móvil para evitar el zoom de iOS (`Field.tsx:4-7`).
- Errores con `role="alert"`; chips de especie con `aria-pressed`.

**Deudas:**
- 🟡 **Tres grupos de opciones sin semántica de grupo**: "¿Es tu mascota o la estás cuidando?" (`CustodyKindToggle.tsx:26-28`), "Especie" (`MinimalNewPetForm.tsx:566-571`) y "Sexo" (`:363-365`) usan `<p>` como pseudo-label, sin `fieldset/legend` ni `role="group"` + `aria-labelledby`. Un lector de pantalla anuncia "Es mi mascota, botón, presionado" sin la pregunta que le da sentido; en Sexo, radios reales sin legend.
- 🟡 Consecuencia del hallazgo de validación: como el form nunca pasa `error` a `LnField`, **`aria-invalid` no se activa jamás** en el alta — el usuario de lector de pantalla escucha el alert global pero al navegar el campo no hay marca.
- 🟢 El canal de error es chico y mono (11.5px, `MinimalNewPetForm.tsx:472`) y distingue solo por color rojo; `role="alert"` compensa para SR, pero para baja visión es un susurro. (Contraste exacto no medible desde PNG; no se afirma incumplimiento.)

---

### Lo que funciona bien

- **El wizard de 2 pasos es corto de verdad** y el paso 2 entero es salteable con copy honesto: "Podés hacerlo ahora o más tarde."
- **La bifurcación dueño/cuidador** es la mejor pieza de UX writing del flujo: dos tarjetas con ejemplos concretos ("La adoptaste, te la regalaron…") y, al elegir "La estoy cuidando", una consecuencia explicada en humano: "La información viaja con la mascota si aparece su familia" (`CustodyKindToggle.tsx:44-49`).
- **"No sé" como default de Sexo** y el placeholder "Luna, Milo, Chicho…" bajan la vara emocional exactamente donde esta persona lo necesita.
- **Localidad declara su para qué** ("Ayuda a las campañas regionales de salud animal") — el patrón a replicar.
- **Robustez invisible de primera**: clave de idempotencia contra doble submit, dedupe suave con pregunta humana ("¿Es la misma mascota?" con "Ver a {nombre}" / "No, es otra — crear igual"), foto que sobrevive al reset de React 19 (`MinimalNewPetForm.tsx:93-122,479-505`).
- **La página de éxito enseña el producto y la privacidad juntos**: "Esto es lo que ve un extraño que escanea a {nombre}… nunca tus datos sin que los actives" (`PetCreatedAha.tsx:136-140`) — la lección llega en el único momento en que es accionable.

---

### 3 Prioridades

1. 🔴 **Un solo verbo para el alta y sin callejones para la cuenta en cero.** Unificar en **"Registrar"** (ya es el título del wizard): header "+ Registrar mascota", vacío "Registrar mi primera mascota" — `app/(app)/mis-mascotas/page.tsx:213,285-288`. Y para cuentas con 0 mascotas, el slot central de la tab bar deja de ser "Asentar" (jerga + no-op probado en `inicio/page.tsx:88-90`) y pasa a apuntar a `/mis-mascotas/nueva` con label "Registrar" — tocar `components/layout/CitizenTabBar.tsx:128-153` (necesita conocer petCount vía prop desde el layout) o, como mínimo servidor-only, redirigir `/inicio?sheet=anotar` con 0 mascotas a `/mis-mascotas/nueva` en `app/(app)/inicio/page.tsx:88-90`.
2. 🟡 **Que el estado vacío venda la credencial y la pantalla acompañe.** Reescribir `LnEmptyState` del vacío (`app/(app)/mis-mascotas/page.tsx:280-290`, ícono incluido — el prop existe en `components/ui/EmptyState.tsx`): algo como *"Creale su credencial a tu mascota — Un QR único que la identifica y lleva su libreta sanitaria. Te toma 2 minutos."* + CTA "Registrar mi primera mascota". Con 0 mascotas, además: ocultar el buscador (`:245-249`) y colapsar/posponer "Bandeja" y "Reclamar" (o moverlos bajo un disclosure), para que la primera pantalla tenga UNA idea.
3. 🟡 **Validación por campo, todos los errores juntos.** En `goToStep2` (`MinimalNewPetForm.tsx:213-228`) juntar los tres chequeos en un mapa de errores y pasarlos como `error` a cada `LnField`/label correspondiente (la infraestructura `aria-invalid` + `errorId` ya está en `components/ui/Field.tsx:69-108`; `LocationFields` cascade necesita aceptar un `error` — `components/LocationFields.tsx:426-486`), con scroll+foco al primer campo inválido. Mantener el texto de los mensajes tal cual está — el tono ya es correcto. Bonus del mismo commit: diferenciar hover de seleccionado en los chips de especie (`:559-562`, p.ej. hover solo borde, sin fondo).

---

**Conteo**: 13 hallazgos — 2 🔴 · 8 🟡 · 3 🟢. Evidencia: 5 capturas (todas evaluadas) + código; modal post-alta evaluado solo desde código (fue reemplazado por la página `PetCreatedAha`).
