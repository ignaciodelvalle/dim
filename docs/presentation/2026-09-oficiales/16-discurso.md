# 16 — Discurso de la reunión con funcionarios (una hora)

> Escrito el 2026-09-14 para la reunión del 2026-09-15. Sale de `00-guion.md`,
> `15-runbook-demo.md`, `14-lo-que-necesitamos.md` y `limites-honestos.md`, más las
> correcciones medidas el 2026-09-14 (reglas de solo lectura para gobierno, base legal
> cargada solo para la antirrábica, vencimiento que no se calcula desde la regla, cola
> ENO vacía para la cuenta de CABA). Donde una fuente vieja contradice esas correcciones,
> manda este archivo.
>
> Supuesto de partida: **el público ya conoce el problema**, porque se lo presentamos
> antes. Por eso se recuerda en un minuto y se entra directo a la solución.

---

## 0. Cómo usar este archivo

- **Lo que está entre comillas angulares (`>`) se dice en voz alta.** Está escrito para
  hablarse, no para leerse palabra por palabra: si te sale con otras palabras, mejor.
- **`[MOSTRAR: …]`** dice qué poner en pantalla: una captura de
  `docs/presentation/2026-09-oficiales/assets/capturas/` o un paso de la demo en vivo
  (bloques A a D de `15-runbook-demo.md`).
- **`[SI PREGUNTAN: …]`** es una respuesta corta preparada. No la digas si nadie pregunta.
- **El reloj** de cada sección es acumulado. Si vas atrasado, recortá la sección 8
  (confianza): es la única que se puede comprimir sin perder nada que te vayan a reclamar.
  **Las secciones 9 (lo que falta) y 10 (el pedido) no se recortan nunca.**
- Antes de entrar: pestañas abiertas, sesión de `govt@dim.test` iniciada en la
  computadora, `owner@dim.test` abierta en el teléfono en la ficha de Pampa, y las
  capturas a mano como plan B universal.

| # | Sección | Minutos | Reloj |
|---|---|---|---|
| 1 | Apertura y dónde quedamos | 3 | 0:00 → 0:03 |
| 2 | La mascota es la credencial (demo A) | 6 | 0:03 → 0:09 |
| 3 | Cada actor desde su lugar | 6 | 0:09 → 0:15 |
| 4 | Qué ve el municipio (demo C) | 7 | 0:15 → 0:22 |
| 5 | Cumplimiento (demo B) | 6 | 0:22 → 0:28 |
| 6 | Extravío y denuncias | 5 | 0:28 → 0:33 |
| 7 | Vigilancia y zoonosis (bloque D) | 4 | 0:33 → 0:37 |
| 8 | Confianza: historia, privacidad, datos, permisos | 5 | 0:37 → 0:42 |
| 9 | Estado del piloto y lo que falta | 5 | 0:42 → 0:47 |
| 10 | Lo que necesitamos del Estado | 5 | 0:47 → 0:52 |
| 11 | Preguntas | 8 | 0:52 → 1:00 |
| — | Plan B si algo falla (sección 12, consulta) | — | — |

---

## 1. Apertura y dónde quedamos — 0:00 → 0:03

[MOSTRAR: `01-landing.jpg`]

> Gracias por el tiempo. La última vez hablamos del problema, así que hoy no lo vamos a
> volver a contar: lo resumo en un minuto y pasamos a lo que construimos.
>
> Dónde quedamos: un municipio no tiene hoy un instrumento para saber qué animales hay
> en su territorio, qué se les hizo, ni a quién avisar cuando aparece uno. La normativa
> le pide cosas concretas —vacunación antirrábica, observación después de una mordedura,
> atención de denuncias de maltrato— y la información para cumplirlas está repartida en
> libretas de papel, planillas y grupos de mensajería.
>
> Lo que les vamos a mostrar se llama miMAR. Es un piloto, no un registro nacional
> adoptado. Corre en un único ambiente de ensayo, y los datos que van a ver son
> sintéticos: casi la totalidad de los animales de la base son de demostración. Lo digo
> ahora para que ningún número de los que aparezcan se lea como una estadística real.
>
> La hora la organizo así: primero el sistema funcionando, en vivo; después lo que
> todavía no hace, dicho por nosotros; y al final, lo que necesitamos de ustedes para
> que lo que falta deje de faltar.

