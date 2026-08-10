# Master test — el sistema entero, hasta sus extremos

> **Para Cowork. Autónomo de punta a punta: nadie te va a desbloquear.**
>
> **Entorno:** https://dim-staging.vercel.app · **Prefijo obligatorio:** `CIU-` · **Duración esperada: larga.** Es a propósito.

---

## 0. Qué es esto y qué NO es

No es un recorrido de flujos. Es la construcción de **una historia con años adentro**, hecha por siete personas que se esperan entre sí, sobre un sistema que primero hay que **configurar**.

Tres cosas lo separan de un clickthrough:

1. **Empieza por la configuración, no por el uso.** Un sistema sin reglas cargadas no es el sistema: es su default. La primera fase es de administración.
2. **Los animales tienen pasado.** No alcanza con registrar una mascota y vacunarla hoy. Se cargan eventos **con fechas viejas**, para que existan libretas con años de historia y las proyecciones tengan de dónde agarrarse.
3. **Se busca el borde, no el camino feliz.** Estados terminales, límites, cosas que se rompen. Si algo tiene un tope, hay que tocarlo.

**Todo lo que crees queda.** Es material histórico para las revisiones que vienen — no lo borres al final.

## 0.1 El encuadre: los hechos pasan afuera, vos los anotás

Esto es lo más importante del documento y es fácil de perder de vista.

**No estás ejecutando un formulario. Estás siendo una persona a la que le pasaron cosas.**

A Rocco no "se le marca perdido": Rocco **se escapó el martes a la tarde** y su dueño, esa noche, agarra el celular y trata de avisar. La mordedura **ocurrió en una plaza**, y Noelí la reporta al día siguiente porque antes fue al médico. La vacuna **se dio en el consultorio**, y la veterinaria la firma después de aplicarla.

De ahí salen tres consecuencias prácticas:

1. **Cargá los hechos con la fecha en que ocurrieron**, no con la de hoy, cuando el formulario te lo permita. Una libreta real tiene fechas del pasado.
2. **Entrá por donde entraría esa persona.** Si a Graciela le llega un aviso, seguí el aviso. No vayas a la URL directa porque sabés cuál es: si no la encontrás navegando, **eso es el hallazgo**.
3. **Si dudarías, anotá que dudaste.** No busques la manera correcta de hacerlo hasta encontrarla y después reportar "OK". La primera reacción es el dato.

> Regla operativa: **si tuviste que adivinar dónde estaba algo, escribilo**, aunque después lo hayas encontrado.

## 0.2 Las cinco lentes — qué estamos midiendo en realidad

Los hitos de abajo son la excusa. **Esto es lo que buscamos.** En cada hito, además de "salió / no salió", pasá el resultado por estas cinco lentes. Cada hallazgo debe decir cuál lente lo detectó.

### L1 — Claridad: ¿se entiende sin que nadie te explique?

Para cada pantalla nueva, antes de tocar nada, respondé en una línea: **"esta pantalla es para ______ y lo próximo que tengo que hacer es ______"**. Si no podés, el hallazgo es la pantalla, no vos. Reportá también cuando **el nombre no coincide con lo que hace**, o cuando dos cosas distintas se llaman igual.

### L2 — Unificación: ¿el dato está donde lo buscás, o hay que ir a juntarlo?

Contá los **saltos**. "¿Está vacunado?" debería costar cero o un salto desde donde estás parado. Si para armar una respuesta simple tuviste que abrir tres pantallas y acordarte de la primera, **eso es el hallazgo** — y decí cuál era el dato y cuántos saltos costó.

También: cuando el mismo dato aparece en dos lugares, ¿está escrito igual? Una fecha como `05/08/2026` en una pantalla y `5 de agosto` en otra no es un error, pero sí es fricción — anotala.

### L3 — Seguimiento: ¿podés saber qué tenés abierto y a qué estás esperando?

Ésta es la más importante y la más fácil de que falle. Después de cada vuelta de rotación, con cada persona, preguntate:

> **"Si cierro el navegador ahora y vuelvo mañana, ¿desde dónde me entero de en qué quedó cada cosa que empecé?"**

Y en concreto:
- ¿Hay **un solo lugar** donde ves todo lo tuyo pendiente, o tenés que acordarte de mirar cinco pantallas?
- Lo que está esperando por **otra persona**, ¿se distingue de lo que espera por vos?
- Cuando algo avanzó mientras no mirabas, ¿**te enteraste**, o lo descubriste porque fuiste a buscarlo?
- ¿Se puede saber **hace cuánto** está esperando?

### L4 — Consistencia multi-rol y multi-pantalla: ¿todos ven el mismo estado?

