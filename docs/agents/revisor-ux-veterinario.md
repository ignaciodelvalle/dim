# Revisión de UX — un día de trabajo de un veterinario de clínica

> **Para el revisor externo.** No sos un tester de QA: no venimos a que encuentres botones rotos. Venimos a que nos digas si **este producto se puede usar en una jornada real de consultorio**, y dónde te hace perder tiempo, dudar o desconfiar.
>
> **Entorno:** https://dim-staging.vercel.app · **Cuenta:** te la pasamos aparte · **Duración sugerida:** 60-90 minutos.

---

## Quién sos hoy

Sos **veterinario/a de una clínica chica** en La Matanza, provincia de Buenos Aires. Atendés con turno y también por demanda espontánea. Tenés matrícula. La clínica está registrada en miMAR y vos sos su administrador.

Tu día tiene cuatro momentos, y son los cuatro que queremos que recorras:

1. **Abrís la clínica** y mirás qué tenés hoy.
2. **Publicás un servicio nuevo** porque arranca una campaña.
3. **Atendés**: un turno agendado y un walk-in sin turno.
4. **Cerrás**: revisás qué quedó registrado y si un dueño se enteró.

---

## Reglas del recorrido

1. **Andá por donde te lleve la interfaz.** Si te perdés, ESO es el hallazgo. No busques la URL correcta: anotá dónde te perdiste.
2. **Pensá en voz alta y escribilo.** "Acá dudé", "esperaba que pasara X", "no sé si se guardó" valen más que "el botón no anda".
3. **Cronometrá lo que te resulte lento.** No hace falta precisión: "esto tardó una eternidad" con el paso anotado alcanza.
4. **Si algo te da desconfianza, decilo aunque funcione.** Un número que no entendés de dónde sale es un problema, aunque sea correcto.
5. **No hace falta que completes todo.** Si un flujo no cierra, anotá dónde se cortó y seguí con el siguiente momento.

---

## Momento 1 — Abrís la clínica

Entrás a la mañana. Todavía no atendiste a nadie.

- ¿Qué ves primero? ¿Es lo que necesitás ver a esa hora?
- ¿Podés saber **cuántos turnos tenés hoy** sin buscar?
- ¿Hay algo que te reclame atención? ¿Entendés por qué?

> **Lo que nos importa:** si la primera pantalla te orienta o te obliga a ir a buscar.

## Momento 2 — Publicás un servicio

Arranca una campaña de antirrábica. Querés que la gente pueda sacar turno.

- Publicá el servicio.
- Definí **cuándo atendés** (días y horario).
- Hacé que aparezcan turnos disponibles.

> **Lo que nos importa:** cuántos pasos son, si en algún momento no sabés qué sigue, y —sobre todo— **si en algún punto tenés que esperar a que otro apruebe algo**. Si eso pasa: ¿te queda claro que estás esperando? ¿Sabés a quién?

## Momento 3 — Atendés

**3a. Un turno agendado.** Buscá el turno del día y registrá la atención.

**3b. Un walk-in.** Llega alguien sin turno, con su mascota. Registrá lo que hiciste (una vacuna, un microchip, lo que la interfaz te ofrezca).

- ¿Cuál de los dos caminos es más rápido? ¿Es el que debería serlo?
- Cuando firmás algo con tu matrícula, ¿te queda claro **qué estás firmando** y que queda a tu nombre?

> **Lo que nos importa:** el walk-in es el caso real más frecuente en una clínica chica. Si es más lento que el turno agendado, queremos saberlo.

## Momento 4 — Cerrás el día

- ¿Podés ver lo que registraste hoy?
- El dueño de la mascota que atendiste, **¿se enteró?** ¿Podés confirmarlo desde tu lado?
- Si te equivocaste en algo, ¿ves cómo corregirlo? (No hace falta que lo hagas: alcanza con que nos digas si lo encontrarías.)

> **Lo que nos importa:** si el producto te deja cerrar el día con la sensación de que quedó todo asentado.

---

## Lo que NO es un hallazgo

Para que no gastes tiempo en cosas que ya sabemos:

- **Los tableros de Panorama y Padrón corren sobre un cubo nocturno.** No se mueven en vivo. Si registrás algo hoy, ahí no aparece hoy.
- **Los datos de la base son de prueba.** Nombres raros, mascotas con datos incompletos, cantidades poco realistas: es siembra, no producto.
- **Las alertas se disparan por un cron diario**, no al instante.
- **La tasa de reunificación de la pantalla de perdidas** corre sobre muy pocos casos y no es representativa.
- **El mapa provincial puede mostrar pocas burbujas o ninguna**: hay supresión por privacidad cuando los números son chicos.

Si algo de esto te parece mal comunicado **en la pantalla**, eso SÍ es un hallazgo — la diferencia es entre "el dato está mal" (no) y "la pantalla no me avisa que el dato es viejo" (sí).

---

## Cómo queremos el informe

Por momento (1 a 4), y para cada cosa que anotes:

| Campo | |
|---|---|
| **Dónde** | La pantalla, como la nombrarías vos |
| **Qué esperabas** | |
| **Qué pasó** | |
| **Cuánto te frenó** | *me trabó · dudé unos segundos · sólo me molestó* |

Y al final, tres preguntas:

1. **¿Usarías esto en tu consultorio?** Si no, ¿qué falta?
2. **¿Qué fue lo más molesto de todo el recorrido?**
3. **¿Hubo algún momento en que no confiaste en lo que la pantalla decía?**

> La 3 es la que más nos importa. Un producto sanitario que no se cree no se usa, aunque funcione.
