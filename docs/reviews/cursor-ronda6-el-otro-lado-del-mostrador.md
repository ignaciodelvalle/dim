# Ronda 6 (Cursor) — "El otro lado del mostrador" · sin recorrido pautado

> **Entorno:** `http://localhost:3001` · **Contraseña única:** `Test1234!`
>
> **Ojo:** hay otro tester trabajando en `:3000` sobre las colas de admin, con la MISMA base.
> No entres a `/admin` ni resuelvas colas de operador — no es tu papel en esta ronda y le pisás
> las filas.
>
> **Esta ronda tampoco trae recorrido.** No hay lista de pantallas ni de pasos. Se te dan
> PROBLEMAS de gente real; vos decidís a dónde ir. Si no encontrás dónde se resuelve algo,
> no lo preguntes: **anotalo como hallazgo y seguí**. Eso es la medición.

---

## Tu personaje

Ronda anterior fuiste el funcionario. **Ahora sos la gente a la que el funcionario atiende**: una
dueña primeriza, una veterinaria con la sala llena, un refugio desbordado. Ninguno de los tres
tiene formación técnica, ninguno leyó un manual, y los tres tienen algo más urgente que hacer que
pelearse con una página.

Tu vara para TODO es doble:

1. **¿Resolví MI problema?** — no "¿anduvo el botón?"
2. **¿Entendí qué acababa de pasar?** — si después de tocar un botón dudaste de si el sistema te
   había escuchado, es hallazgo.

Castellano rioplatense. Desktop, salvo donde diga celular (390px).

Reglas de oro:

- **No abras el código ni la documentación.** Solo existe lo que la pantalla te muestra.
- **Nadie sabe qué es un UUID.** Si algo solo se entiende sabiendo cómo está hecho el sistema por
  dentro, es hallazgo.

---

## EL HILO CONDUCTOR (aplica a TODOS los casos)

Esta ronda tiene una sola obsesión, y la vas a repetir después de cada cosa que hagas:

> **Cada vez que cambies algo, andá a mirar la credencial pública de esa mascota (`/p/DIM-…`,
> sin sesión, en otra pestaña). ¿Se enteró?**

La credencial es lo único que ve el vecino que escanea un QR en la calle. Si vos cargás una vacuna
y la credencial sigue diciendo lo de antes, o si reportás una mascota perdida y la credencial dice
"Activa", **eso es hallazgo CRÍTICO** — anotá literal qué decía cada lado y cuánto esperaste.

---

## Reglas de mutación (esta ronda SÍ muta — leelas antes de tocar)

- **Creá tus propios sujetos.** Registrá tus propias mascotas y trabajá sobre ESAS.
- **Prohibido tocar el set curado de demo.** No modifiques las mascotas de `owner@dim.test`
  — `DIM-9HAK-D5Z4`, `DIM-4SUZ-U2HT`, `DIM-VT3V-SEA3`, `DIM-DEMO-0001` — ni `DIM-PAMP-0001`,
  ni los fixtures `Refugio Esperanza Animal` / `Clínica Veterinaria Recoleta`. Mirarlas se puede;
  cambiarlas no.
- **Ponele nombres reconocibles** a lo que crees (ej. prefijo `QA6-`), así se limpia después.
- **Anotá TODO lo que mutaste** en el anexo, con el token que te haya dado el sistema.

---

## Los casos

### Caso 1 · La dueña primeriza (`carla@dim.test`)

Te regalaron un cachorro. Una vecina te dijo que "ahora hay que anotarlos". No sabés qué es MiMAR,
no sabés qué es una credencial, y estás con el celular en una mano y el perro en la otra.

- Anotá al perro. **En celular (390px).**
- Cuando termines, contestá: ¿qué es lo que acabás de sacar? ¿Para qué sirve? ¿Qué hago con el QR
  — lo imprimo, lo llevo al veterinario, lo cuelgo? Si el sistema no te lo explicó solo, es
  hallazgo.
- Mirá tu credencial nueva como la vería un desconocido (hilo conductor).

### Caso 2 · Se escapó