**El protocolo:** cada vez que un hito cambia el estado de un caso, hacé un **corte transversal** antes de seguir. Mirá ese mismo caso desde **todos los roles que pueden verlo** y anotá qué dice cada uno:

```
[CORTE] <id del hito> — <el caso>
  dueño (<cuenta>)  →  "<lo que dice la pantalla, textual>"
  organización      →  "<...>"
  gobierno          →  "<...>"
  credencial /p/    →  "<...>"
  ¿Coinciden?       sí | no — <en qué difieren>
```

Una fila puede ser **`no aplica por diseño`**, y eso no es un hallazgo. El caso claro: una vacuna individual **no tiene vista de gobierno** — el funcionario ve agregados sobre el cubo nocturno, no eventos sueltos. Escribí `no aplica por diseño` y seguí. Lo que sí sería hallazgo es que una vista prometa mostrarlo y no lo muestre.

Diferencias **legítimas**: cada rol ve distinto nivel de detalle, y hay datos ocultos por privacidad a propósito. Eso no es hallazgo.

Diferencia que **SÍ es hallazgo**: los tres dicen algo distinto **sobre el mismo hecho**. Que para el dueño esté "aprobado", para la organización "pendiente" y el gobierno no lo vea — eso es lo que venimos a buscar.

Hacé al menos un `[CORTE]` en cada uno de estos momentos: una adopción aprobada, una mordedura reportada, una mascota marcada como perdida y después encontrada, una vacuna aplicada, un traspaso de titularidad.

### L5 — Confianza: ¿le creés a lo que la pantalla afirma?

Una pantalla que carga no es una pantalla correcta. Cuando veas un número, un estado o un "última actualización", preguntate si **podés verificarlo con algo que vos mismo hiciste**. Si un contador dice 12 y vos creaste 3, ¿cierra? Si dice "actualizado recién" pero vos sabés que el dato es de anoche, **eso es hallazgo**, aunque el número esté bien.

---

**En el informe final, un párrafo por lente.** No una lista de bugs: tu opinión, con los hitos que la sostienen.

---

## 1. Cómo se ejecuta

Cowork es **un** navegador y trabaja **en serie**. No hay paralelismo, y no hace falta: lo que se pide es **rotación**.

**El ciclo:** tomás una persona, avanzás su línea hasta que quede **bloqueada esperando a otro**, anotás qué espera, cerrás sesión, pasás a la siguiente. Al volver a esa persona, **lo primero es verificar si su espera se resolvió**.

Orden de rotación, siempre completo aunque alguien no tenga nada nuevo:

```
Lucas (gob) → Ignacio → Noelí → Graciela → Alejo (instituciones) → Lilian (vet) → volver
```

**Por qué la vuelta completa y no "seguir al que pueda avanzar":** si perseguís al desbloqueado, terminás haciendo los dos lados de cada circuito seguidos y esto se vuelve el clickthrough que ya tenemos. **La vuelta completa es lo que fuerza la espera real** — que es lo único que un usuario vive todo el tiempo y ningún test nuestro prueba.

> **Rate limit real: 5 logins/min por email, 10/min por IP.** Una vuelta son 6 logins, **pero los `[CORTE]` no están contados ahí**: cada corte re-loguea hasta 3 cuentas, y suele caer justo después del hito, o sea volviendo a una cuenta que acabás de dejar. La corrida completa ronda los **55 logins** con ráfagas peores que una vuelta. Espaciá los cortes del hito que los motiva; si te bloquea, esperá dos minutos y no insistas.

---

## 2. El elenco

Personas que **ya existen** en la base. Todas con `Test1234!`. Si alguna no existe, **no la inventes**: anotalo como hallazgo y seguí.

| Persona | Cuenta | Rol en la historia |
|---|---|---|
| **Administración miMAR** | `admin@dim.test` | Configura el sistema. Fase 1 completa |
| **Lucas Etcheverry** | `lucas@dim.test` | Funcionario. Vigila y tría |
| **Ignacio del Valle** | `owner@dim.test` | Dueño. Línea del perdido y del viaje |
| **Noelí Assandri** | `noeli@dim.test` | Dueña y tránsito. Línea zoonótica |
| **Graciela Saavedra** | `graciela@dim.test` | Dueña. Línea de la adopción y la denuncia |
| **Alejo Caride** | `alejo@dim.test` | Refugio + clínica. Contraparte de todos |
| **Dra. Lilian Marrone** | `lilian@dim.test` | Veterinaria matriculada. Firma |

