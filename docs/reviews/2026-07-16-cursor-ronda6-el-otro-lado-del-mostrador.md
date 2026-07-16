# Ronda 6 (Cursor) — El otro lado del mostrador

Fecha: 16 de julio de 2026  
Entorno: `http://localhost:3001`  
Perspectivas: dueña primeriza, veterinaria con sala llena y refugio desbordado

## TL;DR

Una persona normal puede inscribir una mascota, reportarla perdida y volver a encontrarla, pero necesita paciencia frente a controles tapados y navegaciones que parecen no responder.
La veterinaria logra registrar una antirrábica en un flujo razonablemente corto, aunque la confirmación queda trabada en “Cargando…” y la dueña no recibe una notificación.
El flujo más delicado no llega a destino: el refugio crea un animal sin dueño, pero una contradicción de custodia impide declararlo apto, publicarlo y transferirlo.

## Hallazgos priorizados

### BLOQUEA — Un animal recién ingresado por el refugio no puede declararse apto para adopción

**Pantalla:** ficha de `QA6-SinDueño` → “Elegibilidad para adopción”.

**Esperaba:** marcar “Apta para adopción”, confirmar y continuar con la publicación y la adopción.

**Vi:** la ficha decía simultáneamente “Rol de custodia: Custodia del refugio”, pero al confirmar apareció: “Mascota no encontrada o no está bajo custodia de tu organización”. El estado quedó “Sin determinar”. La pantalla de finalización repitió que la mascota no había sido evaluada y rechazó la operación.

El error se reprodujo de forma consistente por tres caminos distintos: (a) la hoja “Elegibilidad” abierta desde la ficha, (b) el enlace “Elegibilidad” en línea del listado de mascotas en custodia, y (c) el intento de “Finalizar adopción”, que devolvió “Esta mascota no fue evaluada para adopción todavía. Marcala como apta desde su perfil antes de finalizar.”

No es un problema de permisos ni de organización equivocada: el animal aparece en el listado “Mascotas en custodia” del mismo refugio (7 animales, `QA6-SinDueño` incluido), su ficha muestra “Custodia del refugio”, el token de organización de la URL es el correcto, y otras mascotas del mismo refugio sí figuran como “Apta”/“Publicada”. La contradicción es entre lo que la lectura muestra (el refugio tiene la custodia) y lo que la acción de escritura afirma (que no la tiene) — apunta a que la acción resuelve la custodia por un camino distinto al de la pantalla, no a falta de acceso.

**Pasos para reproducir:**
1. Entrar como `alejo@dim.test`.
2. Elegir “Refugio Patitas del Norte”.
3. Click real en “Registrar ingreso” y luego “+ Nuevo ingreso”.
4. Crear un animal sin chip bajo “Custodia temporal”; sujeto usado: `QA6-SinDueño` (`DIM-98SB-V7H8`).
5. Abrir “Elegibilidad” (desde la ficha o desde el enlace en línea del listado), elegir “Apta para adopción” y confirmar.
6. El sistema responde que el animal no está bajo custodia de la organización, aunque la ficha y el listado afirman lo contrario.

**Impacto:** bloquea los casos 4 y 5 completos: no se puede publicar al animal ni concretar el cambio de responsable legal.

### ALTO — Dos transiciones válidas de la veterinaria quedan indefinidamente en “Cargando…”

**Pantalla:** `/org/.../atender` al buscar la mascota y luego de registrar la vacuna.

**Esperaba:** ver inmediatamente la mascota encontrada y, después del submit, una confirmación inequívoca.

**Vi:** después de buscar `DIM-TTB2-2VH8`, la URL cambió pero la página quedó únicamente en “Cargando…”. Esperé aproximadamente 5 segundos y seguía igual; una recarga mostró las opciones clínicas. Después de “Registrar vacuna” ocurrió lo mismo: la URL cambió a `?firmado=1`, pero la vista siguió en “Cargando…” durante más de 2,5 segundos y requirió recarga.

**Pasos para reproducir:**
1. Entrar como `lilian@dim.test`.
2. Click real en “Registrar / firmar evento clínico”.
3. Ingresar `DIM-TTB2-2VH8` y click en “Buscar mascota”.
4. Observar “Cargando…” persistente; recargar.
5. Elegir “Vacuna”, completar “Antirrábica” y click en “Registrar vacuna”.
6. Observar nuevamente “Cargando…” persistente.

