# Guion de datos para la demo — seis historias completas

> **Para el equipo que carga datos en staging.** No es una lista de tareas: son
> **seis historias**, cada una con varios actores, que al terminar dejan un
> sistema que se puede mostrar.
>
> **La demo es en dos días y es con funcionarios de gobierno.**

## Por qué historias y no volumen

Ya hay 100 mascotas cargadas y **no sirven**. Se llaman `CursorPet-001` a
`CursorPet-100`, están todas en Palermo, sin raza, sin chip, y con **un solo
evento cada una**: el alta. De 115 eventos cargados ese día, 100 son altas.

Un funcionario que abra cualquiera de esas fichas ve una credencial vacía — que
es peor que no tenerla, porque muestra el esqueleto del sistema en vez de su
funcionamiento.

**Diez mascotas con historia valen más que cien vacías.** Lo que hay que
demostrar no son los usuarios: es **lo que pasa entre ellos**.

---

## Antes de empezar: dónde leer, y qué está desactualizado

- **`AGENTS.md`** — leé primero el índice slim. Cargá las secciones profundas
  solo cuando las necesites.
- **`CLAUDE.md`** — los seis invariantes del proyecto.
- **Este documento** para qué cargar.
- **`docs/plans/2026-08-01-plan-demo-funcionarios.md`** — el plan vigente.

**`docs/plans/PENDIENTES.md` es catálogo de hallazgos, NO estado.** Tiene
entradas podridas: hoy encontramos dos que figuraban abiertas y estaban
resueltas hacía días, y una mandó a un agente a arreglar algo que ya andaba.
**Verificá antes de creerle a cualquier documento, este incluido.**

**Norma del proyecto: cuando un documento y el código discrepan, gana el código.**

---

## Reglas que no se negocian

**Usá los flujos de la aplicación. Nunca SQL directo.** Este sistema es
event-sourced: los hechos viven en una espina de eventos append-only y las
tablas son cachés derivadas. Una mascota insertada a mano existe en la tabla
pero no tiene eventos que la sostengan — las proyecciones quedan incoherentes y
las pantallas empiezan a mostrar números que no cierran entre sí. Que es
exactamente lo que estamos tratando de eliminar.

**Nunca resetear la contraseña de la base.** El 01/08 eso tiró staging abajo
por horas.

**No hace falta que crees cuentas — el elenco ya está sembrado.** Todas
entran con `Test1234!`, y verifiqué el login de cada una contra staging el
01/08, no las estoy copiando de un documento:

| Cuenta | Rol | Qué es |
|---|---|---|
| `owner@dim.test` | dueño | Dueño de mascotas |
| `graciela@dim.test` · `noeli@dim.test` | dueño | Además **fosters** de Refugio Patitas del Norte |
| `vet@dim.test` | **vet** | Admin de "Consultorio Dr. Juan Veterinario" + vet en Refugio Test |
| `lilian@dim.test` | **vet** | Vet en "Clínica Veterinaria Recoleta" |
| `alejo@dim.test` | dueño | **Admin de cuatro organizaciones**: Refugio Patitas del Norte, Clínica Recoleta, Red de Rescate Puerto Madero, Mascotas BA Centro |
| `orgadmin@dim.test` | dueño | Admin de "Refugio Test" (la única **verificada**) |
| `govt@dim.test` | **govt** | 1 jurisdicción |
| `lucas@dim.test` | **govt** | **5 jurisdicciones** — el mejor para ver alcance amplio |
| `govt-local@dim.test` | **govt** | 2 jurisdicciones |
| `admin@dim.test` | **admin** | Alcance nacional |

Para la historia de la libreta firmada usá **`vet@dim.test` o `lilian@dim.test`**:
son los que tienen matrícula, y la diferencia entre un evento firmado por un
matriculado y uno cargado por cualquiera es justamente lo que hay que mostrar.

**No uses cuentas que empiecen con `+cursor-`.** Son de otro equipo. La única
excepción documentada: `+cursor-owner2` quedó como `vet` y admin de "Clínica
Cursor Staging" — tampoco la uses, pero si la ves en un listado, ya sabés qué es.

**Repartí las jurisdicciones.** Esto es crítico y la carga anterior lo hizo mal:
si todo cae en un solo lugar, las pantallas con alcance acotado se ven vacías.
La cuenta de gobierno de la demo está acotada a **Buenos Aires / La Plata** —
si no hay datos ahí, esa cuenta no muestra nada. Repartí entre **La Plata**,
**CABA**, y al menos dos provincias más.