Las siete cuentas fueron verificadas en staging el 2026-08-09: existen, están
confirmadas, sin bloqueos, y `Test1234!` entra en todas.

> **Ojo con `govt-local@dim.test`.** Existe, y NO es Lucas. Cubre Buenos
> Aires/La Plata y CABA/Palermo, así que desde esa cuenta **no se ve Recoleta**
> — donde está la clínica. Si la usás, la línea de vigilancia va a parecer rota
> sin estarlo.

## 2.1 Dónde pasa todo — leelo antes de cargar la primera dirección

**Todo el test ocurre en CABA.** No es un detalle de ambientación: la
jurisdicción es lo que decide qué ve el funcionario.

Lucas tiene asignación activa en cinco localidades de CABA: **Recoleta,
Palermo, Puerto Madero, Retiro y San Nicolás**. Un hecho cargado fuera de esas
cinco **no le va a llegar**, y eso no sería un bug: sería una dirección puesta
en otra jurisdicción.

> Cuando un formulario te pida ubicación, poné una de esas cinco. Si querés
> probar a propósito qué pasa con una fuera de alcance, hacelo en el hito **X9**
> de la Fase 4 y decilo ahí — pero no lo mezcles con las líneas normales.

| Organización | Token | Localidad |
|---|---|---|
| Clínica Veterinaria Recoleta | `DIM-9XKC-ZDQK` | Recoleta |
| Refugio Patitas del Norte | `DIM-389S-JFKJ` | Palermo |

**Alejo es admin de las dos** — por eso puede ser la contraparte de todos. Lilian
firma como `vet_individual` **en la clínica**.

### Dos cosas que NO son hallazgos

- **Graciela y Noelí ya figuran como `foster` del Refugio Patitas del Norte.**
  Es deliberado y es lo que hace posible que el refugio les proponga un tránsito
  (hitos N3/N4). No lo reportes como "ya tenía permisos que no pedí".
- **Ignacio (`owner@dim.test`) no pertenece a ninguna organización.** Es el
  ciudadano puro del elenco, a propósito: su línea mide la experiencia de
  alguien que sólo tiene su mascota.

---

## 3. Lo que ya está hecho por el agente — no lo repitas

Antes de que empieces, ya se dejó preparado:

- **Turnos reservables.** La clínica de Recoleta tiene la campaña antirrábica `DEMO-SVO-CABA-RABIES` con una regla de agenda **vigente y abierta** (Lun-Vie 08:00-12:00) y turnos materializados. `/turnos/buscar` devuelve resultados.
- **Por qué estaba vacío antes**, para que no lo reportes como bug ajeno: la regla anterior vencía el **6 de agosto** y el test corre después. Fue una regla expirada, no una falta de datos.

---

# FASE 1 — Configurar el sistema (`admin@dim.test`)

**Va primero, y es la fase que nunca se prueba.** Todo lo que hagan los demás cae contra esta configuración.

| # | Hito | Qué hacer |
|---|---|---|
| **A1** | Foto del estado inicial | Recorrer `/admin`, `/admin/sistema`, `/admin/cola`, `/admin/alertas` y registrar los números de partida. Sin este "antes" no hay con qué comparar |
| **A2** | Reglas de negocio | En `/admin/reglas`, cargar reglas reales en **al menos tres jurisdicciones distintas**, incluyendo una a nivel **provincia** y otra a nivel **localidad** de esa misma provincia. Objetivo explícito: **probar la cascada** — que la más específica gane |
| **A3** | Regla que NO se puede crear | Intentar crear una regla **idéntica al default**. El sistema debería negarse y explicar por qué. Anotá si el botón te deja apretarlo igual y qué te dice |
| **A4** | Chapas físicas | Emitir un lote chico en `/admin/chapas`. **Descargá el CSV de un solo uso y guardalo** — los códigos no se recuperan, sólo se persiste el hash. Recargá y verificá que ni seriales ni códigos vuelven a mostrarse |
| **A5** | Suscripciones de alerta | Crear **tres**, con umbrales que la actividad de este test **sí** vaya a cruzar. Las métricas disponibles son seis y sólo seis: señales de zoonosis activas, denuncias de maltrato abiertas, SLA ENO a tiempo, antigüedad de la cola, cobertura de castración, penetración de microchip. **No hay una de mordeduras** — si la buscás no está, y su ausencia no es hallazgo (la mordedura alimenta la señal de zoonosis, no una métrica propia). Elegí zoonosis, maltrato y una tercera |
| **A6** | Capacidades | Revisar en `/admin/cola` si hay solicitudes pendientes. Aprobar al menos una y **rechazar otra con motivo**, para que existan ambos desenlaces en el historial |
| **A7** | Verificación de organización | Si hay alguna sin verificar, verificarla. Y mirar qué cambia en el producto después |