**Impacto:** en una sala llena, la veterinaria no sabe si debe esperar, repetir o recargar; repetir el submit podría generar miedo a duplicar un asiento inmutable.

### ALTO — Carla no recibe ninguna notificación por la vacuna cargada por la veterinaria

**Pantalla:** `/notificaciones` de `carla@dim.test`.

**Esperaba:** una notificación del tipo “La Dra. Marrone registró la antirrábica de QA6-Cachorro”.

**Vi:** la bandeja tenía tres notificaciones: mascota encontrada, matrícula aprobada y bienvenida. No había ninguna sobre la vacuna. La antirrábica sí figuraba en la libreta al abrir manualmente la mascota.

**Pasos para reproducir:**
1. Registrar la antirrábica como `lilian@dim.test`.
2. Cerrar sesión e ingresar como `carla@dim.test`.
3. Click real en “Notificaciones”.
4. Revisar la bandeja completa.

**Impacto:** la dueña se tiene que enterar por la veterinaria o descubrir el asiento por casualidad.

### ALTO — La credencial de un animal sin dueño invita a “avisarle al dueño”, pero no ofrece un medio para hacerlo

**Pantalla:** credencial pública anónima `/p/DIM-98SB-V7H8`.

**Esperaba:** que un animal bajo custodia del refugio mostrara al refugio como contacto, o una explicación honesta de que no tiene dueño registrado.

**Vi:** “¿Encontraste a esta mascota? Tocá acá para avisarle al dueño.” Sin embargo, no había dueño y tampoco había botón ni formulario interactivo para avisar. La credencial tampoco identificaba al refugio que acababa de ingresarlo.

**Pasos para reproducir:**
1. Crear un ingreso sin dueño bajo custodia del refugio.
2. Abrir su credencial pública sin sesión.
3. Leer el bloque de contacto e intentar actuar.

### MEDIO — La credencial pública acusa una vacuna, pero no permite comprobar cuál fue

**Pantalla:** credencial pública `/p/DIM-TTB2-2VH8`.

**Esperaba:** comprobar que la nueva antirrábica, cargada segundos antes, estaba registrada.

**Vi:** el estado cambió a “Vacunación · Con registros”. Eso confirma que algo llegó, pero no muestra “Antirrábica”, fecha de aplicación ni vigencia. En la libreta privada sí aparece “Antirrábica”, aplicada el 16/7/2026, vence el 16/7/2027 y verificada por vet.

**Impacto:** la consistencia técnica existe, pero un vecino o tercero no puede distinguir una antirrábica vigente de cualquier otro registro vacunal.

### MEDIO — El camino “Publicar adopción” manda a resolver un requisito en otra pantalla sin ofrecer un acceso directo

**Pantalla:** `/org/.../mascotas/DIM-98SB-V7H8/adoptar`.

**Esperaba:** que el CTA posterior al ingreso me dejara completar todos los requisitos en secuencia.

**Vi:** la pantalla indicó “Marcala apta primero en la pestaña de Elegibilidad”, pero allí no había pestaña ni enlace de elegibilidad. Tuve que volver por el breadcrumb a la ficha y recién entonces apareció la acción.

**Pasos para reproducir:**
1. Crear un ingreso.
2. Click real en “Publicar adopción” desde el comprobante.
3. Buscar en esa pantalla el acceso a “Elegibilidad”.

### MEDIO — En celular, controles válidos quedan debajo de la navegación fija

**Pantallas:** alta de mascota y cierre del reporte de pérdida, a 390 px.

**Esperaba:** tocar una sugerencia de localidad o un CTA visible una sola vez.

**Vi:** la sugerencia “La Plata” y luego “Ver perfil” fueron interceptadas por elementos fijos. Hubo que desplazar expresamente el control; en un caso ni eso alcanzó y fue necesario seguir el destino del enlace por otra vía. El mismo patrón reapareció en desktop al intentar el click real en el enlace “Adoptar” del pie: la navegación fija interceptó el primer click.

### MEDIO — La libreta sanitaria mezcla registros clínicos con telemetría y estados administrativos

**Pantalla:** dorso “Libreta” de `QA6-Cachorro`.