Dejaste el portón abierto. No está.

- Reportalo. Contá qué pasó después de apretar el botón: **¿quién se enteró? ¿te lo dijo el
  sistema, o lo tenés que suponer?**
- Andá a mirar la credencial pública (hilo conductor). ¿Un vecino que la escanea AHORA se entera
  de que lo estás buscando y sabe qué hacer?
- Apareció a las tres cuadras. Cerrá el tema. ¿El sistema te deja "des-perderlo" sin dar vueltas?
  ¿La credencial vuelve atrás?

### Caso 3 · La veterinaria con la sala llena (`lilian@dim.test`)

Sos la Dra. Marrone. Tenés cuatro personas esperando y el perro de Carla arriba de la camilla.

- Cargale la antirrábica. Tenés que poder hacerlo **rápido** — si te lleva más pasos de los que
  aguantarías con gente esperando, es hallazgo de fricción y quiero el número de pasos.
- ¿Carla se entera de que vacunaste a su perro, o se tiene que enterar por vos?
- Hilo conductor: ¿la credencial pública muestra la vacuna nueva?
- Preguntate una vez: **¿estoy viendo datos de esta familia que no necesito para vacunar un
  perro?**

### Caso 4 · El refugio desbordado (`alejo@dim.test`)

Llegó un perro sin dueño, sin chapita y sin nadie que lo reclame.

- Metelo al sistema y ponelo en adopción. ¿El sistema entiende un animal **sin dueño**, o todo el
  flujo asume que hay una persona atrás?
- Miralo después como lo vería alguien que quiere adoptar. ¿Se entiende? ¿Da ganas?

### Caso 5 · El momento de la verdad — la transferencia

Alguien lo adopta.

- Pasá el perro del refugio a una persona. Este es el caso donde el sistema **tiene que** estar
  impecable: es un cambio de responsable legal.
- ¿Las dos partes entienden qué está pasando y en qué estado quedó? ¿Se puede cancelar a mitad?
  ¿Quedó alguien "dueño a medias"?
- Hilo conductor: ¿la credencial pública dice el dueño nuevo, o quedó pegada al anterior?

### Caso 6 · Curiosidad libre (15 min)

Sin misión. Sos vos, con tus cuentas, paseando. Tocá lo que te llame la atención. Metete en un
lugar donde no deberías poder entrar y contame si te dejó. Las perlas salen acá.

---

## Formato del informe

Guardalo en `docs/reviews/2026-07-16-cursor-ronda6-el-otro-lado-del-mostrador.md`.

1. **TL;DR** — ¿una persona normal puede usar esto sin ayuda? Tres líneas.
2. **Hallazgos priorizados** — `BLOQUEA / ALTO / MEDIO / BAJO / IDEA`. Cada uno: pantalla, qué
   esperabas, qué viste, pasos para reproducir, captura si aplica.
3. **El hilo conductor** (sección fija) — una fila por cada cambio que hiciste: qué cambiaste, qué
   decía la credencial pública después, ¿coincidían?
4. **Callejones sin salida** (sección fija) — todo problema que NO pudiste resolver, y en qué
   pantalla te quedaste sin camino.
5. **Lo que funciona muy bien** — para no romperlo después.
6. **Anexo** — casos cubiertos, qué quedó afuera y por qué, y **la lista completa de lo que
   mutaste, con tokens**.

### Una advertencia sobre la ronda pasada

Reportaste como BLOQUEA dos rutas 404 (`/gob/analitica`, `/gob/mi-actividad`) que **no existen
porque nunca existieron**: las dedujiste traduciendo los rótulos del nav y las tecleaste a mano.
Los links reales del menú apuntan a `/gob/analytics` y `/gob/historial`, y andan.

Entonces, esta ronda: **si no clickeaste, no lo reportes.** Un hallazgo que dice "click en X" tiene
que ser un click de verdad. Adivinar una URL y encontrar un 404 no es un hallazgo del sistema — es
un hallazgo tuyo. Si querés reportar que una ruta es difícil de adivinar, reportá ESO, y decilo
así.