---

# FASE 2 — El pasado: leer el que existe, y escribir uno nuevo

**Esta fase es la que hace que el sistema tenga algo que decir.** Sin ella, todas las proyecciones miran un mes de datos.

## 2.0 Primero LEER — el patrón de oro ya está en la base

La base tiene mascotas históricas con **biografías reales**, y son la referencia contra la cual juzgar todo lo demás. No las toques: **leelas**.

| Mascota | Token | Vida registrada | Tipos de evento |
|---|---|---|---|
| **Kabosu** (el Doge) | `DIM-KABO-0019` | 2005–2024 | 24 |
| **Terry** (Toto, *El Mago de Oz*) | `DIM-TRRY-0018` | 1933–1945 | 23 |
| **Pal** (el Lassie original) | `DIM-PAL2-0017` | 1940–1958 | 18 |
| **Hachikō** | `DIM-HACH-0016` | 1923–1935 | 18 |
| **Frida** (rescatista, México) | `DIM-FRID-0023` | 2009–2022 | 15 |
| **Pampa** (flagship) | `DIM-PAMP-0001` | 2022–2026 | 8 |

| # | Hito | Qué hacer |
|---|---|---|
| **B0** | Leer una vida entera | Abrir la libreta de **Kabosu** (la más rica: 24 tipos, 19 años). ¿Se puede **recorrer** esa historia o hay que scrollear a ciegas? ¿Encontrás rápido "cuándo fue su última antirrábica"? ¿Se distingue lo vigente de lo vencido de lo histórico? |
| **B0b** | Una vida de otra época | Abrir **Hachikō** (1923–1935). Fechas de hace un siglo. ¿La interfaz las soporta o se rompe algo — orden, cálculo de edad, "próximo a vencer" sobre una vacuna de 1930? **Este es un borde real y gratis** |
| **B0c** | La credencial pública de un histórico | Abrir el `/p/` de uno de ellos. Está fallecido: ¿la credencial es honesta al respecto o parece un animal vivo? |

## 2.1 Después ESCRIBIR — probar el camino de carga

| # | Hito | Qué hacer |
|---|---|---|
| **B1** | Un animal con años, hecho a mano | Registrar `CIU-Matusalén` y cargarle **eventos fechados hacia atrás**: vacunas de 2023, 2024 y 2025, desparasitaciones, pesos que cambian, una visita al veterinario. Usá las fechas de los formularios, no la de hoy |
| **B2** | Comparar contra el patrón de oro | Abrir su libreta **y la de Kabosu al lado**. ¿La que armaste a mano se lee igual de bien? Si no, ¿qué le falta — y es porque el formulario no lo pide, o porque la pantalla no lo muestra? |
| **B3** | Firmado vs declarado | En el mismo animal, que **Lilian firme** una vacuna con su matrícula y que el **dueño declare** otra. Verificar que la libreta las distingue y que se entiende cuál vale más |
| **B4** | Un animal sin nada | Registrar `CIU-Fantasma` y **no cargarle nada**. Es el otro extremo: ¿qué muestra su credencial pública? ¿Es honesta sobre lo que no sabe? |
| **B5** | Un animal que ya no está | Registrar `CIU-Ausente`, darle historia breve, y registrar su **fallecimiento con disposición final**. Verificar qué avisos aparecen y qué pasa con su credencial |

---

# FASE 3 — Las líneas de vida (rotación)

Cada línea alterna **ACTO** (lo que hace) y **ESPERA** (lo que depende de otro). Al llegar a una ESPERA, **cambiá de persona**.

### Línea L — Lucas, el que vigila

En **cada vuelta**: entrar a `/gob/vigilancia`, `/gob/vigilancia/brotes`, `/gob/casos`, `/gob/denuncias`, `/gob/perdidas` y anotar **si algo se movió y si coincide con lo que realmente pasó**.