**Esperaba:** una libreta médica fácil de presentar en una consulta.

**Vi:** bajo “Asientos · 8 registros” aparecieron cuatro escaneos de credencial y los cambios “Marcada como perdida/encontrada”, además de la vacuna. La antirrábica está bien presentada, pero queda enterrada entre telemetría y estados no clínicos.

### MEDIO — Tras reportar la pérdida, no queda claro quién fue avisado

**Pantalla:** resultado del trámite de mascota perdida.

**Esperaba:** una frase concreta: “Actualizamos la credencial y avisamos a X refugios/personas”, o “Todavía no avisamos a nadie; compartí este enlace”.

**Vi:** el estado y la credencial cambiaron correctamente, pero no obtuve una lista concreta de destinatarios. Como dueña, sólo podía suponer que la credencial pública era el mecanismo de difusión.

### BAJO — El alta no explica qué hacer físicamente con el QR

**Pantalla:** final del alta de `QA6-Cachorro`.

**Esperaba:** una recomendación corta y accionable: guardar la credencial, imprimir una chapita/cartel, presentarla al veterinario o compartirla.

**Vi:** obtuve una credencial y un código, pero no una explicación suficiente para una dueña que nunca oyó hablar de MiMAR. La utilidad se entiende explorando después, no en el momento de cierre.

### IDEA — Cerrar cada mutación con un recibo de “qué cambió y quién se enteró”

Después de alta, pérdida, encuentro, vacuna, elegibilidad y transferencia, mostrar siempre:
- qué estado quedó vigente;
- qué superficie pública cambió;
- quién recibió una notificación;
- qué acción sigue y si todavía falta confirmación de otra parte.

## El hilo conductor

| Cambio realizado | Qué mostró después la credencial pública sin sesión | ¿Coincidían? |
|---|---|---|
| Alta de `QA6-Cachorro` | `QA6-Cachorro`, credencial “Activa”, vacunación sin registros, sin microchip | Sí |
| Reporte de pérdida de `QA6-Cachorro` | Título “SE BUSCA: QA6-Cachorro” y estado “ESTÁ PERDIDO” | Sí, inmediatamente |
| Marcado como encontrada | Volvió a “QA6-Cachorro · Credencial MiMAR” y estado “Activa” | Sí, inmediatamente |
| Antirrábica cargada por la Dra. Marrone | “Vacunación · Con registros” | Parcial: refleja un registro nuevo, pero no identifica la antirrábica ni su vigencia |
| Ingreso de `QA6-SinDueño` bajo custodia del refugio | Credencial “Activa”, sin vacunas ni chip | Parcial: el animal existe, pero el bloque de contacto habla de un dueño inexistente y no muestra al refugio |

No hubo cambio de elegibilidad, publicación ni transferencia: los tres intentos fueron rechazados antes de mutar el estado. Por eso no se consignan como cambios exitosos.

## Callejones sin salida

### Publicación de `QA6-SinDueño`

Quedé en la hoja “Elegibilidad para adopción”. El sistema dijo que la mascota no estaba bajo custodia de la organización, mientras la ficha de la misma pantalla decía “Custodia del refugio”. No encontré una acción alternativa para corregir esa contradicción sin salir del papel asignado.

### Transferencia / finalización de adopción

La pantalla permitió completar DNI y nombre del adoptante, pero al confirmar indicó que primero debía resolverse la elegibilidad. Como la elegibilidad estaba bloqueada por el error anterior, la transferencia no ocurrió. No quedó nadie “dueño a medias”: no hubo mutación.

### Vista pública del nuevo adoptante

No se pudo evaluar porque la transferencia no llegó a concretarse. La credencial pública permaneció en el estado previo.

## Lo que funciona muy bien

