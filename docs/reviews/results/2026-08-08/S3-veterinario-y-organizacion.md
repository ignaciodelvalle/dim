# S3 · Veterinario y organización
**Cuentas:** `orgadmin@dim.test` (Refugio Test · `DIM-UATE-YXZK`) · `vet@dim.test` (Consultorio Dr. Juan Veterinario · `DIM-MMTC-M6J4`)
**Ventana:** 08/08/2026 11:41–12:41 ART

---

## Entidades creadas

| Tipo | Código | Estado |
|---|---|---|
| Servicio | **CW-Consulta general — jornada QA 08/08** | PENDIENTE de aprobación · Consulta general · 20 min · cap. 2 · gratuito |
| Regla de agenda | sobre `OFR-Z72K-C3WG` | Lun–Sáb **09:00–13:00**, 08/08 → 31/08 |
| Mascota de refugio | **DIM-8PBD-KVAF** (CW-Rescate-QA-0808b) | En custodia de Refugio Test → **publicada en `/adoptar`** |
| Evento clínico firmado | Antirrábica en CW-Tero | **VERIFICADO** · matrícula V-12345-BA · 11:40 ART |

*(Quedó también un intento fallido mío, `CW-Rescate-QA-0808`, que **no** llegó a crearse — ver "Falsa alarma" más abajo.)*

---

## Cierre de S2-F01: prueba controlada antes/después sobre la misma mascota

Esto no es un hallazgo nuevo — es la evidencia que faltaba para el de S2, y salió limpia.

| Momento | Estado de la antirrábica de CW-Tero | `/p/DIM-WR9N-Y7BN` dice "ANTIRRÁBICA" | ¿Aparece "Verificado por veterinario matriculado"? |
|---|---|---|---|
| 11:03 ART | **DECLARADA** por el dueño | **VIGENTE** | **no** |
| 11:40 ART | **VERIFICADA**, firmada por vet (V-12345-BA) | **VIGENTE** | **sí** |

Misma mascota, misma URL, mismo texto de estado en los dos casos. Lo único que cambia es la aparición de una línea extra. **S2-F01 queda confirmado con prueba controlada.**

---

## Hallazgos

### S3-F01 (MEDIA) — El "Agregar regla" de agenda llega con Lunes a Viernes ya tildados, y acepta reglas superpuestas sin avisar

**OBSERVACIÓN — medido dos veces** (una al usarlo, otra recargando la página en limpio a las 12:03 ART).

Estado inicial del formulario "Agregar regla" en `/org/DIM-UATE-YXZK/servicios/OFR-Z72K-C3WG/agenda`, recién cargado:

| Día | Lun | Mar | Mié | Jue | Vie | Sáb | Dom |
|---|---|---|---|---|---|---|---|
| Tildado por defecto | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

Y `startTimeLocal` viene en `08:00`, `endTimeLocal` en `12:00`, `effectiveFrom` en la fecha de hoy.

Yo quería agregar **sólo el sábado**. Tildé "Sáb" y guardé. Resultado: una regla **Lun, Mar, Mié, Jue, Vie, Sáb**, que se superpone con la regla que ya existía (Lun–Vie 08:00–12:00) en toda la franja 09:00–12:00.

**El sistema aceptó las dos reglas superpuestas sin ninguna advertencia.** La tabla quedó así:

```
Lun, Mar, Mié, Jue, Vie          08:00:00 – 12:00:00   6 de ago de 2026 → 31 de ago de 2026
Lun, Mar, Mié, Jue, Vie, Sáb     09:00:00 – 13:00:00   8 de ago de 2026 → 31 de ago de 2026
```

**A favor, y es importante:** los turnos generados **no se duplicaron**. El lunes 10 quedó con la unión limpia 08:00→12:30, sin repetir las franjas superpuestas. El motor resuelve bien; el problema es que el operador no tiene forma de saberlo y la pantalla le muestra dos reglas que se pisan.

**SUGERENCIA** — que el formulario de alta arranque sin días tildados, y que al guardar una regla que se superpone con otra vigente lo diga ("Esta regla se superpone con la del Lun–Vie 08:00–12:00; los turnos no se duplican").

---

### S3-F02 (MEDIA) — "Materializar ahora" informa "Turnos nuevos: 0" y sí generó turnos nuevos

**OBSERVACIÓN** — secuencia con horas:

| Hora ART | Qué pasó |
|---|---|
| 11:23 | Agrego la regla Lun–Sáb 09:00–13:00, vigente desde hoy |
| 11:24 | Toco "Materializar ahora" → **"Listo. Reglas procesadas: 2. Turnos nuevos: 0."** |
| 11:26 | En `/turnos/buscar/OFR-Z72K-C3WG` aparece **"SÁBADO, 8 DE AGOSTO — 11:30 · 12:00 · 12:30"** y el lunes llega hasta **12:30** |