- **L1.** Triar la denuncia de Graciela: asignar, registrar intervención.
- **L2.** Sobre la mordedura de Noelí: **verificar que la observación antirrábica arrancó sola**. No busques un botón de "iniciar": no existe, y su ausencia **no es un hallazgo**. El sistema abre la observación en el mismo momento en que el dueño reporta la mordedura (N2). Lo que sí se mide acá: ¿te enteraste vos, o la encontraste porque fuiste a buscarla? Entrá por `/gob/acciones` ("Acciones que vencen"), que es el camino navegable real, y anotá cuántos saltos te costó llegar.
- **L3.** Generar el **PDF de exportación MPF** de un caso de maltrato.
- **L4.** Armar un **operativo de alcance** (lista + recordatorio) sin enviar masivos.
- **L5.** Entrar a `/gob/casos` y abrir el expediente que la cola te pone **primero** — ordena por urgencia, así que es el más urgente de tu jurisdicción. Intentá cerrarlo. **Sabemos que no vas a poder:** el detalle de caso no tiene ningún control de operador, ni cerrar, ni escalar, ni asentar una nota. Está en el backlog desde el 26/07, bloqueado por una decisión de alcance. **Es hallazgo conocido, no lo investigues** — pero sí contanos lo que importa: llegar hasta ahí y descubrir que no hay nada que hacer, ¿cuánto te costó, y la pantalla te lo dice de entrada o lo descubrís buscando?
- **L5c.** El cierre que **sí** existe: en `/gob/maltrato/[id]`, sobre la denuncia de Graciela. Ahí están triage, asignación y el export. Verificá que sale de la cola.
- **L5b.** **Cerrar la observación antirrábica** de N2. Entrá por `/gob/acciones`, que es donde el producto te la ofrece, y seguí el botón "Cerrar". *(Hasta el 2026-08-10 ese botón te mandaba a una pared: apuntaba a `/admin`, cuyo layout rebota a gobierno. Se arregló — si igual chocás, es hallazgo nuevo y queremos el detalle.)* Lo que se mide: desde que ves que hay una observación por vencer hasta que la cerrás, **¿cuántos saltos y cuántas pantallas?**
- **L6.** El extremo: **ejecutar un decomiso** en `/gob/decomisos/nuevo`, con sus adjuntos obligatorios, y traspasarlo a una organización. **ESPERA:** que Alejo lo reciba. *(Este hito estaba en la línea de Alejo. Se movió acá porque `requireDecomisoPrincipal` exige rol `govt` o `admin` y ninguna capability de organización lo habilita — Alejo no podía ejecutarlo.)*

### Línea I — Ignacio, el perdido y el viaje

- **I1.** Registrar `CIU-Rocco` con foto.
- **I2.** Activar una **chapa física** del lote de A4 y vincularla a Rocco. Verificar que `/t/<serial>` redirige a su credencial.
- **I3.** Marcarlo **perdido**, eligiendo qué se muestra. Abrir la credencial pública y verificar que coincide. **ESPERA:** que alguien lo vea.
- **I4.** Tras el avistaje de Graciela: ¿se enteró? ¿cómo? ¿el mapa muestra lo prometido?
- **I5.** Recuperarlo. Verificar que sale del listado público.
- **I6.** Sacar **turno de antirrábica** en la clínica. **ESPERA:** que lo atienda **Lilian** (no Alejo — ver V1).
- **I7.** Tras la atención: verificar la vacuna firmada en la libreta. Mirá **quién figura como firmante** y con qué rol: es lo que distingue una vacuna firmada por profesional de una declarada por el dueño.
- **I8.** Entrar a **"Viaje y movilidad"** desde la mascota. **Esto es una prueba de honestidad, no de función:** la movilidad jurisdiccional **no está construida** (decisión de PO, 2026-07-19) y la pantalla debería decirlo. Lo que se mide: ¿te queda claro que no está disponible, o parece que algo falló? ¿El ítem de menú se ofrece como si funcionara? **No busques un botón de exportar: no existe, y su ausencia no es hallazgo.** Que la pantalla te haga creer que sí, lo sería.
- **I9.** **Revocar la chapa.** Verificar que `/t/<serial>` queda honesto: sin datos, sin razón.

### Línea N — Noelí, la línea zoonótica

- **N1.** Registrar `CIU-Nube`.
- **N2.** Reportar una **mordedura**. Esta es la línea que alimenta vigilancia. **ESPERA:** que el funcionario reaccione. *(Ojo: esto además abre sola la observación antirrábica. Anotá si el formulario te lo avisa — si no te lo dice, es hallazgo: acabás de disparar un procedimiento sanitario sin saberlo.)*
- **N2b.** **Verificar tu DNI** en `/cuenta/verificar-dni`. Verificado el 2026-08-09: **ninguna cuenta del elenco tiene el DNI verificado**, y el pool de tránsito lo exige. Sin este paso, N3 se traba en un pre-chequeo. Lo que se mide acá: llegando desde N3, **¿el sistema te explica qué te falta y te lleva a resolverlo**, o te deja adivinando? Hacé N3 primero a propósito para verlo.
- **N3.** Ofrecerse como **tránsito**. **ESPERA:** que el refugio le proponga.
- **N4.** Al recibir la propuesta: aceptar, y registrarle eventos al animal en tránsito.
- **N5.** Reportar un **síntoma** y, si se puede, una **enfermedad**. Anotar si genera señal en vigilancia o queda sólo en la libreta.
- **N6.** **Cerrar el tránsito** y verificar que la custodia vuelve donde corresponde.
- **N7.** El extremo: **una mascota que muere durante la observación antirrábica**. Registrar el fallecimiento y verificar que la observación se cierra sola y que la autoridad recibe aviso urgente que **nombra la disposición**.

