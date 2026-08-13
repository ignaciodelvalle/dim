# Prompt — clickthrough de verificación + territorio nuevo (Cowork)

> **Cómo usar este archivo.** Copiá el bloque de abajo y reemplazá `{SHA}` por el
> commit a revisar. El SHA no está escrito acá a propósito: un documento con un
> commit hardcodeado miente al día siguiente.
>
> **Esta pasada tiene DOS mitades y no se mezclan.** La parte A verifica arreglos
> concretos, con un resultado esperado escrito de antemano. La parte B explora
> lo que nadie recorrió. Se hacen en ese orden y se informan por separado.

---

## Por qué la parte A va primero, y por qué está escrita así

La corrida TN0813 (2026-08-13) trajo 10 hallazgos "reales". Al verificarlos
contra el código y la base: **5 eran falsos positivos y 3 de los 5 restantes
tenían otra causa que la reportada.** No fue culpa del agente — un agente sin
código reporta síntomas honestos, y el síntoma casi nunca está donde está la
causa. Pero se puede hacer mejor, y estas son las tres reglas que salieron de
ahí:

1. **Probá cada guard con el rol que la página espera.** Cuatro de los cinco
   falsos positivos fueron 404 correctos: la página de check-in es del
   ADOPTANTE y se probó con el dueño; `buscar-hogar` es del tránsito y se probó
   con el dueño; `/cuenta/renunciar` exige rol veterinario y se probó con un
   admin de organización.
2. **No visites una ruta de estado después de haber cambiado vos ese estado.**
   El quinto falso positivo fue `/admin/observaciones/[token]` → 404, porque el
   propio agente había cerrado esa observación un rato antes. La ruta exige
   observación en curso.
3. **Un número solo no es un hallazgo hasta que sabés contra qué compararlo.**
   Se reportó "los slots no existían": había **688 turnos futuros** y el
   horizonte es de 60 días.

La parte A está escrita con el **resultado esperado a la vista** justamente para
que no haga falta adivinar. Si algo no coincide, eso sí es un hallazgo — y uno
caro, porque significa que un arreglo verificado no funcionó en el navegador.

---

## El bloque para pegar

Sos un agente de QA validando miMAR en staging. Trabajás solo, con un navegador, en serie.

**Entorno:** https://dim-staging.vercel.app
**Build a revisar:** `{SHA}`

Antes de escribir una línea de informe:

```
curl -s https://dim-staging.vercel.app/ | grep mimar-version
```

Escribí ese SHA en el encabezado. Si no coincide con `{SHA}`, pará y avisá.
Volvé a leerlo al terminar: si cambió a mitad de corrida, decilo.

**Qué es esto.** Credencial sanitaria digital para animales de Argentina. La
mascota ES la credencial: cada animal tiene un token público (`DIM-XXXX-XXXX`)
que resuelve a una página verificable por QR que puede abrir cualquier
desconocido en la calle. Cinco roles ven el mismo hecho distinto: ciudadano
dueño, refugio, veterinario matriculado, gobierno (acotado por jurisdicción) y
admin. Los eventos son append-only. UI en español rioplatense.

**Cuentas:** owner@, noeli@, graciela@, alejo@, lilian@, lucas@, admin@dim.test —
password `Test1234!`. Roles descubiertos en la corrida anterior: **alejo@** es
admin de 4 organizaciones · **lilian@** es veterinaria de planta · **lucas@** es
gobierno con 5 localidades de CABA · **graciela@** y **noeli@** son ciudadanas.

**Tres reglas de método, antes de empezar:**

- **Cada guard, con el rol que la página espera.** Si una ruta te da 404, antes
  de anotarlo preguntate con qué cuenta debería abrirse. Un 404 correcto no es
  un hallazgo; "no encontré desde dónde se llega" sí lo es, y es distinto.
- **No visites una ruta de estado después de cambiar vos ese estado.** Si
  cerraste una observación, la pantalla de cierre va a decir que no hay nada que
  cerrar. Es correcto.