Antes de la regla nueva no podía haber turnos el sábado (la única regla era Lun–Vie) ni después de las 12:00. Los turnos que veo sólo puede haberlos producido la regla que acababa de crear, y el botón me dijo que no creó ninguno.

**HIPÓTESIS** — o el contador cuenta otra cosa (filas persistidas vs. franjas derivadas al leer), o se calcula antes de insertar. No tengo el código: es conjetura.

**Por qué importa:** el propio copy del botón dice *"El cron lo hace automáticamente; este botón es para preview inmediato"*. Es decir, el número **es** el producto de ese botón. Un operador que lee "Turnos nuevos: 0" concluye que su regla no funcionó y la toca de nuevo.

---

### S3-F03 (MEDIA) — La pantalla de walk-in no dice que la mascota está reportada como perdida

**OBSERVACIÓN** — 11:38 ART, `vet@`, `/org/DIM-MMTC-M6J4/atender/DIM-WR9N-Y7BN`.

La pantalla completa son 24 líneas de texto. Busqué `perdid|extravi|busca`: **cero coincidencias**. Muestra nombre, especie, token, la matrícula con la que se firma y el menú de eventos.

En el mismo minuto, `/p/DIM-WR9N-Y7BN` mostraba **"SE BUSCA: CW-Tero"** y **"ESTÁ PERDIDO"**.

El veterinario es, después del que la encuentra, la persona con más probabilidad de tener enfrente a un animal perdido: alguien lo levanta de la calle y lo primero que hace es llevarlo a una veterinaria. El producto ya sabe que está perdido y ya tiene al profesional con el token en la mano — y no se lo dice.

**SUGERENCIA** — una banda arriba de "Atendiendo a…": "Esta mascota está reportada como perdida desde el 8/8 · [Avisar al dueño]". Reusa el aviso que ya existe en `/p`.

---

### S3-F04 (MEDIA) — El checklist de onboarding se des-completa cuando el refugio adopta bien

**OBSERVACIÓN** — dos estados medidos, el segundo provocado por mí:

| Momento | Animales en custodia | INGRESOS (SEMANA) | Checklist | Ítem "Primer animal" | KPI de ocupación |
|---|---|---|---|---|---|
| 11:45 ART | **0** | **2** | **3 / 5** | pendiente: *"Registrá tu primer animal"* | *"— · **Sin animales aún**"* |
| 12:20 ART (tras mi ingreso) | 1 | 3 | **4 / 5** | **(completado)** | *"1 · en custodia · sin capacidad declarada"* |

Refugio Test ya había registrado animales: en las notificaciones de `graciela@` está, textual, *"Refugio Test te registró como dueño/a de CW-Refu-Manchas"* de hace 2 días, y el panel mismo contaba 2 ingresos esa semana. Aun así el paso "Primer animal" figuraba **sin completar**.

**HIPÓTESIS** — el ítem se deriva del conteo de animales en custodia **ahora**, no de si alguna vez ingresó uno. Lo digo como conjetura, pero los dos estados medidos son consistentes con eso.

**Por qué importa:** un refugio que hace bien su trabajo —adoptar todo lo que entra— ve su onboarding retroceder de 4/5 a 3/5 y recibe otra vez la tarjeta de "registrá tu primer animal". Y el KPI le dice **"Sin animales aún"**, con un "aún" que es falso.

**SUGERENCIA** — el paso de onboarding debería mirar "¿alguna vez ingresó un animal?" y el KPI vacío decir "Sin animales en custodia" en vez de "Sin animales aún".

---

### S3-F05 (BAJA) — Fechas en título capitalizado: "Sábado, 8 De Agosto De 2026"

**OBSERVACIÓN — medida exacta, esto no es hipótesis:**

```
textContent  : "sábado, 8 de agosto de 2026"      ← correcto
CSS          : text-transform: capitalize
innerText    : "Sábado, 8 De Agosto De 2026"      ← lo que se ve
```

Aparece al menos en dos superficies distintas:
- `/turnos/buscar/OFR-Z72K-C3WG/reservar/…` → "**Sábado, 8 De Agosto De 2026** a las 12:00"
- Panel de `vet@`, "Agenda de hoy" → "**Sábado, 8 De Agosto**"

`capitalize` pone mayúscula a **cada palabra**, que es lo correcto para un título en inglés y lo incorrecto para una fecha en español. Las preposiciones no van en mayúscula.

**SUGERENCIA** — `::first-letter` en vez de `capitalize`, o capitalizar en JS sólo la primera letra.

---

### S3-F06 (BAJA) — Horarios de agenda con segundos: "08:00:00 – 12:00:00"

**OBSERVACIÓN** — tabla "Reglas activas" en la agenda del servicio. Las dos reglas muestran `08:00:00 – 12:00:00` y `09:00:00 – 13:00:00`.