---

## 2. La mascota es la credencial — 0:03 → 0:09

[MOSTRAR: `02-credencial-publica-pampa-web.jpg`, o en vivo la pestaña
`https://www.mimar.com.ar/p/DIM-PAMP-0001`]

> La idea central es simple: el animal es la credencial. Cada mascota registrada tiene un
> código público único, y ese código abre una página que cualquiera puede verificar con
> el celular. No hace falta tener cuenta, ni instalar nada, ni saber qué es miMAR.
>
> Ella es Pampa, una caniche de Belgrano. Es nuestra mascota de demostración.

[MOSTRAR: demo A — escanear el QR de la pantalla con el teléfono, delante de ellos]

> Voy a hacer lo que haría un vecino que la encuentra en la calle: escanear el código.
> Se abre en el teléfono, sin iniciar sesión.
>
> Esto es lo que ve un vecino. No ve al dueño: ve lo que necesita para devolver al animal.

[MOSTRAR: `03-vecino-escanea-pampa-celular-1.jpg` y
`11-privacidad-credencial-sin-contacto-celular.jpg`]

> Hay un detalle que conviene mirar. Esta página dice "el dueño habilitó la libreta
> médica". En el caso de Pampa, su titular decidió mostrar un resumen sanitario. Eso es
> una elección del titular, no lo que pasa por defecto. Por defecto, escanear muestra
> identidad, no historia clínica.
>
> Y abajo lo dice la propia pantalla: esta vista no expone contacto del dueño, dirección
> ni notas privadas. El teléfono del titular aparece solamente si el titular lo habilitó
> y, además, el animal está reportado como perdido.
>
> Para quien encuentra al animal hay un botón, "¿Encontraste a esta mascota?", que
> avisa al dueño sin que el vecino tenga que registrarse.

[SI PREGUNTAN: "¿La credencial digital reemplaza a la libreta de papel?"]

> Hoy no tiene equivalencia legal con la libreta de papel: eso depende de la homologación
> en cada jurisdicción. Nuestra recomendación al titular sigue siendo conservar el papel.

[SI PREGUNTAN: "¿Y si alguien escanea miles de códigos para juntar datos?"]

> La lectura pública tiene un techo por dirección de origen, y lo que devuelve es
> justamente lo mínimo: identidad del animal, no datos de la persona.

---

## 3. Cada actor desde su lugar — 0:09 → 0:15

> El mismo sistema tiene cinco puertas: la pública que acabamos de ver, la del titular,
> la de las instituciones —clínicas y refugios—, la de la autoridad local, y la de
> administración de la plataforma. Cada una ve el mundo desde su lugar. No es el mismo
> tablero recortado: son vistas pensadas para cada rol.

[MOSTRAR: `14-app-pampa-credencial-frente.png`]

> Esto es el titular, desde la aplicación de celular. La aplicación Android está en
> prueba interna con un grupo de testers; la misma información está en la web. El
> titular ve la credencial de su animal, el código, y un resumen de cumplimiento del que
> vamos a hablar enseguida.

[MOSTRAR: `04b-veterinaria-panel-matricula-verificada.jpg`]

> Esto es una veterinaria. Arriba se ve la marca "matrícula verificada". Esa matrícula no
> se valida automáticamente contra el colegio profesional: la aprueba una persona, en la
> cola de aprobaciones de la autoridad local. Es una revisión humana, y lo decimos así.

[MOSTRAR: `04c-veterinaria-atender-pampa.jpg`]