- **Antes de afirmar que algo falta, decí contra qué lo comparaste.** "Cero
  turnos" sin decir en qué día y con qué horizonte no se puede accionar.

---

# PARTE A — verificar arreglos (con resultado esperado)

Cada punto dice qué tiene que pasar. Marcá **COINCIDE** o **NO COINCIDE**, y si
no coincide, todo lo de siempre: URL, hora, cuenta, cómo reproducirlo.

**A1 · Buscar turno de vacunación antirrábica en Recoleta, CABA.**
Antes: "sin servicios", aunque la campaña existía con ~16 turnos por día.
Esperado: **aparece la campaña**. Estaba tageada a *toda CABA* y el buscador
comparaba la localidad con igualdad exacta, así que ningún barrio la alcanzaba.
Probá también **Palermo** y algún otro barrio: una campaña de provincia entera
tiene que aparecer desde cualquiera de ellos.

**A2 · Mirá la etiqueta de esa campaña en su página.**
Antes decía la localidad de la ORGANIZACIÓN (Recoleta) mientras el buscador
filtraba por la de la OFERTA. Esperado: **la etiqueta nombra un lugar que, si lo
tipeás en el buscador, te devuelve esa misma campaña.** Ese es el test: leer y
tipear tienen que cerrar.

**A3 · Reservá un turno y volvé a reservar el mismo, para la misma mascota.**
Antes: entraban las dos, sin aviso, comiendo cupo de campaña.
Esperado: **el segundo intento es rechazado** con un mensaje en castellano.
Cancelá el turno y reservá de nuevo el mismo: **eso sí tiene que funcionar**
(arrepentirse y volver a reservar es legítimo).

**A4 · Cargá una mascota nueva y mirá el campo Raza.**
Antes: texto libre. Esperado: **una lista de la que elegís**, sin poder tipear.
Elegí una raza PPP (por ejemplo *Pit Bull Terrier*) y confirmá que aparece el
aviso de raza potencialmente peligrosa. Elegí *Beagle* y confirmá que desaparece.

**A5 · Abrí una mascota que YA tenía raza cargada y editala.**
Esto es lo delicado del cambio: **la raza que ya estaba tiene que seguir ahí y
seguir seleccionada.** Si el campo aparece vacío, PARÁ y reportalo como grave —
significa que guardar le borra la raza a esa mascota.

**A6 · Como refugio, proponele un tránsito a una voluntaria. Después entrá con
la cuenta de ella y mirá la campanita.**
Antes: la notificación existía pero nacía en el rango más bajo y se hundía
debajo de avisos de una semana atrás.
Esperado: **la propuesta aparece arriba**, entre las que piden atención. Es una
propuesta que vence a los 7 días; tiene que competir con lo urgente, no con lo
informativo.

**A7 · Cargá un evento de embarazo y mirá el historial.**
Antes se leía "Información clínica · pregnancy". Esperado: **"Embarazo"**, en
castellano.

**A8 · Como organización, entrá a reportar maltrato.**
Antes el encabezado exigía "mínimo 1 archivo" y el campo decía "opcional".
Esperado: **el campo dice que es obligatorio**, coherente con el encabezado y
con lo que el servidor efectivamente exige.

**A9 · `/mis-mascotas/[token]/eventos/nuevo/checkin` con la cuenta del DUEÑO.**
Esperado: **404, y está bien.** Esa página es del ADOPTANTE de una mascota
adoptada, no del dueño. La pregunta real, y lo que sí queremos que averigües:
**entrando como adoptante, ¿hay algún link que lleve ahí?** Si no lo hay, eso es
el hallazgo — la organización ve check-ins pendientes y el que tiene que
reportarlos no encuentra la pantalla.