- La pérdida y el encuentro se reflejan inmediatamente en la credencial pública. El cambio “SE BUSCA” / “Activa” es claro y consistente.
- El alta de un animal realmente sin dueño existe: el flujo acepta “Animal en la vía pública” y “Custodia temporal” sin inventar una persona propietaria.
- El comprobante de ingreso explica que el animal quedó bajo custodia y entrega un token visible.
- El flujo clínico pide el código que trae el dueño y no expone datos familiares innecesarios. La veterinaria vio nombre, especie, token y su propia firma profesional; no necesitó información privada de Carla.
- La carga clínica puede completarse en cuatro clicks principales desde el panel: módulo clínico → buscar → vacuna → registrar, además de escribir el token y elegir la vacuna.
- La antirrábica quedó correctamente detallada en la libreta privada: aplicada el 16/7/2026, vence el 16/7/2027, atribuida a la Clínica Veterinaria Recoleta y verificada por veterinario.
- La galería `/adoptar` explica bien qué ofrece, muestra refugio, historia, ubicación y atributos; las fichas existentes sí dan contexto para elegir.
- El sistema rechazó la finalización inválida en vez de dejar una propiedad intermedia o silenciosamente inconsistente.

## Anexo

### Casos cubiertos

- Caso 1: alta móvil de mascota propia y revisión pública.
- Caso 2: pérdida, revisión pública, encuentro y segunda revisión pública.
- Caso 3: antirrábica por veterinaria, revisión pública, revisión de libreta privada, privacidad y notificaciones.
- Caso 4: ingreso sin dueño; intento de elegibilidad y publicación; revisión pública y galería de adopción.
- Caso 5: intento de finalización con adoptante preliminar.
- Caso 6: navegación libre por app personal del operador del refugio y galería pública.

### Qué quedó afuera y por qué

- Publicación efectiva de `QA6-SinDueño`: bloqueada por el error de elegibilidad/custodia.
- Postulación pública sobre ese animal: no podía aparecer en `/adoptar`.
- Transferencia efectiva y verificación de ambas partes: bloqueadas por el mismo requisito.
- Cancelación a mitad de transferencia: no existió una transferencia iniciada que pudiera cancelarse.
- Confirmación del nuevo dueño en la credencial pública: no hubo cambio de dueño.
- No se ingresó a `/admin`, no se resolvió ninguna cola de operador y no se modificaron las mascotas ni organizaciones prohibidas.

### Mutaciones realizadas

1. `QA6-Cachorro` — `DIM-TTB2-2VH8`
   - creada por `carla@dim.test`;
   - marcada perdida;
   - marcada encontrada;
   - antirrábica registrada por `lilian@dim.test`, fecha 16/7/2026, próxima dosis 16/7/2027.
2. `QA6-SinDueño` — `DIM-98SB-V7H8`
   - creado por `alejo@dim.test` para Refugio Patitas del Norte;
   - origen “Animal en la vía pública”;
   - custodia temporal del refugio;
   - lugar informado: Palermo, CABA;
   - edad estimada: 2 años; pelaje marrón; sexo desconocido;
   - caso visible en bandeja: `CAS-3QN5-HKF4`.

### Intentos sin mutación

- Marcar `QA6-SinDueño` apto para adopción: rechazado (reintentado en distinta sesión, mismo resultado).
- Publicar `QA6-SinDueño`: bloqueado por elegibilidad.
- Finalizar adopción a “QA6 Adoptante Prueba”, DNI de prueba `33445566`: rechazado antes de crear la transferencia (“no fue evaluada para adopción”).

### Caso 6 — prueba de acceso indebido (no es hallazgo)

Intenté “meterme donde no debería”: como `alejo@dim.test` (operador de refugio) tecleé la URL del portal de otra organización, “Clínica Veterinaria Recoleta” (`DIM-R5GX-838G`), y me dejó entrar como “Administrador/a” con todas las capacidades concedidas. Antes de reportarlo como fuga de permisos lo verifiqué en “Mi cuenta → Mis organizaciones”: `alejo` figura como Administrador/a de las cuatro organizaciones (Refugio Patitas del Norte, Clínica Veterinaria Recoleta, Red de Rescate Puerto Madero y Mascotas BA Centro). El acceso era legítimo, así que **no lo cuento como hallazgo** — lo dejo asentado para que quede claro que se probó el límite y el sistema no filtró nada indebido.

### Nota de contexto del personaje

La cuenta provista para Carla ya figuraba como “Dra. Carla Pérez”, con matrícula aprobada y opciones veterinarias. Pude completar la perspectiva de dueña sobre su mascota, pero no era una cuenta limpia de “dueña primeriza”; esto limita la pureza del personaje y se tuvo en cuenta al interpretar la ronda.