### Línea G — Graciela, la vecina

- **G1.** Ser **la que encuentra a Rocco**: desde ventana anónima, abrir su QR público y reportar el avistaje con foto. *(Sólo cuando Ignacio ya lo marcó perdido.)*
- **G2.** **Postularse para adoptar**. **ESPERA:** que el refugio decida.
- **G3.** Al ser aprobada: completar la adopción y verificar que el animal aparece en **sus** mascotas.
- **G4.** **Denuncia de maltrato con evidencia**, como ciudadana. Guardar el código. **ESPERA:** el funcionario.
- **G5.** Volver al comprobante con el código: ¿cambió el estado?
- **G6.** Proponerle a Ignacio una **transferencia**. **ESPERA:** que acepte.
- **G7.** El extremo: querer **devolver** el animal adoptado. **Buscalo vos primero, desde tu cuenta.** No existe — la reversión es una acción de la organización (`adoption.finalize`), la ejecuta Alejo en **A-7**. Lo que se mide acá es real y vale: una adoptante que se arrepiente, ¿tiene por dónde empezar? ¿Encuentra a quién avisar, o es un callejón sin salida? Anotá lo que intentaste antes de rendirte. Después de que Alejo la ejecute, volvé y verificá **tu** lado: ¿te avisaron? ¿desapareció de tus mascotas? ¿queda rastro en el historial?

### Línea A — Alejo, la contraparte

**En cada vuelta, lo primero es mirar sus colas.**

- **A-0.** **Primero de todo, en la primera vuelta:** aprobar el pedido de `appointment.manage` de Lilian en `/org/[orgToken]/admin/permisos`. Sin esto, la línea de turnos entera (I6, I7, V1) queda bloqueada — vos sos el único con esa capacidad y A-4 te prohíbe usarla. Anotá si te queda claro **qué habilita** el permiso que estás aprobando.
- **A-1.** En el refugio: **ingreso** de un animal `CIU-`, publicarlo en adopción.
- **A-2.** Resolver la postulación de Graciela y **finalizar la adopción**.
- **A-3.** Proponerle el **tránsito** a Noelí.
- **A-4.** **NO atiendas el turno de antirrábica de Ignacio.** Es de Lilian (V1), y esto no es un detalle de reparto. En este producto **atender un turno ES firmarlo**: la acción flipea el turno a `atendido` e inserta el evento de la vacuna en la misma transacción, con el rol del que la ejecuta. Alejo es admin de la clínica, así que el sistema **te va a dejar** — y la vacuna quedaría firmada como refugio, no como profesional, matando la distinción que el test quiere medir. Sí anotá esto: **¿la pantalla te advierte que atender es firmar?** Si te deja hacerlo sin decir que estás firmando un acto sanitario, **eso es un hallazgo grande**.
- **A-5.** Un **walk-in**: alguien sin turno. Verificar que el dueño se entera.
- **A-6.** **Importar animales por CSV** si la interfaz lo ofrece. Probar con un archivo que tenga **filas malas a propósito** y mirar qué dice.
- **A-7.** **Revertir la adopción** de Graciela (ver G7): ella no tiene por dónde, la acción vive acá. Verificar qué pasa con la custodia y con el historial.
- **A-8.** Recibir el **decomiso** que ejecutó Lucas (L6) en `/org/[orgToken]/transferencias/recibidas`. **ESPERA:** que Lucas lo ejecute primero.

### Línea V — Lilian, la que firma

- **V0.** **Pedir el permiso que te falta.** `appointment.manage` **no** viene con el rol de veterinaria: se gana por el flujo de aprobación (decisión de spec D8). Sin él ni siquiera vas a ver "Agenda" en el menú. Pedilo desde el portal de la clínica. **ESPERA:** que Alejo lo apruebe (A-0). Lo que se mide acá, y vale por sí solo: cuando te falta un permiso, **¿el producto te dice cuál te falta y cómo pedirlo, o simplemente desaparece la pantalla?**
- **V1.** **Atender y firmar** la antirrábica de Ignacio (turno agendado). Es una sola acción, no dos: acá se decide si el evento queda con firma profesional. Verificá después, en la libreta, **el chip de autor**: copiá su texto literal. Debería nombrar tu matrícula, no a la clínica.
- **V2.** Firmar un **microchip** en otro animal.
- **V3.** El extremo: intentar firmar algo **fuera de su jurisdicción o sin permiso**, y anotar qué le dice el sistema.

