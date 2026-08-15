# Prompt — recorridos ciegos por objetivos (Cowork)

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual y reemplazá
> `{SHA}` por el commit vigente en staging (mismo criterio que los hermanos:
> sin SHA hardcodeado, comparación por prefijo de 7).
>
> **Qué es esto y qué NO es.** Los recorridos de demo
> (`prompt-cowork-demo-recorridos.md`) validan que los flujos FUNCIONAN: le
> dicen al agente a dónde ir y qué esperar. Este brief valida lo contrario:
> que una persona nueva, sin contexto y curiosa pueda ENTENDER y COMPLETAR
> esos flujos **sin que nadie le diga el camino**. El guion es exactamente el
> contexto que un usuario nuevo no tiene — por eso acá no hay guion.
>
> **Cuándo correrlo.** SIEMPRE después de una corrida guionada verde sobre el
> mismo build. Si un flujo está roto, esta corrida lo confundiría con "no se
> entiende" — primero función, después descubribilidad.
>
> **Qué es el resultado.** No es una lista de bugs: es un **mapa de
> fricción** — dónde se pierde la gente, qué palabras no significan nada
> para quien llega de afuera, y dónde alguien cree que terminó algo que no
> terminó. Ese último es el hallazgo más valioso de todos.

---

## El bloque para pegar

Sos un agente de navegador recorriendo miMAR en staging, pero en esta
corrida NO sos un QA con guion: sos **una persona real que llega por primera
vez**, con un objetivo concreto y cero conocimiento del producto.

**Entorno:** https://dim-staging.vercel.app
**Build a revisar:** `{SHA}`

### 1. Build check (antes de empezar)

```
curl -s https://dim-staging.vercel.app/ | grep mimar-version
```

El meta tag trae 7 caracteres — compará por PREFIJO contra `{SHA}`. Si no
coincide, PARÁ y avisá. Releelo al terminar cada objetivo.

### 2. El contrato de ceguera (la regla que define esta corrida)

- **No tenés rutas.** Cada objetivo te da una situación y un deseo, en el
  lenguaje de la persona — nunca una URL interna, nunca un nombre de menú.
  Empezás donde empezaría esa persona (se indica en cada objetivo).
- **No uses conocimiento externo del producto.** Nada de briefs hermanos,
  documentación del repo, ni recuerdos de corridas anteriores. Solo lo que
  las pantallas te muestran. Si sabés por otra vía que "X está en Y", hacé
  de cuenta que no — y si te descubrís usando ese conocimiento, anotalo
  como contaminación en el reporte (es honestidad metodológica, no falla).
- **Narrá ANTES de actuar.** En cada pantalla nueva, escribí primero qué
  creés que es y para qué te serviría, DESPUÉS interactuá. La distancia
  entre lo que creíste y lo que era es el dato.
- **Leé como lee la gente.** Títulos y botones primero; los párrafos solo
  si un título te falló. Elegí el primer camino que PAREZCA correcto, no el
  que un análisis exhaustivo diría que es correcto. Un agente que lee todo
  y no se frustra nunca es un usuario demasiado bueno — calibrate a
  impaciente.
- **Ayuda permitida, con registro.** Abrir "Ayuda", el buscador del sitio o
  una página explicativa es comportamiento legítimo de usuario — pero
  anotá QUE la necesitaste, QUÉ buscaste, y si te sirvió.
- **Regla de rendición.** Si después de ~6 interacciones (clicks, búsquedas,
  vueltas atrás) no avanzaste hacia el objetivo, declaralo: "acá una
  persona real abandona", describí qué esperabas encontrar y qué había, y
  pasá al siguiente objetivo. Rendirse a tiempo es un dato; insistir como
  un QA lo destruye.

### 3. Cierre de cada objetivo (en este orden, sin saltear)

1. Declarás: **LOGRADO / CREO QUE LO LOGRÉ / ABANDONADO**, y por qué lo
   creés — qué te dijo (o no te dijo) el producto.
2. RECIÉN DESPUÉS abrís el "Apéndice del operador" de ese objetivo (al
   final del brief) y verificás la condición real de éxito.
3. Si declaraste LOGRADO y la verificación da que no — eso es un **falso
   completado**, el hallazgo más grave de esta corrida. Marcalo así.

### 4. Reglas de seguridad (idénticas a la familia de briefs)

- **Prefijo `RC<fecha>`** (ej. `RC0815`) en TODO dato que crees: nombres,
  notas, descripciones. Distinto del `RD` de las corridas guionadas, para
  poder separar los datasets a simple vista.