> Cuando la veterinaria atiende a un animal, lo busca por su código y registra lo que
> hizo: una vacuna, una desparasitación, una consulta. Y la pantalla le dice con qué
> firma: su matrícula. Eso es lo que hace la diferencia entre lo que declara un dueño y
> lo que certifica un profesional. El sistema distingue las dos cosas siempre.
>
> Dos aclaraciones para que no se lleven una idea equivocada. Primero, la veterinaria no
> tiene acceso libre al historial de cualquier animal que escanea: el historial lo
> comparte el titular, con un enlace temporal que puede revocar. Segundo, no hay nada de
> cobro, aranceles ni facturación en el sistema.

[MOSTRAR: `04d-refugio-panel.jpg`]

> Y esto es un refugio. Es una organización de demostración, por eso el nombre. Ven su
> panel de trabajo: ingresos de animales, tránsitos, postulaciones de adopción,
> seguimientos. Cuando un animal sale en adopción, su historia no se corta: la misma
> credencial pasa al adoptante con todo lo que ya tenía.

---

## 4. Qué ve el municipio — 0:15 → 0:22

[MOSTRAR: demo C — `https://www.mimar.com.ar/gob` con `govt@dim.test`. Plan B:
`05-gob-briefing-caba.jpg`]

> Ahora la vista que más les interesa: la de la autoridad local. Esta cuenta es de un
> área de gobierno de la Ciudad de Buenos Aires.
>
> El mensaje de esta pantalla no es el gráfico, es el recorte. Esta cuenta ve su
> territorio asignado y nada más. Y ese recorte no es un filtro de pantalla que alguien
> pueda sacar: es una condición que se agrega adentro de cada consulta a la base de
> datos. Si alguien pide datos de otra jurisdicción, las filas vuelven igual recortadas
> a lo que tiene asignado.
>
> Hay una excepción, y prefiero decirla yo: la administración de la plataforma sí ve
> todo. Esa es la definición de ese rol, no una fuga. Y existe también un rol nacional,
> de solo lectura, que ve el país entero y no puede escribir nada.

[MOSTRAR: el bloque "Alertas priorizadas" del briefing]

> Esta es la primera pantalla con números, así que lo repito: son datos sintéticos. Lo
> que les pido que miren no es el valor, es cómo está construido cada indicador.
>
> Miren la tarjeta de cobertura antirrábica. No dice solamente un porcentaje: dice sobre
> qué población se calcula, en qué ventana de tiempo, cuál es la meta, con qué confianza,
> y si hay una obligación legal detrás, cuál. Y miren la de microchip: dice explícitamente
> "sin mandato legal argentino". Es una meta de programa, no una obligación, y el sistema
> no la presenta como lo que no es.
>
> Cada indicador declara qué cuenta antes de mostrarse. Y cuando la población es
> demasiado chica para que un porcentaje sea honesto, la pantalla lo dice en lugar de
> dibujar un número.

[SI PREGUNTAN: "¿Se puede ver por barrio?"]

> Depende de la pantalla, y conviene decirlo con precisión: por ejemplo, la lista de
> vacunación vencida agrega por localidad, no por barrio.

[SI PREGUNTAN: "¿Y el mapa?"]

> Hay un centro de situación con mapa por capas. En el ambiente de ensayo algunas capas
> no tienen datos cargados, así que hoy prefiero mostrarles el briefing, que es donde
> está la lectura priorizada.

---

## 5. Cumplimiento — 0:22 → 0:28

[MOSTRAR: `cumplimiento-gob-reglas-2-antirrabica.jpg`, o en vivo `/gob/reglas`]

> Un tema que sé que les importa: el cumplimiento de las obligaciones sanitarias.
>
> El sistema tiene cargadas las reglas que aplican a cada jurisdicción. Esta cuenta ve
> las de su territorio en modo lectura; las carga la administración nacional de la
> plataforma, con su base legal. Hoy la base legal que está cargada cubre una sola
> obligación, y es la que tiene respaldo claro: la vacunación antirrábica, obligatoria
> por la Ley Nacional 22.953, y en la Ciudad, además, por la Ordenanza 41.831, con
> refuerzo anual.

[MOSTRAR: demo B — en el teléfono, la ficha de Pampa en la sección "Cumplimiento". Plan
B: `cumplimiento-app-pampa-al-dia.png`]