---

# FASE 4 — Los bordes

Hacelos cuando las líneas estén avanzadas. **Buscar el límite es el objetivo, no el accidente.**

| # | Extremo | Qué probar |
|---|---|---|
| **X1** | Topes de texto | Llenar una descripción larga hasta el máximo. ¿La pantalla avisa al llegar? |
| **X2** | Topes de archivos | Subir el máximo de adjuntos permitido, y **uno más**. ¿Qué dice? |
| **X3** | Código inexistente | Buscar un `DEN-` inventado, un `DIM-` inventado, un `TAG-` inventado. **Los tres deberían responder igual que uno real pero ajeno** — sin filtrar existencia |
| **X4** | Doble envío | Mandar el mismo formulario dos veces rápido. ¿Se duplica? |
| **X5** | Filtro sin resultados | Combinar filtros hasta vaciar una lista. ¿Ofrece salida o es una lápida? |
| **X6** | Estado terminal | Intentar actuar sobre algo ya cerrado, ya adoptado, ya revocado. ¿Lo impide o lo deja? |
| **X7** | Sesión cruzada | Con la cuenta de una persona, intentar abrir un recurso de otra por URL directa. Debería dar **404, no 403** — un 403 confirma que existe |
| **X8** | Volver atrás | En cualquier wizard largo, ir y volver con el botón del navegador. ¿Sobrevive lo cargado? |
| **X9** | Fuera de jurisdicción | Cargar un hecho con una dirección **fuera** de las cinco localidades de Lucas (por ejemplo en La Plata) y verificar que él NO lo ve. Lo que se mide acá no es que el filtro funcione: es si **el que carga se entera** de que su reporte no le va a llegar a nadie |

---

# 4. Cómo reportar — hito a hito, sin perder nada

**Esta sección es tan importante como el test.** Una corrida larga que reporta al final pierde todo si se corta.

## La regla

> **Después de CADA hito, escribís su línea en la bitácora. Antes de pasar al siguiente.**
> No al final de la fase. No al final de la vuelta. **Después de cada uno.**

Si la corrida se corta en el hito 47, los 46 anteriores ya están escritos y sirven.

## El formato de cada línea

```
[HITO] <id> | <persona> | <resultado> | <qué quedó creado> | <qué esperás ahora>
```

- **`<id>`** — el de este documento (`A2`, `I3`, `X7`) o `Vn-<persona>-<n>` si es algo que hiciste por tu cuenta.
- **`<resultado>`** — `OK` · `OK-CON-FRICCIÓN` · `BLOQUEADO` · `NO-SE-PUDO`.
- **`<qué quedó creado>`** — token público, código, nombre. **Si creaste algo y no anotás su token, lo perdiste.**
- **`<qué esperás ahora>`** — `nada` o el hito ajeno del que dependés.

Ejemplo:

```
[HITO] I3 | Ignacio | OK-CON-FRICCIÓN | CIU-Rocco DIM-XXXX-XXXX marcado perdido | espera avistaje (G1)
[HITO] G1 | Graciela | OK | avistaje reportado con foto sobre DIM-XXXX-XXXX | nada
[HITO] I4 | Ignacio | BLOQUEADO | — | no encontré aviso del avistaje por ningún lado
```

## Cuando algo chirría

Además de la línea del hito, un bloque:

```
[HALLAZGO] <id del hito>
Lente:        L1 claridad | L2 unificación | L3 seguimiento | L4 consistencia | L5 confianza
Dónde:        <la pantalla, como la nombrarías vos>
URL:          <la dirección exacta>
Hora ART:     <HH:MM>
Cuenta:       <con cuál estabas>
OBSERVACIÓN:  <sólo lo que viste en pantalla. Sin causas.>
HIPÓTESIS:    <por qué creés que pasa — o "ninguna". Va SIEMPRE separado.>
SUGERENCIA:   <qué harías — o "ninguna">
Qué esperaba: 
Cuánto frenó: me trabó | dudé | sólo me molestó
Reproducir:   <pasos exactos>
```

**Los tres campos del medio no son burocracia.** La corrida anterior de un
agente sobre este producto emitió cuatro hallazgos con excelente observación y
diagnóstico equivocado — uno de ellos reportó como 404 lo que era un 200 con el
boundary renderizado, y su arreglo habría roto dos rutas. La observación casi
siempre es correcta; la causa casi nunca. Separalas y las dos sirven.