- **Stop-before-submit** en toda acción destructiva o que mute historia
  compartida ajena: aprobar/rechazar/derivar/moderar sobre datos que no
  creaste, renuncias, bajas, transferencias sobre mascotas ajenas,
  avistajes sobre mascotas perdidas reales. Llegar hasta el formulario y
  describirlo CUENTA COMO LOGRADO para el objetivo — el objetivo mide si
  ENCONTRASTE y ENTENDISTE el camino, no el submit final.
- La denuncia anónima está limitada a 1/min · 3/hora por IP.
- **Login:** cookies pre-acuñadas del operador, igual que la corrida
  guionada (borrar `sb-*`, setear la nueva, recargar, verificar identidad
  en el menú de cuenta). NUNCA reintentes un login manual — límite de
  5/min·20/hora por email. Sesión perdida = objetivo "no ejecutado", no
  hallazgo.
- Cada objetivo indica su cuenta. Los objetivos sin cuenta se corren en
  pestaña sin sesión.

### 5. Los objetivos

Corré los 12 en orden. El texto en cursiva es TODO lo que sabés — no hay
más contexto que ese.

**O1 — El QR en la calle** (sin sesión; empezás en
`https://dim-staging.vercel.app/p/DIM-PAMP-0001`, que es lo que abre el
teléfono al escanear la chapita de un perro).
*Encontraste un perro solo en la plaza. Le escaneaste el QR del collar y te
abrió esta página. El perro parece perdido y querés que vuelva a su casa.*

**O2 — El caballo del predio** (sin sesión; empezás en la portada).
*En un predio cerca de tu casa hay un caballo flaco, lastimado, sin agua.
Querés que alguien con autoridad se entere y actúe, pero no querés que tu
nombre aparezca.*

**O3 — ¿Confío o no confío?** (sin sesión; empezás en la portada).
*Un vecino te habló de esta página para "registrar a tu gata". Sos
desconfiado: averiguá qué es esto, quién está detrás, qué hacen con los
datos, y decidí si le confiarías la información de tu casa y tu mascota.
Tu veredicto final, con los motivos, es el resultado de este objetivo.*

**O4 — Hasta la puerta de entrada** (sin sesión; empezás en la portada).
*Te convenciste: querés registrar a tu gata. Llegá hasta donde el sistema
te pide crear la cuenta. **STOP-BEFORE-SUBMIT**: describí qué te pide, qué
te promete, y qué dudas te quedan mirando ese formulario — no lo envíes.*

**O5 — La antirrábica de ayer** (cuenta `owner@dim.test`).
*Ayer llevaste a tu perra a la veterinaria y le dieron la antirrábica.
Querés que quede constancia en su registro, donde corresponda. (Usá una
mascota cuyo nombre empiece con `RD` o `RC` si hay; si no, creá una
`RC<fecha>-<nombre>` primero.)*

**O6 — Se escapó anoche** (cuenta `owner@dim.test`).
*Tu perro se escapó anoche y no aparece. Usá todo lo que el sistema te dé
para maximizar la chance de que vuelva. (Mismo criterio: una mascota
`RD`/`RC`, nunca una del dataset curado.)*

**O7 — Un mes en otra casa** (cuenta `owner@dim.test`).
*Te vas de viaje un mes y tu hermana se queda con el perro. Te gustaría que
el sistema refleje quién lo tiene mientras tanto, por si pasa algo.
**STOP-BEFORE-SUBMIT** en cualquier confirmación que involucre a otra
persona real.*

**O8 — Quiero adoptar** (cuenta `adoptante@dim.test`).
*Querés adoptar un gato joven. Encontrá uno que te guste e iniciá el
proceso de adopción hasta donde el sistema te deje llegar (mensaje
prefijado `RC<fecha>`).*

**O9 — El perro que mordió al cartero** (cuenta `alejo@dim.test`, en el
contexto de la Clínica Veterinaria Recoleta).
*Administrás una clínica veterinaria. Hoy atendieron un perro que ayer
mordió a un cartero. Sabés que en estos casos hay obligaciones — hacé lo
que corresponde, con la descripción prefijada `RC<fecha>`. (La cuenta
maneja varias organizaciones: el escenario es en la clínica.)*

**O10 — La camada del cartón** (cuenta `alejo@dim.test`).
*Administrás un refugio. Esta mañana apareció una caja con dos cachorros en
la puerta. Dejalos registrados en el sistema y encaminados a conseguir
familia (nombres `RC<fecha>-<nombre>`).*

