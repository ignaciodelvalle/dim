# Master test — el portal ciudadano, con cinco personas que se esperan entre sí

> **Para Cowork.** Un solo navegador, cinco personas, cinco líneas históricas que se cruzan.
>
> **Entorno:** https://dim-staging.vercel.app · **Prefijo obligatorio:** `CIU-` · **Duración:** larga, por diseño.

---

## 1. Por qué esto no es un clickthrough más

Un clickthrough recorre flujos. Este test recorre **esperas**.

Casi todo lo que importa en miMAR necesita a otro: el dueño postula y **el refugio decide**; el dueño pide turno y **el veterinario atiende**; alguien denuncia y **el funcionario tría**. Un agente que hace los dos lados seguidos nunca prueba lo único que el usuario real vive todo el tiempo: **estar esperando a alguien, sin saber si ya pasó.**

Así que la regla central es:

> **Nadie espera a nadie con el cronómetro. Cada persona, cuando le toca, MIRA si lo que esperaba ya sucedió — y si no sucedió, avanza otra cosa.**

Eso es exactamente lo que hace una persona real con la app abierta en el celular.

## 2. Cómo se ejecuta en un solo navegador

Cowork es **un** navegador y trabaja en **serie**. No hay paralelismo real, y no hace falta: lo que se pide es **rotación**.

**El ciclo:** tomás una persona, avanzás su línea hasta que quede **bloqueada esperando a otro**, anotás qué está esperando, cerrás sesión y pasás a la siguiente. Cuando volvés a esa persona, **lo primero que hacés es verificar si su espera se resolvió.**

Rotá siempre en este orden, dando la vuelta completa aunque alguna persona no tenga nada nuevo:

```
Lucas (gobierno) → Ignacio → Noelí → Graciela → Alejo (instituciones) → volver a empezar
```

**Por qué la rotación fija y no "seguir al que pueda avanzar":** si perseguís siempre al desbloqueado, terminás haciendo los dos lados de cada circuito seguidos y el test se convierte en el clickthrough que ya tenemos. La vuelta completa es lo que fuerza la espera real.

**Rate limit real: 5 logins por minuto por email, 10 por IP.** Una vuelta completa son 5 logins. Si te bloquea, esperá dos minutos — no insistas.

## 3. El elenco

Son las personas que ya existen en la base, no personajes nuevos. Todas con `Test1234!`.

| Persona | Cuenta | Quién es |
|---|---|---|
| **Lucas Etcheverry** | `govt-local@dim.test` | Funcionario. Abre el test y lo cierra |
| **Ignacio del Valle** | `owner@dim.test` | Dueño. Línea del animal perdido |
| **Noelí Assandri** | `noeli@dim.test` | Dueña y tránsito. Línea de la mordedura |
| **Graciela Saavedra** | `graciela@dim.test` | Dueña. Línea de la adopción |
| **Alejo Caride** | `alejo@dim.test` | Refugio + clínica. Es la contraparte de todos |

> Si alguna cuenta no existe en staging, **no la inventes**: anotalo como hallazgo (`no pude ejecutar la línea X porque la cuenta Y no existe`) y seguí con las demás.

## 4. Regla de oro sobre los datos

1. **Todo lo que crees lleva `CIU-`** en el nombre: `CIU-Rocco`, `CIU-Nube`, `CIU-Tita`.
2. **No toques nada ajeno.** El elenco demo (`DIM-DEMO-*`, `DIM-PAMP-0001`/Pampa) y lo que haya creado el revisor de UX veterinario quedan intactos. No edites, no borres, no resuelvas colas que no abriste vos.
3. **Sólo UI.** Nada de SQL ni de llamar la API a mano. Si un flujo no se puede completar por la interfaz, **eso ES el hallazgo**.

---

## 5. Las cinco líneas históricas

Cada línea alterna **ACTO** (lo que la persona hace) y **ESPERA** (lo que queda pendiente de otro). Cuando llegues a una ESPERA, cambiá de persona.

### Línea 0 — Lucas abre el turno de guardia · *va primero, y hay una razón*