**Y no tenés SQL ni API**, así que todo lo que digas sobre causas es hipótesis
por construcción. Marcala como tal y nadie va a actuar sobre ella como si fuera
un hecho.

Si no sabés qué lente es, ponelo igual y escribí `Lente: no sé`. **Nunca dejes de reportar algo porque no encaja.**

## Al cerrar cada vuelta de rotación

```
[VUELTA] <n> — esperas abiertas: <lista de hitos bloqueados y de qué dependen>
```

Eso es lo que hace visible el comportamiento que el test busca medir: **cuánto tarda el sistema en avisarle a alguien que su espera terminó.**

## El informe final

1. **La bitácora completa**, en orden.
2. **Un párrafo por lente (L1 a L5).** Tu opinión, sostenida por hitos concretos. Esto es lo que más nos importa — más que la lista de bugs.
3. **Todos los `[CORTE]` juntos en una tabla**, para poder leer de un vistazo dónde los roles dejaron de coincidir.
4. **Tabla de todo lo creado `CIU-`**: tipo, nombre, token, cuenta creadora, hito que lo creó.
5. **El antes y el después de admin y de Lucas**: qué mostraban al empezar y al terminar, y si la diferencia se corresponde con lo que ocurrió.
6. **Lo que no pudiste probar y por qué.** Vale tanto como un hallazgo.
7. **"Verificado y limpio"** — qué miraste que **sí** funcionó, y cómo lo comprobaste. **Esta sección es obligatoria y es la que hace que un informe sin hallazgos signifique algo.** Sin ella, "no encontré nada" y "no miré" se escriben igual.

### Las tres preguntas del cierre

1. ¿En qué momento **no supiste si algo había pasado**?
2. ¿Alguna vez **hiciste algo dos veces** porque no sabías si había salido?
3. ¿Hubo algún número, en cualquier pantalla, que **no le creíste**?

---

# 5. Lo que NO es hallazgo

- **Panorama y Padrón** corren sobre cubo nocturno: no se mueven en vivo.
- **Las alertas se disparan por cron diario.** Crear la condición hoy no produce una alerta ahora. **No reportes que la alerta no llegó durante la corrida.** Sí reportá si el formulario promete otra cosa, o si no queda claro cuándo se evalúa.
- Los datos previos son **siembra**: nombres raros y cantidades poco realistas son esperables.
- El **mapa provincial** puede mostrar pocas burbujas: hay supresión por privacidad con números chicos.
- `/adoptar` muestra **sólo el booleano** de microchip: es decisión de privacidad.
- Una **denuncia de maltrato NO es señal epidemiológica** y no debería aparecer en el mapa de vigilancia. Si aparece, **eso sí es hallazgo**.

### Cinco ausencias verificadas — no las reportes como falta

Cada una se comprobó contra el código el 2026-08-10. Lo que **sí** es hallazgo en cada caso está al lado.

| No existe | Por qué | Lo que sí es hallazgo |
|---|---|---|
| Botón de **exportar documento de viaje** (I8) | La movilidad jurisdiccional no está construida — decisión de PO, 2026-07-19, fachada honesta | Que la pantalla te haga creer que sí funciona |
| Botón de **iniciar observación antirrábica** (L2) | Arranca sola cuando el dueño reporta la mordedura | Que el formulario de mordedura no te avise que la disparaste |
| Métrica de alerta de **mordeduras** (A5) | Sólo hay seis claves y esa no está | Que el desplegable insinúe que existe |
| **Devolver una adopción desde la cuenta del adoptante** (G7) | La reversión es acción de la organización | Que la adoptante no encuentre a quién avisar |
| **Decomiso desde una organización** (A-8) | Exige rol `govt` o `admin`; ninguna capability de org lo habilita | Que el producto ofrezca el botón y después lo rechace |

Si algo de esto está **mal comunicado en la pantalla**, es hallazgo. La diferencia es entre "el dato está mal" (no) y "la pantalla no me avisa que el dato es de anoche" (sí).

## Y una regla sobre los datos ajenos

**No toques nada que no hayas creado vos.** El elenco demo (`DIM-DEMO-*`, `DIM-PAMP-0001`/Pampa) y lo que haya dejado el revisor de UX veterinario quedan intactos: no edites, no borres, no resuelvas colas que no abriste.

**Sólo UI.** Nada de SQL ni de API directa. Si un flujo no se puede completar por la interfaz, **eso ES el hallazgo**.