> Del lado del titular, esto se traduce en una ficha. Pampa figura al día: la vacuna
> antirrábica vigente, firmada por un veterinario matriculado, con su próxima dosis. Si no
> tuviera ninguna vacuna registrada, la ficha lo diría: "sin registro".
>
> Ahora, lo que todavía no hace, para que nadie planifique sobre algo que no existe.
>
> Uno: la regla dice "refuerzo cada doce meses", pero hoy la ficha no calcula el
> vencimiento a partir de esa regla. Lo toma de la fecha de próxima dosis que registra el
> veterinario. Que el vencimiento se derive de la regla de cada jurisdicción es el
> próximo paso, y está identificado.
>
> Dos: sobre microchip y esterilización hicimos una investigación normativa con fuentes
> oficiales, y está en revisión legal. Lo que encontramos es que no hay una norma
> argentina que obligue al microchip, y que las leyes provinciales de esterilización le
> asignan la obligación al Estado, no al dueño. Por eso no las cargamos como obligaciones.
> Si alguna jurisdicción tiene una ordenanza propia, el sistema está preparado para
> cargarla con su nivel de exigencia.
>
> Y acá aparece uno de los pedidos concretos: que su equipo legal valide la base legal
> de su jurisdicción. Las citas que tenemos están confirmadas como referencias dentro del
> sistema, no como dictamen jurídico. Eso lo tiene que mirar un abogado, y preferimos que
> sea el de ustedes.

---

## 6. Extravío y denuncias — 0:28 → 0:33

[MOSTRAR: `07-mascotas-perdidas.jpg`]

> Dos circuitos de crisis.
>
> El primero, extravío. Cuando un animal se pierde, el titular lo marca como perdido y
> decide qué se publica. Aparece en este listado público, con filtros por provincia,
> especie, color y fecha. Aclaro que es un listado, no un mapa. El vecino que lo
> encuentra entra a la credencial y avisa sin tener cuenta, y todo lo que pasa en el
> medio queda escrito. Las coordenadas del último avistaje no se publican en el listado.

[MOSTRAR: `08-gob-denuncias-triage.jpg`]

> El segundo, denuncias de bienestar animal. Cualquier persona puede denunciar sin
> identificarse, y se lleva un código que prueba que la denuncia existe y cuándo la
> presentó. La denuncia entra en la bandeja de la autoridad local que corresponde por
> territorio, con la identidad del denunciante separada del contenido. Acá la ven: pasa
> por moderación, después por el triage bajo la Ley 14.346, y puede escalar a un caso
> con seguimiento formal.
>
> Tres cosas que no hace, para que no las prometan en su nombre. No deriva
> automáticamente a canales estatales externos: la denuncia queda en esta bandeja. El
> denunciante anónimo no recibe novedades, porque por diseño no hay canal de vuelta. Y
> no es un canal de urgencias: una emergencia es el 911.

[SI PREGUNTAN: "¿Una mordedura se denuncia acá?"]

> No. La mordedura no es un tipo de denuncia: viaja por el circuito clínico y abre la
> observación antirrábica, que es lo que vemos a continuación.

---

## 7. Vigilancia y zoonosis — 0:33 → 0:37

[MOSTRAR: `16-gob-vigilancia.jpg`, o en vivo `/gob/vigilancia`]

> Vigilancia epidemiológica. Esta pantalla reúne las señales de zoonosis y de
> enfermedades de notificación obligatoria dentro de su cobertura, y las observaciones
> antirrábicas abiertas. Los números, otra vez, son de demostración.
>
> Lo importante es dónde vive el ciclo legal: en el sistema, no en un PDF. La observación
> antirrábica tiene su ventana de diez días por defecto, ajustable por jurisdicción, y
> se sabe quién puede cerrarla. Las enfermedades de notificación obligatoria tienen cada
> una su plazo legal, que es fijo por enfermedad. Cuando se registra un hecho que obliga
> a notificar, la anotación de salida se escribe en la misma operación que el hecho
> clínico: no puede existir uno sin la otra.