En el resto del producto los horarios van sin segundos ("a las 11:08", "Hora (24 h) 11:05", los slots "11:30 / 12:00 / 12:30"). Acá se ve el valor crudo de la columna.

---

### S3-F07 (BAJA) — `?service_kind=` inválido se imprime tal cual como encabezado de la página

**OBSERVACIÓN** — 12:09 ART. Entré a `/turnos/buscar?service_kind=spay_female_dog` (valor inventado; el real es `sterilization_dog_female`). La página respondió **200** y su primera línea, donde va el nombre del servicio, dice literalmente:

> **spay_female_dog**

Con el valor correcto dice "Ovariectomía perra". O sea que el parámetro no se valida: lo que venga en la URL se imprime como encabezado.

Detalle adicional del mismo momento: **cambiar el `<select>` de servicio no rehace la búsqueda** ni actualiza la URL — hay que tocar "Buscar". Con el encabezado equivocado en pantalla, eso hace más difícil darse cuenta del estado en el que uno está.

---

### S3-F08 (BAJA) — El portal de organización convive con dos estilos de formulario, y el intake quedó del lado viejo

**OBSERVACIÓN** — alturas computadas y estilo de etiqueta, todo dentro del **mismo** portal de organización:

| Pantalla | Inputs | Selects | Radios | Etiquetas |
|---|---|---|---|---|
| `servicios/nuevo` | **44 px** | **44 px** | 16 px | MAYÚSCULA MONO |
| `mascotas/…/adoptar` | **44 px** | **44 px** | — | MAYÚSCULA MONO |
| **`intake?tab=registrar`** | **38 px** | **37 px** | **13 px** y **16 px** | Sentence case |
| `turnos/buscar` (ciudadano) | 44 px localidad · **35 px** resto | 31 px | 16 px | MAYÚSCULA MONO |
| botón "Buscar" de `/turnos/buscar` | — | — | — | **29 px de alto** |

El intake individual es el formulario más largo del portal y es el que quedó afuera. Dentro de él conviven además **dos tamaños de radio**: 13 px (Sexo, Motivo del ingreso) y 16 px (Custodia temporal / Dueño permanente).

**No afirmo que sean "dos sistemas de componentes"** — esa lectura ya se probó equivocada. Lo que reporto son las alturas medidas y el hecho de que **falta un piso**: 44 px es el mínimo táctil accesible y varios controles quedan por debajo, con el botón de submit de la búsqueda de turnos en 29 px como el peor caso.

---

### S3-F09 (BAJA) — Dos rutas hermanas para adopción, una en inglés y otra en español

**OBSERVACIÓN** — sobre la misma mascota:

| Ruta | HTTP | Qué es |
|---|---|---|
| `/org/{org}/mascotas/{token}/**adoption**` | 200 | "Finalizar adopción" |
| `/org/{org}/mascotas/{token}/**adoptar**` | 200 | "Publicar en adopción" |

Dos funciones distintas del mismo dominio, con el nombre en dos idiomas. Es el mismo patrón que S1-F06 (`/login` y `/signup` en un producto en español).

---

## Verificado y limpio

- **Intake individual → elegibilidad → publicación en adopción: cierra completo.** `CW-Rescate-QA-0808b` (`DIM-8PBD-KVAF`) creado 11:30, marcado apto, publicado 11:37, y **aparece en `/adoptar` y su ficha pública responde 200 con el nombre** en el mismo minuto. Este era territorio marcado como "sin spec e2e detrás ⇒ trabarse ahí es hallazgo": **no se traba**.
- **La pantalla de publicación explica el bloqueo en vez de esconderlo:** *"La mascota no está marcada como apta para adopción todavía. Marcala apta primero en la pestaña de Elegibilidad. Podés igual editar la historia y los requisitos para tenerlos listos cuando la mascota califique."* Es exactamente cómo debería comportarse un bloqueo.
- **Alta de servicio en 3 pasos** con la consecuencia declarada antes de empezar: *"Una vez enviado, la autoridad competente lo revisa y aprueba antes de que puedas armar la agenda."* Quedó en PENDIENTE, como corresponde.
- **El motor de turnos no duplica** pese a las reglas superpuestas, y **oculta los slots ya pasados**: a las 11:26 el sábado empezaba en 11:30, no en 09:00.
- **La búsqueda de turnos del ciudadano refleja la agenda al instante:** "58 turnos disponibles en 7 días" y el detalle día por día.
- **Empty state de reserva sin mascota:** *"Necesitás una mascota registrada · Registrar mascota →"*.
- **Empty state de mascotas de la org:** *"Todavía no hay animales registrados a nombre de la organización · Registrar ingreso"*.
- **El wizard de intake protege bien sus pasos:** el botón "Crear ingreso" del paso 4 está `disabled`, dentro de un contenedor `inert` + `aria-hidden="true"`, y fuera de pantalla. Es más estricto que el wizard de denuncia (que sólo usa `inert`).
- **Walk-in del vet:** buscó por token, declaró con qué matrícula se firma (*"Firmás como matrícula V-12345-BA · verificado por profesional"*), y al guardar confirmó *"Evento clínico firmado"*. El efecto en `/p` fue inmediato.
- **Panel de la org: los KPI se movieron correctamente** con el ingreso (ocupación 0→1, ingresos semana 2→3, checklist 3/5→4/5).
- **El contador "0 / 3" del panel de vet@ no es un bug:** lista 4 filas pero "Verificación" no cuenta para el total, igual que en Refugio Test (6 filas, total 5). Consistente.

