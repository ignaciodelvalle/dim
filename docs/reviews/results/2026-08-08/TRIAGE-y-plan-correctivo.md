# Triage de los 48 hallazgos + plan correctivo

**Fuente:** revisión adversa de Cowork del 08/08/2026 (8 sesiones + cierre).
**Criterio del PO:** *"validemos lo que realmente merezca una tarea o una acción y por qué"*.

---

## Cómo trié

Un hallazgo merece tarea si **cambia una decisión de alguien**: del ciudadano que escanea, del operador que aprueba, del profesional que firma. Lo que sólo mejora la prolijidad va a un lote de barrido, no a una tarea propia.

Y todo lo que verifiqué, lo verifiqué **en el código**, porque el patrón de esta relación con Cowork ya está establecido: **observa muy bien y diagnostica a medias.** Esta corrida fue notablemente mejor que la anterior —cinco falsas alarmas cazadas antes de escribirlas y una retractación propia— pero igual encontré dos diagnósticos que corregir y dos severidades mal puestas, **una para arriba**.

---

## Verificados en código — merecen tarea

### 🔴 T1 · El formulario anónimo de denuncia entrega al dueño (S1-F01)

**Confirmado, y más fuerte de lo reportado.** `Step4Subject.tsx:282` renderiza `ownerInitials` en el wizard público. El docblock de su propio módulo (`lookup-pet-for-denuncia.ts:3-6`) dice que devuelve una proyección *"without exposing the owner record"*.

`petName` + `petStatus` ya cumplen el propósito declarado —confirmar que el token corresponde a una mascota registrada—. **`ownerInitials` no aporta nada a ese objetivo y es el único campo que habla de una persona.** El campo contradice el contrato escrito de su módulo.

Agravante que Cowork no nombró: **es el flujo de denuncia por maltrato.** Quien más motivo tiene para averiguar de quién es el animal por ese formulario es alguien en conflicto con el dueño.

**Acción:** sacar `ownerInitials` de la proyección pública y de `Step4Subject`. El flujo de reclamo (`claim/lookup-for-claim.ts`) es autenticado, tiene su propia copia y no se toca.

### 🔴 T2 · La credencial pública no distingue una vacuna declarada de una firmada (S2-F01)

**Observación confirmada con prueba controlada antes/después sobre la misma mascota. Diagnóstico a corregir.**

`VacunasStatusBadges.tsx:92-95` documenta que **"VIGENTE" significa deliberadamente *vigencia de la dosis*** —un hecho sobre fechas— mientras que **"Al día"** es la afirmación de cumplimiento que sí exige firma profesional. Esa distinción fue *ella misma* el arreglo de un hallazgo previo (QA 2026-07-03 finding A).

Así que el producto **no afirma algo falso**: usa una palabra precisa. El problema es otro, y sigue siendo grave: **una distinción que sólo entiende quien conoce el modelo interno no es una distinción.** Para el recepcionista de un hotel, "ANTIRRÁBICA: VIGENTE" en un documento titulado *"Registro Nacional de Mascotas"* significa "vacunado y oficial".

**Acción:** marcar la procedencia **positivamente** en `/p` — "VIGENTE (declarada por el dueño)" — en vez de depender de la ausencia de una línea. La ausencia sólo es señal para quien vio antes la presencia.

### 🟠 T3 · El walk-in no avisa que el animal está reportado como perdido (S3-F03) — **SUBO a ALTA**

`atender-access.ts:241` **ya trae `pets.status`** en la consulta, y la línea 253 sólo ramifica en `deceased`. **El estado `lost` se consulta y se descarta.**

La veterinaria tiene el animal delante, alguien se lo trajo, y es la persona mejor posicionada del sistema para reunirlo con su dueño. El North Star dice textualmente *"lost pets find their owners"*. El dato ya está en el resultado de la query.

**Cowork lo puso MEDIA; lo subo.** Es una oportunidad de reunificación perdida en el único momento en que la reunificación es posible, y el arreglo es mostrar un campo que ya se trae.

### 🟠 T4 · "Aprobaciones" dice que no hay nada pendiente mientras hay (S5-F01)

**Confirmado por construcción.** `/gob/cola` cubre exactamente tres tipos de `approval_request` (`role_upgrade_vet`, `organization_verification`, `service_dog_credential_verification`). Las ofertas de servicio **no son un approval_request** — se aprueban en Directorio. La pantalla es *estructuralmente incapaz* de saber si hay servicios pendientes, y su vacío afirma categóricamente que no hay nada.

Es la misma familia que el subtítulo de outbox que arreglamos ayer: **un estado vacío que reclama más alcance del que tiene.**

**Nota para el piloto:** `role_upgrade_vet` **sí** está en esa cola, así que las matrículas de nuestros dos veterinarios van a aparecer ahí correctamente.

**Acción mínima:** que el vacío nombre su alcance. Mejor: sumar Servicios como cuarta pestaña.

### 🟠 T5 · Las rutas de auth son las únicas en inglés (S1-F06)