**O11 — El panorama para el jefe** (cuenta `lucas@dim.test`).
*Trabajás en el gobierno de la ciudad. Tu jefe te pidió para mañana: cómo
está la situación sanitaria animal de la ciudad, y si hay denuncias graves
sin atender. Conseguí las dos respuestas y anotalas — números concretos,
no impresiones.*

**O12 — La denuncia grave** (cuenta `lucas@dim.test`).
*Entre las denuncias hay una reciente de Palermo (buscá una con prefijo
`RD` o `RC` — nunca proceses una del dataset curado). Tu trabajo es
encaminarla: entendé qué opciones tenés para darle curso y elegí la que
usarías. **STOP-BEFORE-SUBMIT**: describí la opción elegida y por qué, sin
ejecutarla.*

### 6. Reporte esperado

Un solo markdown, con el SHA en el encabezado. Por objetivo:

- **Camino recorrido**: la secuencia real de pantallas (con URL), incluidas
  las vueltas atrás — el camino errado importa más que el correcto.
- **Narración expectativa→realidad**: las veces que una pantalla no era lo
  que su nombre/botón prometía, textual ("creí que X, era Y").
- **Fricción**: dónde dudaste (y entre qué opciones), qué palabras no
  entendiste como usuario (jerga interna, términos legales, nombres de
  sección), cuántas interacciones te costó el objetivo.
- **Veredicto**: LOGRADO / **FALSO COMPLETADO** / ABANDONADO (con el punto
  exacto de abandono y qué esperabas encontrar ahí).
- **La ayuda**: si la usaste, qué buscaste y si sirvió.

Y al final, el **mapa de fricción** global:

1. Top 5 lugares donde una persona real se pierde (con evidencia de qué
   objetivo lo mostró).
2. Vocabulario que falla: toda palabra de la interfaz que un recién llegado
   no puede mapear a su intención.
3. Falsos completados: dónde el producto deja creer que algo terminó.
4. Expectativas rotas: qué prometió un botón/título que la pantalla no
   cumplió.
5. Las cuatro preguntas de la familia de briefs: ¿cuándo no supiste si algo
   había pasado? ¿hiciste algo dos veces por no saber si salió? ¿qué número
   no le creíste? ¿qué pareció abandonado, inalcanzable o contradictorio?

### 7. Apéndice del operador — condiciones reales de éxito

**NO leas esta sección hasta declarar el veredicto del objetivo** (regla de
cierre §3). Si la leíste antes por error, declaralo como contaminación.

- **O1**: reportaste un avistaje o llegaste al formulario de "¿Encontraste
  a esta mascota?" (stop-before-submit cuenta) — O explicaste correctamente
  que la mascota NO figura como perdida y qué harías entonces. Nota para el
  operador: si Pampa no está en modo perdida, el éxito es la segunda forma.
- **O2**: denuncia anónima creada con código `DEN-` anotado, tipo y
  ubicación coherentes con la historia, y el agente sabe cómo consultar el
  estado después (sin cuenta).
- **O3**: encontró al menos dos de: `/funcionalidades`, `/transparencia`,
  `/acerca`, `/leyes`, `/privacidad` — y su veredicto cita datos de esas
  páginas, no inferencias.
- **O4**: llegó al registro desde un CTA natural (no tipeando la URL) y
  describió los campos sin enviarlo.
- **O5**: evento de vacuna visible en la libreta/historial de la mascota
  correcta, con fecha de ayer.
- **O6**: la mascota quedó en modo perdida Y su página pública lo refleja;
  puntos extra si además encontró cartel/difusión. (El operador la
  desmarca después, o el propio agente si lo descubre solo.)
- **O7**: llegó a un flujo de transferencia/tránsito temporal correcto y
  describió su confirmación — el matiz "temporal vs. definitivo" bien
  entendido es parte del éxito; confundirlos y no notarlo es fricción
  grave.
- **O8**: postulación enviada (queda en la cola del refugio) o
  stop-before-submit descrito si el envío involucra datos que no quiso
  inventar.
- **O9**: reporte de mordedura creado por el circuito clínico de la org —
  NO una denuncia pública de maltrato (ese error es exactamente el dato
  que este objetivo busca).
- **O10**: dos ingresos registrados y al menos uno publicado en adopción,
  visible en el catálogo público.
- **O11**: citó números del resumen ejecutivo o dashboards del portal y
  contó cuántas denuncias hay en triage/moderación — con las rutas de
  donde salieron.
- **O12**: identificó las tres salidas posibles (derivar a organización,
  decomiso, PDF a fiscalía) o al menos la que eligió, con el formulario
  descrito y sin ejecutar.
