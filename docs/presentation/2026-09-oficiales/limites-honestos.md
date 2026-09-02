# Límites honestos — lo que NO se puede afirmar frente a un funcionario

> Snapshot: `c10f4ff03` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-02
> Verified against code on 2026-09-02 by writer C (opus subagent) · Status: reviewed
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

Esta no es una ficha de diagrama: es la lista consolidada que gobierna a las
doce. Cada entrada tiene cuatro partes —la frase que alguien va a querer decir,
por qué no se sostiene, dónde está la prueba, y la formulación que **sí** es
defendible.

El criterio es uno solo: **un mecanismo que existe se puede mostrar; una
intención no.** Casi todo lo de abajo es una intención real y escrita, con plan
y con lugar en el código. Ninguna de esas cosas puede presentarse como
capacidad de hoy.

---

## A. Las cinco trampas del guion

### A.1 — El historial "no se puede modificar"

- **Frase tentadora:** "Es un registro inmutable: nadie puede alterar el
  historial de un animal."
- **Por qué no se sostiene:** solo se agregan asientos **por política y por un
  cerrojo de historial en la base de datos**, y ese cerrojo tiene una excepción
  auditada que se abre y se cierra explícitamente, atribuida a quien la abre. La supresión del
  art. 16 de la Ley 25.326 usa exactamente esa excepción para tachar datos
  personales dentro del asiento sin borrar la fila. Un sistema que necesita poder
  cumplir el art. 16 no puede ser inmutable, y ese es el diseño correcto, no una
  debilidad.
- **Fuente:** `db/migrations/0127_pet_events_append_only.sql`;
  `db/migrations/0208_subject_rights_watermarks_tag_interest_org_invitations.sql`;
  `docs/reviews/2026-09-fresh/lenses/A05.md`.
- **Lo que sí se puede decir:** "El historial es de solo agregado: una corrección
  es un asiento nuevo, nunca una edición. La única forma de tocar un asiento
  existente es la supresión que exige la ley, y queda registrada con su autor."

### A.2 — Mi Argentina

- **Frase tentadora:** "Se integra con Mi Argentina" / "la credencial es federada".
- **Por qué no se sostiene:** existe el armazón OIDC y está **apagado por
  variables de entorno ausentes**. No hay federación, no hay credencial federada
  y no hay fecha. Es la premisa arquitectónica del proyecto —ninguna decisión
  puede dañar ese camino— y eso es una cosa distinta de una función.