**Confirmado:** existen `/login` y `/signup`; **no existen** `/iniciar-sesion` ni `/registro`. En un producto cuyo invariante es *"Spanish (es-AR) UI, English code"*, una URL es superficie de usuario, no identificador de código.

**Y acá me equivoqué yo.** Mi `e2e/mobile-390.spec.ts` incluye `/iniciar-sesion` en su lista de rutas públicas **y pasó** — porque una página 404 tampoco scrollea horizontal. Asserté layout sobre una página inexistente. Es exactamente la clase de bug que documenté anoche (un test que pasa por la razón equivocada) y lo introduje horas después de escribir sobre él.

**Acción:** rutas en español con redirect permanente desde las inglesas, **y arreglar mi spec** para que falle si la ruta no existe.

### 🟠 T6 · El checklist se des-completa cuando el refugio hace lo correcto (S3-F04)

**Confirmado por construcción.** `org-setup-checklist.ts` deriva `firstAnimal` de `input.hasAnimals`. Un refugio que adopta su último animal vuelve a `hasAnimals: false`, el paso se des-completa y **el checklist reaparece** (auto-oculta sólo cuando todo está hecho). El producto le pone deberes por haber cumplido su misión.

**Se resuelve junto con el hueco de clínicas** que ya teníamos identificado: el checklist necesita distinguir *"nunca lo hiciste"* de *"lo hiciste y ya no aplica"*.

---

## Alta confianza sin verificar — merecen tarea

Defectos evidentes por su propia descripción; verificarlos en código es trabajo del arreglo, no del triage.

| ID | Qué | Por qué merece tarea |
|---|---|---|
| **T7** | S3-F02 · "Materializar ahora" informa "Turnos nuevos: 0" y sí generó turnos | Un contador que miente sobre su propio efecto. El operador no sabe si repetir. |
| **T8** | S2-F04 / S6-F01 · "EN ADOPCIÓN" queda pegado en la credencial de la adoptante | Reproducido en una adopción de 2 minutos. Es incorrección de dato en la credencial pública. |
| **T9** | S6-F02 · La notificación de transferencia aceptada linkea a una mascota que el ex dueño ya no puede ver | Un link que garantiza un error. |
| **T10** | S1-F03 · El borrador restaura todo menos la ubicación y devuelve un paso más adelante | Pérdida de trabajo silenciosa en un wizard largo y anónimo. |
| **T11** | S7-F01 · Las tarjetas del wizard de denuncia no muestran foco de teclado | Ley 26.653. El flujo anónimo es el más expuesto. |
| **T12** | S6-F05 · El 404 global no tiene `<main>` y su skip link no lleva a nada | A11y estructural, y es la pantalla a la que ahora mandamos más tráfico tras el fix de 404 de ayer. |
| **T13** | S7-F02 · Chip "Con chip" a 3,15:1 — **subo de BAJA** | **Falla WCAG AA** (4.5:1). No es cosmético, es incumplimiento. |
| **T14** | S3-F07 · `/turnos/buscar?service_kind=<lo-que-sea>` imprime el parámetro crudo como encabezado | Reflejar entrada del usuario sin validar es feo en el mejor caso y un vector en el peor. |
| **T15** | S1-F04 · El botón de quitar foto es invisible en táctil y mide 20×20 px | Doble falla: sin afordancia táctil y muy por debajo del mínimo. |

### 🟠 T16 · "Faltan datos" toma prestado el tono de vencimiento (S2-F06) — verificado

La verificación de 10 minutos dio resultado, y **el diagnóstico de Cowork no era el correcto**. El chip no habla de vacunas: `pet-compliance.ts:699` calcula `worstTone = cards[0].tone` sobre cards ordenadas peor-primero, y la card **"Régimen PPP · Faltan datos"** lleva `tone: "due"` (líneas 612-614). `due` gana sobre el `neutral` de las tres "Sin registro", así que PPP queda primera y el chip pinta **POR VENCER**.

O sea: el resumen no miente sobre las vacunas, refleja PPP. **Pero "POR VENCER" es falso para "faltan datos": nada está por vencer.** El vocabulario de tonos confunde *"algo se está venciendo"* con *"algo no se sabe"*.

Y el propio archivo **ya resolvió exactamente esa confusión para el CONTEO** (líneas 694-697): *"It is NOT 'al día': counting it produced '3 de 3 al día' beside a card the panel now stamps SIN DATO — the same self-contradiction the vigilancia tile had."* Arreglaron el conteo y se les pasó el chip del encabezado.

**Tercera vez en dos días que un arreglo correcto no propagó** a su componente hermano (las otras dos: el piso de 44px y el zoom de iOS entre `Field` y `OpField`).

**Acción:** que "Faltan datos" no herede el tono de vencimiento — un tono propio para lo desconocido, o que el chip describa el peor ESTADO en vez del peor TONO.

---

## Los tres patrones sistémicos — un lote cada uno

Arreglarlos de raíz vale más que los síntomas sueltos, y absorben ~15 hallazgos BAJA.