Lucas **arranca el test** para que todo lo que hagan los demás caiga contra suscripciones ya vivas.

- **ACTO 1.** Crear en `/gob/suscripciones` (o `/admin/alertas`, la que su rol le habilite) al menos **tres suscripciones de alerta** con umbrales que la actividad de este test **sí** vaya a cruzar: una de mordeduras, una de zoonosis/brotes, una de denuncias de maltrato.
- **ACTO 2.** Recorrer y **fotografiar el estado inicial** de: `/gob/vigilancia`, `/gob/vigilancia/brotes`, `/gob/casos`, `/gob/denuncias`, `/gob/perdidas`. Ese "antes" es la mitad del entregable.
- Después, en cada vuelta: **volver y mirar si algo se movió.** ¿Aparecieron las señales que los demás generaron? ¿La cola creció? ¿Los números coinciden con lo que realmente pasó?
- **ACTO FINAL** (última vuelta): triar lo que llegó — asignar, registrar intervención, cerrar.

### Línea 1 — Ignacio y el animal perdido

- **ACTO 1.** Registrar `CIU-Rocco` con foto. Completar su libreta: vacuna declarada por el dueño (sin firma).
- **ACTO 2.** Marcarlo **perdido**, eligiendo qué se muestra al público. Abrir su credencial pública y verificar que lo que se ve coincide con lo que eligió.
- **ESPERA:** que alguien lo vea.
- **ACTO 3** (después de que Graciela reporte el avistaje): revisar el aviso. ¿Se enteró? ¿Cómo? ¿El mapa muestra lo que le prometieron?
- **ACTO 4.** Recuperarlo. Verificar que sale del listado público.
- **ACTO 5.** Pedir turno de antirrábica en la clínica de Alejo. **ESPERA:** que lo atiendan.
- **ACTO 6.** Después de la atención: verificar que la vacuna firmada aparece en la libreta y **se distingue** de la que él mismo declaró.

### Línea 2 — Noelí y la mordedura · *la que genera zoonosis*

- **ACTO 1.** Registrar `CIU-Nube`.
- **ACTO 2.** Reportar una **mordedura**. Esta es la línea que alimenta vigilancia: debería abrir un caso epidemiológico.
- **ESPERA:** que el funcionario reaccione.
- **ACTO 3.** Ofrecerse como **tránsito** desde su cuenta. **ESPERA:** que el refugio le proponga un animal.
- **ACTO 4** (cuando Alejo le proponga): aceptar el tránsito, y después registrarle eventos al animal en tránsito.
- **ACTO 5.** Reportar un **síntoma** en `CIU-Nube` y, si la interfaz lo permite, una **enfermedad**. Anotar si eso genera señal en vigilancia o queda sólo en la libreta.
- **ACTO 6.** Cerrar la línea con un `CIU-` distinto: registrar un **fallecimiento** con su disposición final, y ver qué avisos aparecen.

### Línea 3 — Graciela, la vecina que adopta

- **ACTO 1.** Ser **la que encuentra a Rocco**: desde una ventana anónima o su cuenta, abrir el QR público de `CIU-Rocco` y reportar el avistaje con foto. *(Esta es su interacción con la línea 1 — hacela recién cuando Ignacio ya lo marcó perdido; si todavía no pasó, salteá y volvé.)*
- **ACTO 2.** Postularse para adoptar un animal del refugio de Alejo. **ESPERA:** que el refugio decida.
- **ACTO 3** (cuando la aprueben): completar la adopción de su lado y verificar que el animal aparece en **sus** mascotas.
- **ACTO 4.** Hacer una **denuncia de maltrato** con evidencia, como ciudadana. Guardar el código. **ESPERA:** que el funcionario la trabaje.
- **ACTO 5.** Volver al comprobante con el código y ver si el estado cambió.
- **ACTO 6.** Proponerle a Ignacio una **transferencia** de una de sus mascotas. **ESPERA:** que él acepte.

### Línea 4 — Alejo, la contraparte de todos

Es quien desbloquea a los demás. **En cada vuelta, lo primero es mirar sus colas.**