- **Fuente:** `lib/infra/miarg-oidc.ts`; `docs/onboarding/README.md` (recorte
  explícito de la guía del funcionario, señalado ahí como "el gap más sensible
  para outreach institucional").
- **Lo que sí se puede decir:** "El sistema está diseñado para federarse con Mi
  Argentina y esa decisión condiciona el resto de la arquitectura. La integración
  todavía no está construida; el ingreso real hoy es correo y contraseña."

### A.3 — El documento

- **Frase tentadora:** "La identidad del titular está verificada."
- **Por qué no se sostiene:** el documento es **autodeclarado**. Se guarda como
  huella criptográfica con pimienta —nunca en claro— más los últimos cuatro
  dígitos para desambiguación humana. Eso prueba que la misma persona escribió el
  mismo número dos veces. No prueba de quién es ese número. No hay verificación
  contra RENAPER y no hay proveedor elegido.
- **Fuente:** `lib/utils/dni-hash.ts`; `db/schema.ts`;
  `docs/onboarding/README.md`.
- **Lo que sí se puede decir:** "El documento nunca se almacena en claro; se
  guarda como huella criptográfica. Es un dato declarado por la persona: la
  validación contra registros estatales es parte del camino de federación y hoy
  no existe."

### A.4 — SENASA

- **Frase tentadora:** "El sistema notifica a SENASA" / "la autoridad sanitaria
  recibe el evento".
- **Por qué no se sostiene:** existe la **exportación** y existe una bandeja de
  salida que el sistema mide, pero el disparo automático hacia el organismo
  externo es trabajo pendiente. Además, el formato real de intercambio **no se
  conoce**: lo implementado responde al esquema interno alineado, y el formateador
  definitivo entra cuando llegue la especificación de homologación. El propio
  archivo lo dice en su encabezado.
- **Fuente:** `lib/analytics/senasa-export.ts`;
  `lib/analytics/senasa-export-query.ts`; `docs/onboarding/README.md`.
- **Lo que sí se puede decir:** "El sistema produce el lote de exportación
  sanitaria sobre su propio esquema alineado. El envío automático al organismo y
  la homologación del formato son trabajo pendiente."

### A.5 — Los errores del ciudadano

- **Frase tentadora:** "Monitoreamos los errores que ve el usuario."
- **Por qué no se sostiene:** el servidor sí deja rastro estructurado y
  consultable. **La web no tiene reporte de errores a ningún tercero**: el error
  muere en la pestaña del navegador. La costura técnica está terminada y espera
  una decisión que es primero legal —cualquier proveedor externo implica
  transferencia internacional de datos personales, Ley 25.326 art. 12— y después
  de precio.
- **Fuente:** `docs/architecture/client-error-sink-pending-decision.md`;
  `lib/observability/sink.ts`.
- **Lo que sí se puede decir:** "Los errores del servidor quedan registrados y
  son consultables. Los del navegador todavía no salen del dispositivo: la
  decisión de proveedor está abierta y tiene un análisis legal previo escrito."
- **Nota interna, no para la lámina:** una fila de ese documento quedó vieja. Dice
  que el teléfono no tiene reporte de fallas; era cierto el 2026-08-29 y ya no lo
  es (ver B.4).

---

## B. Privacidad — los límites declarados

Los cuatro primeros son decisiones **aceptadas y escritas** por el responsable de
producto en `docs/architecture/privacy-known-limitations.md`, cada una con sus
disparadores de reapertura. No son defectos ocultos: son el registro de lo que se
decidió no hacer.

### B.1 — KA1 y KA2: la resta sobre el mapa

- **Frase tentadora:** "Ninguna celda por debajo del umbral es recuperable."
- **Por qué no se sostiene:** la densidad provincial se publica **en crudo**
  junto al mapa con celdas suprimidas, y la supresión complementaria promueve
  exactamente una celda hermana en vez de ampliar a un intervalo. Una resta entre
  el total publicado y las celdas visibles recupera la celda oculta.
- **Por qué se aceptó:** exige un atacante motivado cruzando dos superficies
  distintas, ambas detrás de la sesión de un operador y acotadas a su
  jurisdicción —no páginas públicas—, sobre conteos agregados de eventos, no
  sobre datos personales directos. El arreglo esconde celdas legítimas.
- **Lo que sí se puede decir:** "Los agregados por localidad se suprimen por
  debajo del umbral. El registro de limitaciones documenta un camino de
  diferenciación entre dos superficies de operador, con la decisión de aceptarlo
  y los disparadores que lo reabren."

### B.2 — KA4: la ventana angosta de mortalidad

- **Frase tentadora:** "El tablero de mortalidad no puede aislar un caso."
- **Por qué no se sostiene:** una ventana temporal angosta sobre la capa de
  mortalidad puede exponer la fecha y el método de disposición de una muerte
  individual bajo una celda que por lo demás está por encima del umbral.
- **Dónde vive:** **no tiene título propio en el registro**. Está descripto
  dentro de la entrada de KA1 + KA2, y uno de los disparadores de reapertura de
  esa entrada es justamente que el deslizador de mortalidad gane granularidad más
  fina que la diaria.
- **Lo que sí se puede decir:** lo mismo que en B.1, sin prometer que la
  granularidad temporal está acotada.

### B.3 — KA5: campañas

- **Frase tentadora:** "Los datos de campañas están anonimizados."
- **Por qué no se sostiene:** la superficie de **alcance geográfico** sí está
  suprimida por umbral, con un agrupamiento de "otras localidades" por privacidad.
  La lista **por prestación** y su archivo descargable publican localidad,
  inscripción y tasa de finalización a precisión completa; multiplicar
  inscripción por finalización reconstruye la asistencia que la otra superficie
  esconde.
- **Por qué se aceptó:** se trata como dato operativo que la organización tiene
  sobre sus propias campañas en su propia jurisdicción, no como dato personal.
- **Lo que sí se puede decir:** "El alcance geográfico de una campaña está
  suprimido por umbral. El detalle por prestación se publica completo, tratado
  como dato operativo del propio organismo."

### B.4 — KA3

- **Frase tentadora:** cualquiera que empiece con "la limitación KA3…".
- **Por qué no se sostiene:** **KA3 no figura en el registro**, con ningún título
  ni dentro de otra entrada. Si aparece citada en algún material, no sale de ahí.
- **Fuente:** `docs/architecture/privacy-known-limitations.md`.
- **Lo que sí se puede decir:** nombrar KA1, KA2, KA4, KA5 y PD1, que son las
  entradas que existen.

### B.5 — PD1: el padrón sale entero

- **Frase tentadora:** "Todas las exportaciones están anonimizadas."
- **Por qué no se sostiene:** la exportación de analítica emite **fila por fila**
  —una por mascota, caso, organización y evento— y el umbral de anonimato
  simplemente no se le aplica. Un `GROUP BY` en una planilla reconstruye las
  celdas que el tablero esconde: medido el 2026-08-22, el 98 % de las celdas de
  mortalidad por localidad está por debajo del umbral. Además, las filas de
  evento comparten clave con las de mascota, así que en localidades con un solo
  animal se puede armar una línea de tiempo por animal.
- **Por qué se aceptó:** un funcionario necesita el padrón de su propio
  territorio, y un padrón con agujeros no es un padrón. La decisión fue
  **declarar en vez de suprimir**. La aceptación descansa en dos propiedades
  verificadas —todo consultor falla cerrado si no tiene jurisdicciones, y toda
  exportación deja un asiento de auditoría— y se anula si alguna deja de valer.
  El residuo está nombrado: el asiento se inserta después de subir el archivo, así
  que una caída en el medio deja un archivo descargable sin rastro.
- **Lo que sí se puede decir:** "La exportación de padrón es deliberadamente de
  nivel fila, acotada al territorio del organismo, sin identificadores directos,
  con enlace firmado y asiento de auditoría. No se le aplica supresión por umbral
  y eso está declarado por escrito."

---

## C. Lo que se recortó de las guías de usuarios externos

`docs/onboarding/README.md` es un inventario de honestidad: las capacidades que
se sacaron de cada guía por no existir todavía. Leído al revés es la lista de
pendientes del producto. Nada de esta lista puede presentarse como capacidad actual.

**De la guía del funcionario:** federación / ingreso con Mi Argentina · envío
automático de notificaciones ENO a la autoridad · derivación de denuncias a
canales estatales externos · exportación provincial del registro de perros
potencialmente peligrosos · reglas de cumplimiento legal jurisdiccionales con
nivel de exigencia y línea de base versionada · verificación de identidad contra
RENAPER · importación de padrones municipales preexistentes · capa de calor
geográfica por defunción individual.

**De la guía del veterinario:** acceso de lectura del profesional "por portal" ·
receta electrónica veterinaria · validación automática de matrícula contra el
colegio profesional · facturación, cobros y aranceles.

**De la guía del refugio:** chequeo de postulantes contra el registro de
infractores · donaciones y pagos · aviso automático al celular por defecto (la
promesa real es la campanita dentro de la aplicación).

**De la guía del dueño:** aviso automático de vacuna por vencer · semáforo de
estado sanitario · semáforo de requisitos de viaje · equivalencia legal de la
libreta digital (depende de homologación por jurisdicción) · chapita grabada
oficial (arranca apagada y se habilita por regla jurisdiccional) · Mi Argentina
como método de ingreso.

**De la guía del vecino:** mapa general de mascotas perdidas —es un listado con
filtros, no un mapa— · "mordedura" como tipo de denuncia: el formulario tiene
<!-- fact:denuncia_kinds -->9<!-- /fact --> tipos y ninguno es mordedura, que
viaja por el circuito clínico · novedades al denunciante anónimo, imposible por
diseño porque no hay canal de vuelta · derivación automática a organismos
externos.

**Lo que sí se puede decir:** "Estas guías se escribieron con la regla de que si
no se puede citar dónde vive una capacidad, no entra. El recorte está publicado."

---

## D. Hallazgos de auditoría sobre los que un funcionario puede quedar mal informado

La auditoría de 2026-09 corrió quince de treinta y seis lentes previstos y **no
ejecutó nada** —ni pruebas, ni compilación, ni consultas a la base. Fuente
general: `docs/reviews/2026-09-fresh/SYNTHESIS.md` y
`docs/reviews/2026-09-fresh/BACKLOG.md`.

### D.1 — A09-1: un correo sin confirmar puede mover la titularidad

- **Frase tentadora:** "La transferencia de titularidad exige identidad probada."
- **Por qué no se sostiene del todo:** cuando una transferencia se dirige a una
  dirección de correo que todavía no tiene cuenta, la aceptación se valida con una
  comparación de texto entre la dirección invitada y la de quien acepta, **sin
  chequear que ese correo esté confirmado**. Quien conozca la dirección podría
  registrarse con ella y quedarse con el animal.
- **Lo que acota el alcance, verificado el 2026-09-02 sobre las cuentas de la
  base de ensayo —la única base viva:** las confirmaciones **sí están
  activadas** ahí. De las cuentas existentes, una sola figura sin confirmar y
  nunca inició sesión. Es decir: para llegar a este camino hace falta una sesión
  ya confirmada, lo que baja el alcance real muy por debajo de lo que sugiere la
  lectura del código. El archivo de configuración local dice lo contrario porque
  es solo de desarrollo.
- **Estado:** decisión pendiente con el responsable de producto. Las opciones
  están escritas: exigir el correo confirmado en ese brazo, o atar la invitación
  a un secreto de un solo uso enviado a la dirección.
- **Fuente:** `src/modules/transfers/domain/owner-transfer-rules.ts:124`;
  `docs/reviews/2026-09-fresh/lenses/A09.md`; `supabase/config.toml` (solo
  desarrollo).
- **Lo que sí se puede decir:** "La transferencia de titularidad tiene dos
  brazos: por identidad de cuenta y por dirección de correo cuando el destinatario
  todavía no tiene cuenta. El segundo tiene una decisión de endurecimiento
  pendiente, y el entorno vivo exige confirmación de correo, que es lo que acota
  el riesgo hoy."

### D.2 — A02-1: la procedencia de un asiento es falsificable por la vía directa

- **Frase tentadora:** "Un evento firmado por una autoridad prueba que lo cargó
  una autoridad."
- **Por qué no se sostiene:** la política de inserción sobre el historial acota
  **de quién es el animal** y no acota las columnas de procedencia. Un titular que
  hable directo con la base puede insertar un asiento declarando rol de gobierno y
  verificado, y como al historial solo se le agregan asientos, esa falsificación
  queda. Después la consumen la credencial pública y el motor de cumplimiento.
- **Estado:** **decidido**, en cola como próxima migración, con la misma forma que
  la corrección crítica que ya se aplicó sobre los perfiles: cerrar la vía
  directa de escritura, porque los únicos escritores legítimos son la API y los
  casos de uso. La migración **todavía no está escrita**; el número se recuenta al
  escribirla, nunca se copia de un plan.
- **Fuente:** `db/migrations/0190_titular_only_rls.sql`;
  `docs/reviews/2026-09-fresh/lenses/A02.md`;
  `docs/reviews/2026-09-fresh/BACKLOG.md`.
- **Lo que sí se puede decir:** "La auditoría encontró que la procedencia de un
  asiento no está acotada en la vía directa a la base. La decisión ya está tomada
  y es la misma corrección que cerró el hallazgo crítico sobre los perfiles."

### D.3 — B02: la frontera entre las pantallas y la base es una línea de base, no un cerco

- **Frase tentadora:** "La arquitectura garantiza que ninguna pantalla escribe
  directo en la base."
- **Por qué no se sostiene:** la decisión existe y es correcta —las **escrituras**
  van solo por casos de uso, regla dura; las **lecturas** desde pantalla se
  toleran bajo una línea de base que solo puede achicarse— pero **ni el control
  automático ni el archivo de línea de base existen todavía** en esta instantánea.
  Es una unidad de trabajo en cola, no un cambio aterrizado.
- **Fuente:** `docs/reviews/2026-09-fresh/BACKLOG.md`, sección "Decidido — unidad
  SDD pendiente"; `docs/architecture/hexagonal-lite.md`.
- **Lo que sí se puede decir:** "La regla está decidida y escrita: las escrituras
  van por casos de uso y las lecturas de pantalla quedan bajo una línea de base
  que solo se achica. El control que la hace cumplir todavía no está construido."

### D.4 — El reporte de fallas del teléfono va sin filtro

- **Frase tentadora:** "Las fallas de la aplicación móvil se reportan filtradas."
- **Por qué no se sostiene:** la aplicación móvil **sí** manda fallas a un
  tercero y no tiene gancho de filtrado propio: el redactor del proyecto está
  cableado solo del lado del servidor. La opción de no enviar datos personales por
  defecto suprime dirección IP y cookies, no el texto de un mensaje ni la URL de
  una miga de pan —y el ticket de subida lleva su capacidad en la URL.
- **Alcance real:** lo que puede salir hoy es una capacidad de vida corta que el
  servidor revalida, no datos personales. Por eso es MEDIO y no ALTO.
- **Fuente:** `apps/mobile/src/observability/sentry.ts`;
  `docs/reviews/2026-09-fresh/lenses/A06.md`.
- **Lo que sí se puede decir:** "La aplicación móvil tiene reporte de fallas, con
  el envío de datos personales apagado. Falta el gancho que pase el texto por el
  redactor del proyecto, y está identificado."

### D.5 — La suite de navegador en integración continua está en rojo

- **Frase tentadora:** "Todos los controles automáticos están en verde."
- **Por qué no se sostiene:** la suite de navegador es una **compuerta aparte** —
  no está dentro de la cadena de verificación (`pnpm verify`)— y su trabajo en integración continua está en
  rojo, por dos causas distintas y ya documentadas. En el job de integración continua
  regular (`ci.yml`), la medición del 2026-08-30 es específica y vale la pena no
  redondearla: el entorno se levantó en todas las corridas medidas menos una, y
  los rojos restantes están **dentro** del paso de la suite, es decir son sus
  propias aserciones. La causa que se dejó documentada sin tocar los specs es que
  fallan sus **precondiciones**, no sus sujetos: la semilla deja la base en un
  estado distinto del que los specs buscan. Aparte, el trabajo nocturno
  (`e2e-nightly.yml`) está en rojo por una causa distinta: dos secretos que la
  suite necesita nunca se crearon en el repositorio, así que llegan vacíos al
  job.
- **Estado:** el lente que audita esa práctica quedó diferido
  (`docs/reviews/2026-09-fresh/briefs/C09.md`), y su propio texto advierte que uno
  de los archivos de limpieza cambió después de la auditoría.
- **Fuente:** `docs/agents/open-work.md`; `e2e/README.md`.
- **Lo que sí se puede decir:** "El control local —reglas de estilo, tipos, cercos
  y la suite unitaria— es la definición de terminado del proyecto y se corre en cada cambio.
  La suite de navegador es una compuerta separada y hoy está en rojo por dos causas
  identificadas y con lente asignado: precondiciones de datos de prueba en la
  corrida regular, y secretos de configuración pendientes de crear en la corrida
  nocturna."
  Hay <!-- fact:e2e_specs -->45<!-- /fact --> recorridos de navegador y
  <!-- fact:ci_workflows -->7<!-- /fact --> flujos de integración continua.

### D.6 — La aplicación Android no está en la tienda

- **Frase tentadora:** "La app está publicada en Google Play."
- **Por qué no se sostiene:** existe una compilación piloto, con personas reales
  instalándola desde el 2026-08-27, pero no es descargable por el público
  general. La versión que circula hoy y el número de compilación pendiente no
  se confirman en este documento — se los confirma el PO antes de exponerlos
  (`docs/presentation/2026-09-oficiales/00-guion.md`, notas de alcance). Además
  hay dos cosas pendientes conocidas antes de cualquier salida: una compilación
  publicada sin las variables del entorno, que se hornean al compilar, **no
  puede iniciar sesión** y hay que reemplazarla; y el formulario de seguridad de
  datos debe actualizarse antes de que llegue a la tienda cualquier compilación
  con subida de fotos, porque declaró que la app no recolecta fotos y eso deja
  de ser cierto.
- **Fuente:** `docs/agents/open-work.md`.
- **Lo que sí se puede decir:** "La aplicación Android existe como compilación
  piloto, con personas reales probándola desde fines de agosto. La publicación
  abierta tiene dos ítems pendientes identificados."

---

## E. Cómo leer el resultado de la auditoría

- **No se puede decir** "la auditoría no encontró nada" ni "el sistema pasó
  limpio". Encontró un hallazgo crítico y se cerró al día siguiente con una
  migración, confirmado por cinco revisores independientes.
- **Tampoco se puede decir** que la clase está cerrada: la misma forma —una
  política que fija la fila y no la columna— sigue abierta sobre el historial de
  la mascota (D.2).
- **No se puede presentar la cobertura como completa.** Quince de treinta y seis
  lentes corrieron. Tres de los diferidos auditan justamente la maquinaria en la
  que se apoyaron los que sí corrieron, así que los instrumentos de la auditoría
  nunca fueron auditados.
- **No se pueden promediar las dos tandas.** Un hallazgo de la tanda de seguridad
  sobrevivió a tres refutadores; uno de la tanda reducida, a uno.
- **No se puede citar una ley como verificada.** Las citas legales del código se
  confirmaron como anclas *en el código*, nunca como jurídicamente correctas o
  vigentes. Eso lo revisa un abogado, no esta auditoría.

---

Si el guion te pide un dibujo que contradice esta lista, es un defecto del guion, no una licencia.