**Datos creíbles en es-AR.** Nombres de personas y mascotas argentinos, razas
reales, localidades que existen. Un funcionario mira si los datos tienen sentido
para su realidad. `CursorPet-047` no se puede explicar.

**La localidad se elige de la lista.** Escribirla a mano no alcanza aunque
parezca que sí. Si ves "Sin resultados", no significa que tu municipio no exista.

---

## Las seis historias

Cada una es una secuencia completa. **Terminala** — una historia a medias deja
el sistema en un estado que no se puede mostrar.

### 1. La mascota que se pierde y vuelve

El corazón del producto. Un dueño registra su perro con chip y foto. Semanas
después lo marca como perdido. **Otra persona, sin cuenta**, escanea el QR de la
chapita y reporta un avistaje con ubicación. El dueño lo recupera y lo marca
como encontrado.

Demuestra: la credencial cumpliendo su función, el camino del que encuentra, y
la reunificación cerrando el circuito.

### 2. La libreta sanitaria con firma profesional

Un veterinario **con matrícula validada** firma una vacuna antirrábica sobre la
mascota de un dueño. Después una desparasitación y un registro de peso. El dueño
las ve en su libreta.

Demuestra: la diferencia entre un dato cargado por cualquiera y uno **firmado
por un profesional matriculado** — que es lo que hace que la libreta valga.

### 3. La adopción completa

Un refugio ingresa un animal sin dueño. Lo publica en adopción. Una segunda
persona se postula. El refugio aprueba y finaliza. **La custodia se transfiere.**

Demuestra: la cadena de custodia entera, que es lo que un municipio necesita
para confiar en el registro.

### 4. La denuncia de maltrato de punta a punta

Un ciudadano denuncia, **con evidencia adjunta** (es obligatoria). La denuncia
llega a la cola del funcionario de esa jurisdicción. El funcionario la toma, la
asigna, y registra una intervención.

Demuestra: el circuito con más peso legal del sistema (Ley 14.346), y que la
jurisdicción rutea bien.

### 5. El walk-in veterinario

Alguien llega a una veterinaria con un animal **sin vínculo previo con esa
organización**. La veterinaria lo atiende y registra el evento clínico.

Demuestra: que el sistema sirve a quien llega sin trámite previo — el caso más
común en la vida real.

### 6. La transferencia entre personas

Un dueño transfiere su mascota a otro. El segundo acepta.

Demuestra: que la titularidad cambia sin perder el historial.

---

## Cómo reportar — importa tanto como cargar

Para **cada** hallazgo:

- **Qué pantalla**, con la URL exacta
- **Qué hiciste**
- **Qué esperabas**
- **Qué pasó**

Clasificado en uno de tres:

- **Rompe la demo** — no se puede mostrar así
- **La debilita** — se puede mostrar pero resta credibilidad
- **Anotar** — real, no urgente

Y dos cosas más:

**Separá lo que verificaste de lo que inferís.** "No estoy seguro" es un
resultado válido y útil. Varios reportes de hoy —míos incluidos— resultaron
imprecisos justo en el detalle que decidía el arreglo.

**Decí qué anduvo bien.** No por cortesía: **necesitamos saber qué no tocar.**
Con dos días y varios agentes arreglando en paralelo, una lista de lo que ya
funciona es lo único que protege contra romperlo por exceso de celo.

**Si un flujo no se puede completar, no le busques la vuelta.** Ese atasco ES el
hallazgo, y es más valioso que el dato que ibas a cargar. Anotalo y seguí con la
historia siguiente.

---

## Qué ya sabemos que está roto — no hace falta re-reportarlo

Salvo que lo veas seguir pasando después de hoy:

- El caption de la tabla Registros del panorama decía "Nacional" con alcance
  acotado (arreglado hoy, junto con el pie del PNG exportado).
- El "todo dentro de rango" cuando no se midió nada.
- El delta de orden de magnitud con flecha roja sobre una carga incompleta.
- La leyenda del mapa con la rampa de color invertida.
- El alta que no dejaba terminar de cargar el nombre.
- El campo de localidad que decía "Sin resultados" antes de haber buscado.
- El formulario de aviso a la autoridad que faltaba en las rutas de hallazgo.

## Lo que sabemos que sigue roto

- **El e2e no es un gate**: 33 ubicaciones rojas, la mayoría anteriores a esta
  ola. No es señal de nada que encuentres vos.
- Las 100 mascotas `CursorPet-*` en Palermo, sin historia. Se van a etiquetar
  para sacarlas de los listados.
