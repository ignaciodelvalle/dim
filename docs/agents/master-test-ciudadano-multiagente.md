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

> **Rate limit real: 5 logins/min por email, 10/min por IP.** Una vuelta son 6 logins. Si te bloquea, esperá dos minutos. No insistas.

---

## 2. El elenco

Personas que **ya existen** en la base. Todas con `Test1234!`. Si alguna no existe, **no la inventes**: anotalo como hallazgo y seguí.

| Persona | Cuenta | Rol en la historia |
|---|---|---|
| **Administración miMAR** | `admin@dim.test` | Configura el sistema. Fase 1 completa |
| **Lucas Etcheverry** | `govt-local@dim.test` | Funcionario. Vigila y tría |
| **Ignacio del Valle** | `owner@dim.test` | Dueño. Línea del perdido y del viaje |
| **Noelí Assandri** | `noeli@dim.test` | Dueña y tránsito. Línea zoonótica |
| **Graciela Saavedra** | `graciela@dim.test` | Dueña. Línea de la adopción y la denuncia |
| **Alejo Caride** | `alejo@dim.test` | Refugio + clínica. Contraparte de todos |
| **Dra. Lilian Marrone** | `lilian@dim.test` | Veterinaria matriculada. Firma |

**Organizaciones verificadas en staging** (14 en total; estas son las que usa el test):

| | Token |
|---|---|
| Clínica Veterinaria Recoleta | `DIM-9XKC-ZDQK` |
| Refugio Patitas del Norte | `DIM-389S-JFKJ` |

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
| **A5** | Suscripciones de alerta | Crear **tres** con umbrales que la actividad de este test **sí** vaya a cruzar: mordeduras, zoonosis/brotes, denuncias de maltrato |
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
- **L2.** Sobre la mordedura de Noelí: **iniciar la observación antirrábica**.
- **L3.** Generar el **PDF de exportación MPF** de un caso de maltrato.
- **L4.** Armar un **operativo de alcance** (lista + recordatorio) sin enviar masivos.
- **L5.** Cerrar un caso y verificar que sale de la cola.

### Línea I — Ignacio, el perdido y el viaje

- **I1.** Registrar `CIU-Rocco` con foto.
- **I2.** Activar una **chapa física** del lote de A4 y vincularla a Rocco. Verificar que `/t/<serial>` redirige a su credencial.
- **I3.** Marcarlo **perdido**, eligiendo qué se muestra. Abrir la credencial pública y verificar que coincide. **ESPERA:** que alguien lo vea.
- **I4.** Tras el avistaje de Graciela: ¿se enteró? ¿cómo? ¿el mapa muestra lo prometido?
- **I5.** Recuperarlo. Verificar que sale del listado público.
- **I6.** Sacar **turno de antirrábica** en la clínica. **ESPERA:** que lo atiendan.
- **I7.** Tras la atención: verificar la vacuna firmada en la libreta.
- **I8.** **Exportar el documento de viaje** de Rocco. Verificar que el PDF dice la verdad sobre su estado sanitario.
- **I9.** **Revocar la chapa.** Verificar que `/t/<serial>` queda honesto: sin datos, sin razón.

### Línea N — Noelí, la línea zoonótica

- **N1.** Registrar `CIU-Nube`.
- **N2.** Reportar una **mordedura**. Esta es la línea que alimenta vigilancia. **ESPERA:** que el funcionario reaccione.
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
- **G7.** El extremo: **devolver** el animal adoptado. Verificar qué pasa con la custodia y con el historial.

### Línea A — Alejo, la contraparte

**En cada vuelta, lo primero es mirar sus colas.**

- **A-1.** En el refugio: **ingreso** de un animal `CIU-`, publicarlo en adopción.
- **A-2.** Resolver la postulación de Graciela y **finalizar la adopción**.
- **A-3.** Proponerle el **tránsito** a Noelí.
- **A-4.** **Atender el turno** de Ignacio.
- **A-5.** Un **walk-in**: alguien sin turno. Verificar que el dueño se entera.
- **A-6.** **Importar animales por CSV** si la interfaz lo ofrece. Probar con un archivo que tenga **filas malas a propósito** y mirar qué dice.
- **A-7.** El extremo: **decomiso**. Si el rol lo permite, ejecutar uno con sus adjuntos obligatorios.

### Línea V — Lilian, la que firma

- **V1.** Firmar la antirrábica de Ignacio (turno agendado).
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
Qué esperaba: 
Qué pasó:     
Cuánto frenó: me trabó | dudé | sólo me molestó
Reproducir:   <pasos exactos>
```

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

Si algo de esto está **mal comunicado en la pantalla**, es hallazgo. La diferencia es entre "el dato está mal" (no) y "la pantalla no me avisa que el dato es de anoche" (sí).

## Y una regla sobre los datos ajenos

**No toques nada que no hayas creado vos.** El elenco demo (`DIM-DEMO-*`, `DIM-PAMP-0001`/Pampa) y lo que haya dejado el revisor de UX veterinario quedan intactos: no edites, no borres, no resuelvas colas que no abriste.

**Sólo UI.** Nada de SQL ni de API directa. Si un flujo no se puede completar por la interfaz, **eso ES el hallazgo**.