---

## Falsa alarma que verifiqué antes de escribirla

**Creí haber encontrado que el intake individual fallaba en silencio.** Mi primer intento (11:27) no creó nada: el formulario se reseteó, sin error, sin `role=alert`, y `CW-Rescate-QA-0808` no apareció ni en custodia ni en la cola.

Antes de reportarlo lo medí en frío. Con el wizard en el paso 1, el botón "Crear ingreso" está:

```
disabled: true · inert en un ancestro: true · aria-hidden="true" en un ancestro: true
posición: y = 976 px (fuera del viewport de 888 px)
```

O sea: **ningún usuario real —con mouse, con teclado o con lector de pantalla— puede llegar a ese botón.** Lo alcancé yo despachando eventos sintéticos directo sobre un botón deshabilitado e inerte. **No es un defecto del producto, es un artefacto de mi instrumentación.** Repetido correctamente, el intake funcionó a la primera.

**Nota de método, para las sesiones que siguen:** en esta app `innerText` pega textos que en pantalla están separados por márgenes CSS. Me pasó tres veces hoy ("agostoOvariectomía perra", "Peso estimado (kg)Ayuda a evaluar…", "Código de tatuajeOpcional…") y en las tres, la captura mostró que **el espaciado visual estaba bien**. No reporto ninguna: la concatenación en `innerText` no es evidencia de concatenación visual.

---

## No pude verificar

1. **Que el dueño reciba la notificación del evento walk-in** (mitigación PO 04/08, marcada ALTA si falla). Requiere reloguear `owner@`; lo agrupo con S6, que ya es una sesión de cambios de cuenta.
2. **Microchip walk-in** — cubierto por la re-verificación M3 de la corrida anterior (12/12 PASS); no lo repetí para no gastar tiempo en terreno ya pisado.
3. **Atender un turno reservado.** No llegué a reservar uno: hacerlo exige volver a `owner@`/`graciela@` con una mascota elegible. La agenda quedó armada y con turnos disponibles, así que el turno es reservable — sólo falta el paso del ciudadano.
4. **`Identificar →` y el campo "¿Qué le hiciste a la mascota?"** (captura rápida en lenguaje natural) del walk-in. Superficie nueva, sin recorrer.
5. **Ciclo de adopción completo** (postulación → aprobar → finalizar → transferencia de custodia) sobre `DIM-8PBD-KVAF`. Publiqué la ficha; la postulación necesita un ciudadano. **Anotado para S6.**
6. **Aprobar el servicio CW-Consulta general** — está PENDIENTE y lo aprueba la autoridad. **Anotado para S5.**

---

## HANDOFF S3 → S4 (§10.2)

**Estado: PARCIAL.** Cerré agenda + intake + publicación en adopción + walk-in firmado, y de paso cerré con prueba controlada el hallazgo ALTA de S2. Quedan los 6 puntos de arriba.

**Sesión actual:** `vet@dim.test`. **Logins:** `owner@` ×2, `graciela@` ×1, `orgadmin@` ×1, `vet@` ×1.

| Para | Qué verificar |
|---|---|
| **S4** (`admin@`) | ¿Aparece la solicitud del servicio CW-Consulta general en `/admin/cola`? |
| **S4** (`admin@`) | ¿El padrón usa la misma regla de "POR VENCER" que S2-F06? |
| **S5** (`govt-local@`) | Aprobar CW-Consulta general; ver si `DEN-RCDE-GY9P` llegó a la cola; mapeo gravedad→prioridad |
| **S6** | Notificación del walk-in a `owner@`; postulación de adopción a `DIM-8PBD-KVAF`; `owner@` sin acceso a CW-Luna |
| **S7** | Radios de 13 px y botón de 29 px: foco visible y contraste |
| **S8** | Catálogo de formatos de fecha — van **cinco** distintos: "15 de agosto de 2026" · "1 de ago de 2026" · "5 ago 2026" · "6 de ago de 2026" · "Sábado, 8 De Agosto De 2026" |