[MOSTRAR: la lámina 16 del mazo — no abrir `/gob/outbox` en vivo: para esta cuenta la
cola está vacía]

> Y ahora lo que no hace, que es lo más importante de esta sección: esa notificación no
> sale del sistema. Queda registrada, fechada, con su plazo calculado y auditada, y ahí se
> queda. El propio producto lo dice en sus pantallas: la notificación obligatoria a
> SNVS, SENASA o zoonosis no está integrada en esta versión y hay que hacerla por los
> canales habituales. Preferimos que el sistema declare lo que no hace antes que dibujar
> una flecha hacia un organismo que no recibe nada.

[SI PREGUNTAN: "¿Un fallecimiento por una enfermedad de notificación obligatoria avisa
siempre?"]

> No siempre. Si no hay una observación antirrábica abierta en ese momento, queda un
> asiento de auditoría, pero no aparece en estas pantallas. Es un límite conocido.

---

## 8. Confianza — 0:37 → 0:42

> Cuatro ideas sobre por qué pueden confiar en lo que muestra el sistema. Las digo en
> corto.

[MOSTRAR: lámina de historia (sin captura; la libreta del dorso no se usa)]

> La primera: la historia se escribe una sola vez. Los hechos sanitarios y de custodia
> se agregan; no se editan ni se borran. Una corrección es un asiento nuevo que queda
> encima del anterior sin destruirlo. La única forma de tocar un asiento existente es la
> supresión de datos personales que exige la Ley 25.326, y esa operación queda
> registrada con su autor. No les voy a decir que es "imposible de modificar", porque la
> ley exige poder suprimir; les digo que toda modificación deja rastro.

[MOSTRAR: `11-privacidad-credencial-sin-contacto-celular.jpg`]

> La segunda: privacidad. El documento de identidad nunca se guarda en claro: se guarda
> como una huella criptográfica y los últimos cuatro dígitos. Pero es un dato que declara
> la persona; no está verificado contra ningún registro del Estado. Los datos agregados
> que se publican suprimen las celdas con menos de cinco casos. Los archivos adjuntos se
> sirven con enlaces que vencen en una hora. Y los límites que quedan están escritos, con
> quién los aceptó y qué los reabre.
>
> La tercera: hay dos salidas de datos y no son la misma cosa. El dato abierto público,
> agregado y con ese umbral. Y la exportación de padrón para el organismo, que es fila
> por fila, acotada a su territorio, sin identificadores directos, con enlace firmado y
> registro de auditoría. A esa exportación no se le aplica el umbral, porque un padrón
> con agujeros no es un padrón. Por eso no la llamamos "anonimizada".
>
> La cuarta: quién puede hacer qué. El permiso se controla dos veces: en la aplicación,
> que sabe quién es cada uno y qué territorio le toca, y en la base de datos, que aplica
> reglas fila por fila aunque la aplicación se equivoque. Y les cuento algo que prefiero
> que sepan por nosotros: una auditoría adversarial encontró un hallazgo crítico en ese
> cerrojo —un usuario podía reescribir su propio perfil, incluida la marca de
> administrador—. Lo confirmaron cinco revisores independientes y se cerró y se aplicó al
> ambiente vivo el mismo día. La misma auditoría encontró una segunda puerta de la misma
> familia, en el historial de las mascotas, y también se cerró. Mostrar la auditoría sin
> sus hallazgos no sería creíble.

[SI PREGUNTAN: "¿La auditoría fue completa?"]

> No. Corrió una parte de los análisis previstos, quince de treinta y seis, y lo decimos
> así. Y las citas legales se confirmaron como referencias en el código, no como
> dictamen jurídico.

---

## 9. Estado del piloto y lo que falta — 0:42 → 0:47

> Ahora lo que falta, dicho por nosotros antes de que lo pregunten.
>
> Lo que está construido se puede probar hoy. Lo que no, tiene nombre y motivo.
>
> Uno, Mi Argentina. El sistema está diseñado para federarse con Mi Argentina, y esa
> decisión condiciona toda la arquitectura. Pero la integración no está funcionando: el
> armazón existe y está apagado. El ingreso real hoy es con correo y contraseña. No les
> voy a dar una fecha.
>
> Dos, identidad. Como dije, el documento es declarado. No hay verificación contra
> RENAPER. Esperamos que llegue como consecuencia de Mi Argentina, no como una
> integración aparte.
>
> Tres, SENASA. Existe la exportación del lote sanitario, con una puerta de descarga para
> el funcionario autorizado, acotada a su jurisdicción y período, y auditada. No existe
> todavía el envío automático, y el formato no está homologado: no lo vamos a inventar.
>
> Cuatro, las notificaciones obligatorias: como vimos, se registran y no salen.
>
> Cinco, protección de datos. El acceso y la supresión que prevé la Ley 25.326 están
> implementados, también desde el celular. La rectificación todavía no. Y la política de
> cuánto tiempo se conservan los datos está pendiente de una decisión legal.
>
> Seis, el ambiente. Hay uno solo, de ensayo. No hay producción separada todavía, y los
> datos que vieron son sintéticos.
>
> Siete, la aplicación Android está en prueba interna con un grupo de testers. No es
> descargable por el público general.
>
> Y ocho, no hay importador de padrones municipales existentes: el territorio arranca
> de cero.

---

## 10. Lo que necesitamos del Estado — 0:47 → 0:52

[MOSTRAR: lámina de cierre con los pedidos — sale de `14-lo-que-necesitamos.md`]

> Termino con lo que venimos a pedir. No es colaboración en general: son pedidos
> concretos, y por cada uno les digo qué está esperando y qué no funciona hasta que llegue.
>
> El primero, y el que más destraba: Mi Argentina. Necesitamos la autorización para ser
> parte confiante, las credenciales de cliente y la configuración del proveedor. Es un
> convenio, una firma, no un desarrollo: del lado nuestro está todo construido esperando.
> Hasta que llegue, el documento lo escribe la persona y nadie lo verifica, y la
> habilitación de un veterinario o el cierre de una adopción confían en un número que
> alguien tipeó. Es el pedido del que dependen los demás.
>
> El segundo: la dirección donde recibir las notificaciones obligatorias —a dónde
> enviar, cómo autenticarnos y qué formato mandar—. La cola está construida; lo que falta
> es el destino. No vamos a construir el emisor antes de tener la especificación.
>
> El tercero, y el que se puede resolver hoy mismo: quién recibe, jurisdicción por
> jurisdicción. Una lista con el correo institucional del área y las localidades que
> cubre. Sin eso, un aviso interno se genera correctamente y no lo lee nadie.
>
> El cuarto: el formato homologado del lote de SENASA, y las especificaciones de las
> resoluciones de certificado antirrábico para traslado y de receta electrónica
> veterinaria.
>
> El quinto: cómo se presenta una inscripción en el registro bonaerense de perros
> potencialmente peligrosos.
>
> Y el sexto, que no bloquea nada: si quieren que el sistema viva bajo un dominio del
> Estado, la delegación.
>
> Sumo uno que salió de lo que vimos hoy: que su equipo legal valide la base legal de su
> jurisdicción.
>
> Y para que quede claro lo que no pedimos: no pedimos acceso a RENAPER, no pedimos datos
> de personas y no pedimos financiamiento.
>
> Les propongo un próximo paso concreto. Hoy, la lista del punto tres para las
> jurisdicciones que quieran incorporar, con un contacto técnico. En paralelo, un
> contacto para iniciar el camino del convenio con Mi Argentina y otro de su área legal
> para revisar la base normativa. Y una reunión técnica de seguimiento con esas personas,
> en la fecha que ustedes definan.
>
> Gracias. Quedamos a disposición para las preguntas.

---

## 11. Preguntas probables — 0:52 → 1:00

**"¿Esto es producción?"**
> No. Es el único ambiente, de ensayo, con datos de demostración. La separación de un
> ambiente productivo es parte de lo que resolvemos antes de una salida real.

**"¿Los números que mostraron son reales?"**
> No. Casi la totalidad de los animales de la base son sintéticos. Lo que mostramos es
> cómo se construye y se lee cada indicador, no un diagnóstico de la Ciudad.

**"¿Está integrado con Mi Argentina?"**
> No todavía. Está diseñado para eso y es el primer pedido: del lado nuestro el camino
> está construido y apagado; falta el convenio y las credenciales.

**"¿El DNI está verificado?"**
> No. Lo declara la persona y se guarda cifrado. La verificación llega con la federación.

**"¿SENASA recibe la información automáticamente?"**
> No. Existe la exportación del lote, acotada y auditada. El envío automático y la
> homologación del formato están pendientes, y no vamos a inventar el formato.

**"¿El municipio puede cargar sus propias reglas?"**
> Hoy la autoridad local las ve para su territorio; las carga la administración nacional
> con su base legal. Si su jurisdicción tiene una ordenanza propia, se incorpora por ese
> camino, y por eso les pedimos que la validen.

**"¿El microchip es obligatorio?"**
> La investigación normativa que hicimos, en revisión legal, no encontró una norma
> argentina que lo exija. Por eso el sistema lo mide como meta de programa y lo dice en
> pantalla.

**"¿El sistema vence la antirrábica según la regla?"**
> Todavía no. Hoy toma la fecha de próxima dosis que registra el veterinario. Calcularlo
> desde la regla de cada jurisdicción es el próximo paso.

**"¿Qué pasa con los datos personales?"**
> El documento nunca en claro, agregados con umbral, exportación de padrón acotada y
> auditada. Acceso y supresión están implementados; rectificación y política de
> retención están pendientes y lo decimos.

**"¿Cuánto cuesta?"**
> Hoy no pedimos financiamiento. Lo que necesitamos son autorizaciones, especificaciones
> y contactos.

**"¿La app está en Google Play?"**
> Está en prueba interna con un grupo de testers; no es descargable por el público
> general.

**"¿Quién ve todo el país?"**
> La administración de la plataforma, por definición de ese rol, y un rol nacional de
> solo lectura que no escribe nada.

---

## 12. Plan B si algo falla en vivo

No arregles nada en la sala: pasá al plan B y seguí hablando (`15-runbook-demo.md`,
"Regla de oro" y §4).

| Qué falla | Qué hacés |
|---|---|
| El QR no escanea | Abrí la dirección a mano en el teléfono (`www.mimar.com.ar/p/DIM-PAMP-0001`) y decí "hoy lo abro escribiendo la dirección". Runbook §4.1. |
| La credencial de Pampa no carga | `02-credencial-publica-pampa-web.jpg` y `03-vecino-escanea-pampa-celular-1.jpg`. Decí que es una captura. |
| El teléfono no abre la app o no tiene sesión | `14-app-pampa-credencial-frente.png` y `cumplimiento-app-pampa-al-dia.png`; o la web con `owner@dim.test`. |
| `/gob` no entra o rebota | `05-gob-briefing-caba.jpg`. Runbook §4.2 (no se arregla desde el navegador). |
| Panorama tarda o sale vacío | No lo abras; quedate en el briefing. |
| `/gob/reglas` no carga | `cumplimiento-gob-reglas-1.jpg` y `cumplimiento-gob-reglas-2-antirrabica.jpg`. |
| Vigilancia no carga | `16-gob-vigilancia.jpg`. |
| Se cae todo el ambiente | Capturas en orden, diciendo "el ambiente de ensayo no responde ahora". Runbook §4.6. |

**No abrir en vivo:** `/adoptar` (muestra una mascota de pruebas automáticas y tarjetas
sin foto), `/gob/outbox` con la cuenta de CABA (cola vacía), la cara "libreta" de la
ficha (muestra "Vacunación: sin aplicar" junto a la antirrábica al día), y la lista de
mascotas de `owner@dim.test` (arranca con mascotas de prueba): entrá directo a Pampa.