- **ACTO 1.** Publicar en su **clínica** un servicio de antirrábica, definir agenda y materializar turnos. *(Si queda pendiente de aprobación, esa es una ESPERA sobre Lucas o el admin — anotala.)*
- **ACTO 2.** En su **refugio**: dar de alta un animal `CIU-`, publicarlo en adopción.
- **ACTO 3.** Resolver la postulación de Graciela y finalizar la adopción.
- **ACTO 4.** Proponerle un tránsito a Noelí.
- **ACTO 5.** Atender el turno de Ignacio y **firmar** la vacuna con su matrícula.
- **ACTO 6.** Un **walk-in**: alguien llega sin turno y le firma algo. Verificar que el dueño se entera.

---

## 6. Lo que hay que mirar en cada vuelta

Esto es lo que distingue este test de una checklist. En cada rotación, por persona:

1. **¿Lo que esperaba ya pasó?** ¿Cómo me enteré: notificación, badge, o tuve que ir a buscarlo?
2. **Si pasó, ¿me lo dijo la app o lo descubrí yo?** Un cambio de estado que sólo se ve entrando a la pantalla exacta es un hallazgo.
3. **Si NO pasó, ¿la pantalla me dice que estoy esperando?** ¿O parece que no hice nada?
4. **¿Los números del otro lado coinciden con lo que hice?** Lucas es quien puede responder esto.

## 7. Zoonosis y alertas — qué esperar de verdad

**Las señales de vigilancia** salen de mordeduras y brotes: casos abiertos de tipo `bite_incident` y `outbreak_investigation`, más eventos de señal de brote. Una denuncia de maltrato **no** es señal epidemiológica y no debería aparecer en ese mapa — si aparece, es hallazgo.

**Las alertas se disparan por un cron diario, no al instante.** Crear la condición hoy no produce una alerta ahora. **No reportes como bug que la alerta no llegó durante la corrida.** Sí reportá:

- si el formulario de suscripción **promete** algo distinto de lo que hace,
- si no queda claro **cuándo** va a evaluarse,
- si el umbral que elegiste no se entiende.

## 8. Lo que NO es hallazgo

- Los tableros de **Panorama y Padrón** corren sobre un cubo nocturno: no se mueven en vivo.
- Los datos previos son **siembra**: nombres raros y cantidades poco realistas son esperables.
- El **mapa provincial** puede mostrar pocas burbujas o ninguna — hay supresión por privacidad con números chicos.
- La **tasa de reunificación** corre sobre muy pocos casos y no es representativa.
- La ficha pública de `/adoptar` muestra **sólo el booleano** de microchip, sin dígitos: es decisión de privacidad.

Si algo de esto está **mal comunicado en la pantalla**, eso sí es hallazgo. La diferencia es entre "el dato está mal" (no) y "la pantalla no me avisa que el dato es de anoche" (sí).

---

## 9. El entregable

**Datos y hallazgos salen de la misma pasada.** No hay una segunda vuelta de revisión: no se puede revisar "finalizar adopción" sin finalizar una.

1. **Bitácora de rotación** — por vuelta y por persona: qué avanzó, qué quedó esperando, y **si al volver la espera se había resuelto y cómo se enteró**.
2. **Hallazgos**, con: dónde, qué esperaba, qué pasó, y cuánto frenó (*me trabó · dudé · sólo me molestó*).
3. **Tabla de todo lo creado** con prefijo `CIU-`: tipo, nombre, token público, cuenta creadora y flujo que lo creó.
4. **Lo que no pudiste probar** y por qué. Vale tanto como un hallazgo.
5. **El antes y el después de Lucas**: qué mostraban sus pantallas al empezar y al terminar, y si la diferencia se corresponde con lo que realmente ocurrió.

### Las tres preguntas del final

1. ¿En qué momento **no supiste si algo había pasado**?
2. ¿Alguna vez **hiciste algo dos veces** porque no estabas seguro de que hubiera salido?
3. ¿Hubo algún número, en cualquier pantalla, que **no le creíste**?