**A10 · `/cuenta/renunciar` con `lilian@` (veterinaria) y con `alejo@` (admin de
organizaciones).**
Esperado: **con lilian@ abre el flujo; con alejo@ redirige.** No es una ruta
rota: exige rol veterinario. Llegá hasta la confirmación con lilian@,
describila y **cancelá** — no ejecutes la baja.

---

# PARTE B — territorio que nadie recorrió

Recién cuando termines la parte A. El apéndice de
`docs/agents/prompt-cowork-clickthrough-territorio-nuevo.md` tiene las 115 rutas
que ningún guion ni spec nombró nunca; la corrida TN0813 cubrió una parte. Estos
cinco bloques son lo que quedó sin ejecutar, ordenados por cuánto duele:

1. **Colisión de microchip.** `/mis-mascotas/nueva/match/[token]` y
   `/org/[t]/intake/match/[token]`. Requiere fabricar el caso: cargá una mascota
   con un chip, después ingresá por intake OTRA con el mismo número. Es corto y
   jugoso: dos personas reclamando al mismo animal es el conflicto más caro que
   este producto puede tener.
2. **Perdida → avistaje → encontrada, el circuito entero.** Marcá una mascota
   como perdida (usá una que crees vos), publicá el cartel, reportá un avistaje
   desde `/p/[token]/sighting` **sin sesión iniciada**, y cerrá el episodio. La
   corrida anterior sólo vio el guard.
3. **Denuncia de maltrato, envío completo.** El formulario se probó; el envío
   no, porque la subida de archivo resistió la automatización. Hacelo a mano:
   enviala, verificá que aparece en "Emitidos", mirá qué ve gobierno en
   moderación, y probá la derivación gob → organización hasta "Recibidos".
4. **Los ocho tipos de regla jurisdiccional que faltan.** Se probó lista de
   razas PPP. Quedan: umbral de peso, atestación requerida, canales de credencial
   física, microchip obligatorio, ventana de observación antirrábica, ventana de
   'próximo a vencer', ventana de recordatorios, umbral de estadía, formato de
   export MPF. Para cada una: crearla y **verificar que cambia algo visible** en
   una mascota de esa jurisdicción. Una regla que no mueve nada es peor que no
   tenerla.
5. **Disputas de custodia.** `/gob/disputas/[token]` quedó sin ejecutar porque no
   había ninguna. Averiguá desde dónde se genera una y caminá el flujo.

---

**Reglas de la casa:**

- Prefijá TODO lo que crees con un identificador de corrida propio. Es
  append-only: lo que crees queda.
- No borres ni modifiques datos que no hayas creado vos.
- Separá OBSERVACIÓN de HIPÓTESIS. No tenés el código: toda causa tuya es
  conjetura y tiene que decir que lo es.
- Listá lo que miraste y FUNCIONÓ, con el método. Sin eso, "no encontré nada" y
  "no miré" se escriben igual.
- Cada hallazgo: dónde, URL, hora, cuenta, cómo reproducirlo, y cuánto te frenó
  (me molestó / dudé / me trabó).
- **Pantalla vacía no es pantalla probada.** Si una lista sale sin datos, decilo
  y contá si intentaste crear el dato que faltaba.

**Presupuesto.** La parte A es corta y es obligatoria: si te quedás sin margen,
que sea en la parte B. Listá aparte cada punto que no ejecutaste.

**Cinco lentes:** claridad · unificación · seguimiento ("si cierro el navegador y
vuelvo mañana, ¿desde dónde me entero?") · consistencia entre roles · confianza
en los números.

**Preguntas de cierre, obligatorias:** ¿en qué momento no supiste si algo había
pasado? ¿hiciste algo dos veces por no saber si salió? ¿hubo algún número que no
le creíste? ¿qué pareció abandonado, inalcanzable o contradictorio?

**Entregable:** un solo markdown con el SHA en el encabezado, **la parte A y la
parte B en secciones separadas**, y la lista de lo no ejecutado al final. En la
parte A, cada punto con COINCIDE / NO COINCIDE.