### **P1 · El diccionario de enums no está aplicado en todas partes**
`dog`, `cat`, `spay_female_dog` salen crudos en **tres portales**: notificación al ciudadano, pantalla de aprobación de gobierno, y encabezado público de turnos. Alguien tildó "Perros" y "Gatos" y al funcionario le llega `dog, cat`.
**Absorbe:** S2-F03, S5-F02, S3-F07 (parcial).

### **P2 · Falta un piso de altura en los controles**
Cowork lo encuadró bien y **retiró explícitamente** la lectura de "dos sistemas de componentes" que ya se había probado equivocada. Es más simple: falta un mínimo. Medidos: 29 px el submit de `/turnos/buscar`, 31 px los de `/perdidas` y `/adoptar`, 35–39 px varios filtros, 13 y 16 px checkboxes y radios (dos tamaños en el mismo formulario).
**Continúa el trabajo de ayer** — ya pusimos el piso en los campos `md` de operador; faltan los filtros públicos y los checkbox/radio.
**Absorbe:** S1-F07, S3-F08, y los radios del intake.

### **P3 · Seis formatos de fecha y un separador que se come el espacio**
Dos formatos **en la misma pantalla** (`/transferencias`). `Sábado, 8 De Agosto De 2026` es `text-transform: capitalize` sobre texto correcto — capitaliza preposiciones, que en inglés está bien y en español no. El `·` pierde el espacio en tres componentes de tres portales.
**La hora está impecable** (24 h en los cuatro portales, verificado con regex estricta) — no tocarla.
**Absorbe:** S8-F01, S2-F08, S2-F10, S3-F05, S3-F06, S5-F04.

---

## NO merecen tarea propia — y por qué

- **S1-F08 · "Títulos de pestaña sin criterio"** → los títulos **por portal** los arreglamos ayer, con template. Lo que ve Cowork es que las páginas individuales no ponen el suyo, y eso es el comportamiento diseñado: caen al default del portal. Mejora posible, no defecto.
- **S1-F02 · El aviso de canales oficiales llega tarde** → Cowork mismo lo bajó de ALTA a MEDIA tras descubrir que el cartel **sí cambia solo** cuando la autoridad toma el caso. La retractación está escrita en su informe. Va al lote de copy.
- **S1-F09, S1-F10, S1-F13, S2-F07, S2-F09, S5-F03, S6-F03, S6-F04, S8-F03** → prolijidad de copy y micro-UX. **Un lote de barrido**, no nueve tareas.
- **S7-F03 · texto auxiliar a 4,37:1** → queda a 0,13 del umbral. Entra en el lote de contraste con T13, no aparte.
- ~~**S2-F06 · "POR VENCER" sin nada registrado**~~ → **verificado: SÍ merece tarea, y el diagnóstico era otro.** Ver T16 abajo.

---

## Necesitan tu decisión

1. **T2 (credencial pública)** — cómo se marca la procedencia sin ensuciar el documento. Es la cara pública del producto y una decisión de diseño, no de implementación.
2. **T4 (Aprobaciones)** — ¿el mínimo (que el vacío nombre su alcance) o Servicios como cuarta pestaña?
3. **T5 (rutas en español)** — cambiar URLs de auth tiene costo: links viejos, marcadores, cualquier cosa impresa. El redirect lo cubre, pero es tu llamada.

---

## Plan correctivo

| Tanda | Contenido | Por qué en ese orden |
|---|---|---|
| **1 — hoy** | **T1** (sacar el campo) + **T3** (mostrar el estado que ya se trae) | Los dos más graves y los dos más baratos: uno saca un campo, el otro muestra uno que ya está en la query. Máximo valor por línea. |
| **2** | **T4, T5, T6** + mi fix del spec | Los tres "el producto no se pone de acuerdo consigo mismo". T6 se hace junto con el hueco de clínicas del piloto. |
| **3** | **P1** (enums) | Un solo arreglo, tres portales. El de mayor superficie por unidad de trabajo. |
| **4** | **T7–T15** | Los defectos concretos, ya sin agrupar. |
| **5** | **P2** (alturas) + **P3** (fechas) + lote de copy | Barridos mecánicos, verificables, de bajo riesgo. |
| **T2** | Cuando decidas el diseño | Bloqueado por decisión, no por trabajo. |

**Antes de empezar:** decidir T2/T4/T5, y hacer la verificación de 10 minutos de S2-F06.

---

## Lo que queda sin cubrir, y no lo tapa este plan

Del propio informe de Cowork, y sigue siendo cierto:

- **El layout mobile real (<640 px) sigue sin verse.** Es el ancho de quien escanea un QR en la calle, y **dos hallazgos de esta corrida son de teléfono medidos desde escritorio**. Nuestro `e2e/mobile-390.spec.ts` cubre parte, pero acaba de demostrar que puede pasar sobre una página que no existe.
- **Reportar mordedura → observación antirrábica** no se recorrió, y Cowork mismo lo prioriza para la próxima: es de las áreas sin spec e2e detrás.
- **El contrato de adopción imprimible sigue sin existir** — coincide con el N6 de la corrida anterior. Sigue abierto.
- **La ventana ART/UTC (21:00–00:00)** quedó programada, no perdida. Plan escrito en `S8-documentos-y-fechas.md`.
