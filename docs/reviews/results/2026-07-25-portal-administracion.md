# Revisión adversarial — Portal de administración, gobernanza y configuración

**Fecha**: 2026-07-25
**Alcance**: `/admin/*` y `/gob/*` — panel de administración, consola de reglas, auditoría, sistema, inteligencia, libro de eventos, directorios y suscripciones.
**Método**: navegación real contra `localhost:3000` con dos sesiones (`admin@dim.test` SUPERADMIN universal, `govt@dim.test` GOB con 3 localidades/3 provincias), 24 capturas, sin mutaciones.

---

## 1. `/admin` — Panel de administración

**El escenario**: es lunes a la mañana. Una persona con rol SUPERADMIN abre el panel para saber si algo se rompió durante el fin de semana antes de arrancar con el resto del día.

**Cómo ayuda**: una fila de colas (`APROBACIONES · 1 PENDIENTES`, `ALERTAS ABIERTAS`, `VENCIMIENTOS DE SLA (OUTBOX) · 12`, `CASOS ABIERTOS · 2051`) más métricas de sistema (usuarios personales, instituciones activas, decisiones 7d). El texto "Estas colas se comparten con Gobierno, que las trabaja acotadas a su jurisdicción" declara explícitamente el modelo de scope compartido.

**Qué es débil o engañoso**: las tarjetas son solo contadores — ninguna es clickeable hacia el ítem individual desde el panel mismo (hay que ir a "Ver cola completa"). `CASOS ABIERTOS: 2051` no tiene ninguna urgencia visual pese a ser el número más grande de la pantalla — comparado con `VENCIMIENTOS DE SLA` que sí está en rojo. La sección "Novedades · Últimos 7 días" apareció vacía en esta corrida — no puedo distinguir si es un estado real ("nada pasó") o un bug de agregación, y el panel no lo aclara.

**Mejoras futuras** (por palanca): (1) severidad visual proporcional al número, no solo al nombre de la cola; (2) drill-down directo desde la tarjeta; (3) un indicador de "última verificación exitosa" del panel mismo, ya que hoy la sección Novedades vacía es ambigua.

---

## 2. `/admin/reglas` y `/admin/reglas/nueva` — consola de reglas de negocio

**El escenario**: CABA quiere agregar el Bull Terrier a su lista de razas PPP local sin tocar el default nacional. El SUPERADMIN entra a crear la regla.

**Cómo ayuda**: `/admin/reglas` lista jurisdicciones con reglas propias contra el "Defaults nacionales (referencia)" — Palermo/CABA ya tiene un override de "Lista de razas PPP" (Dogo Argentino, Pit Bull, Rottweiler) marcado con la etiqueta `Override localidad`. El wizard de creación (`/nueva`) es guiado en 4 pasos, empezando por elegir provincia — bajo riesgo de error por alcance incorrecto.

**Qué es débil o engañoso**: en la pantalla de reglas **no hay ningún historial de cambios visible** — no se ve quién creó el override, cuándo, ni qué reemplazó. Comparado con el Libro de eventos (append-only, con reproducción histórica) o con la Inteligencia territorial (que sí cuenta "CAMBIOS DE REGLAS · 12 analizados" como métrica agregada), la consola de reglas en sí misma no expone ese detalle — un auditor que quiera reconstruir "¿quién decidió agregar el Bull Terrier y por qué" tiene que salir a otra pantalla (Auditoría) y buscar manualmente, sin garantía de que el evento quede etiquetado de forma reconocible como cambio de regla (ver hallazgo de Auditoría, sección 4).

**Futuras mejoras**: (1) un renglón "última modificación: {actor}, {fecha}" directamente en cada regla; (2) enlazar cada override a su entrada de auditoría correspondiente con un link directo, no solo "buscar y esperar encontrarla".

---

## 3. `/gob/reglas` — el gemelo de gobierno

**El escenario**: un operador de Gobierno en Tierra del Fuego quiere saber qué reglas rigen su jurisdicción antes de resolver un caso, pero no tiene permiso para tocarlas.

**Cómo ayuda**: esta es, de las 23 pantallas revisadas, la que mejor declara el límite de rol en texto plano: *"Vista de solo lectura, pre-filtrada a tus localidades asignadas. La administración de reglas la hace el admin nacional."* Muestra la jurisdicción real del usuario (Ushuaia, Tierra del Fuego) con todos sus valores efectivos (razas PPP, ventana de observación antirrábica, formato de export a fiscalía citando la Ley 14.346), sin ningún control de edición visible.

**Contraste importante**: cuando se visita `/gob/reglas` con la sesión SUPERADMIN (no con la de gobierno), el chip de rol muestra `SUPERADMIN · NACIONAL` en vez de `· UNIVERSAL` — el mismo usuario ve un scope distinto según qué ruta pisa. Es un detalle sutil que puede confundir a un superadmin que no entienda por qué "Nacional" y "Universal" no son sinónimos en la UI.

**Qué es débil**: nada mutable, por diseño — que es justamente lo correcto acá. Único gap: no hay fecha de "última sincronización" de esta vista de solo lectura contra la fuente real, así que si el admin nacional cambia algo, el operador de gobierno no tiene forma de saber si lo que ve está actualizado al segundo o tiene caché.

---

## 4. `/admin/auditoria` — el registro de auditoría

**El escenario**: un auditor externo (o un fiscal, dado el export a MPF que vimos en reglas) pide reconstruir todas las acciones de autoridad de una fecha puntual.

**Cómo ayuda**: 200 entradas más recientes, filtrables por Actor, Acción y rango de fechas. Acciones repetidas se agrupan ("Mutación forzada de evento de mascota (override) ×50") con "tocá para expandir" y "ver filtradas" para no inundar la vista.

**Qué es débil o engañoso — el hallazgo más importante del informe**: el campo "Actor" en casi todas las entradas es un nombre de **cuenta de servicio o rol institucional** — "Administración MiMAR", "system:backfill-0039", "Travel Owner Test" — no una persona identificable. Para responder la pregunta central que el enunciado plantea ("¿puede un auditor reconstruir quién cambió qué y por qué?"): **no, no de forma directa**. "Administración MiMAR" puede ser cualquiera de las 4+ cuentas con rol ADMINISTRADOR/A que vimos en `/admin/admins` — el log no diferencia individuo dentro del rol salvo que la cuenta tenga un email humano distintivo. Además no encontré, en esta pantalla, ningún filtro por jurisdicción/provincia (sí existe en Libro de eventos) — inconsistencia de superficie de filtros entre dos pantallas que deberían responder preguntas similares.

**Futuras mejoras** (ranking por impacto): (1) **crítico** — todo evento de auditoría debería registrar el actor humano autenticado, no solo la cuenta de rol, si el objetivo es responsabilidad (accountability) real; (2) agregar filtro de jurisdicción a Auditoría, igual que en Libro; (3) exponer el "por qué" — hoy ninguna entrada de auditoría muestra una justificación o ticket asociado al cambio.

---

## 5. `/admin/sistema` — salud del sistema

**El escenario**: algo falló durante la noche (vencimientos de SLA) y el SUPERADMIN necesita un diagnóstico técnico rápido, no de negocio.

**Cómo ayuda**: métricas en vivo — `SLA ENO: 12 vencidas ahora (mediana de entrega 42h)`, aprobaciones pendientes, actividad por gobierno. Correctamente etiquetada "Solo admin" — Gobierno no tiene un gemelo de esta pantalla (confirmado: `/gob/sistema` en realidad resuelve a "Programa", el resumen ejecutivo de jurisdicción — ver sección 15 —, no a salud técnica). Ese es un límite de rol bien aplicado: operación técnica es admin-only, coherente con que Gobierno no debería ni necesita ver crons.

**Qué es débil**: la sección "Deriva de caché · pets.status" dice "El cron reconcile_pet_status todavía no registró corridas" — una alerta de posible drift de caché sin resolución visible ni botón de acción desde esta pantalla misma.

---

## 6. `/admin/sistema/crons` — salud de crons

**El escenario**: continuación directa de la anterior — click en "Ver detalle" de Crons.

**Cómo ayuda**: tabla completa de los 22 crons definidos en `vercel.json` con último run, antigüedad y salud, marcada explícitamente "HERRAMIENTA DE SISTEMA · SOLO LECTURA".

**Qué es débil o engañoso — hallazgo severo**: el resumen dice **"0 saludables · 22 con problemas"**. Todos los crons están en `SIN EJECUCIÓN` o `DESACTUALIZADO`, incluidos los que sostienen el ciclo de cumplimiento sanitario completo: `vaccine_due`, `close_rabies_observations`, `process_eno_queue`, `escalate_stale_welfare_cases`. Si esto reflejara producción real (y no es descartable que sea un artefacto del entorno de demo local, dado el banner "ENTORNO DE DEMOSTRACIÓN — DATOS SINTÉTICOS"), sería una falla operativa mayúscula: significa que ninguna automatización de vencimientos, escalamiento de casos de bienestar o cola de notificación obligatoria (ENO) corrió en más de un día. La pantalla en sí no distingue "esto es demo, no te asustes" de "esto es real, actuá ahora" — el banner ambiental de arriba de la página cubre parcialmente ese vacío pero no es específico a esta pantalla.

**Futuras mejoras**: (1) que la propia pantalla de crons distinga entorno demo vs producción con lenguaje explícito, no solo el banner global; (2) alerta activa/notificación cuando >N crons críticos llevan más de X horas sin correr, en vez de requerir que alguien entre a mirar la tabla.

---

## 7. `/admin/inteligencia` — inteligencia territorial

**El escenario**: el equipo de política pública quiere saber qué provincias están mejor/peor en cobertura antes de asignar presupuesto.

**Cómo ayuda**: índice compuesto por provincia (antirrábica, esterilización, chip), ordenable por índice o impacto, con "Registros fantasma" (0.6% del padrón sin titular ni actividad) y "Cambios de reglas" como métricas agregadas — buena señal de higiene de datos.

**Punto a favor explícito**: el subtítulo dice *"Señales agregadas por territorio — sin puntuación de personas"* — una declaración de diseño consciente de privacidad que vale la pena resaltar como buena práctica, no solo como funcionalidad.

**Qué es débil**: "Cambios de reglas · 12 analizados" es un número sin desglose ni link — no puedo saber, desde acá, cuáles 12 cambios fueron ni si están correlacionados con el drift de métricas que la misma pantalla mide.

---

## 8. `/admin/libro` — libro de eventos

**El escenario**: un fiscal necesita reconstruir la secuencia exacta de eventos de un caso — quién reportó qué y cuándo.

**Cómo ayuda**: registro append-only con filtros ricos (tipo de evento, rol del actor, provincia, localidad, rango de fechas) y un link "Ver situación a esta fecha" por fila — replay histórico real, no solo un log plano. El texto es explícito sobre el invariante: *"Las correcciones son eventos nuevos que referencian al original; el original se conserva."*

**Qué es débil**: mismo problema de identidad de actor que en Auditoría — la columna "Actor" muestra roles genéricos ("Sistema", "Lector de chip") en vez de personas, salvo para observaciones antirrábicas donde aparece la localidad en vez del individuo. Es coherente con el modelo de datos (muchos eventos son generados por sistema, no por personas), pero para los eventos que sí tienen un actor humano detrás valdría la pena mostrarlo acá también.

---

## 9–11. Directorio: `/admin/usuarios`, `/admin/admins`, `/admin/govts`, `/admin/organizaciones`, `/admin/directorio`, `/admin/servicios`

**El escenario combinado**: verificar que una organización, un usuario o un servicio son legítimos antes de darles alcance en la plataforma.

**Hallazgo de arquitectura de rutas**: `/admin/organizaciones` y `/admin/directorio` renderizan **exactamente la misma pantalla** (el componente "Directorio" con tabs Organizaciones/Usuarios/Servicios/Credenciales, tab "Organizaciones" activo por default). No es necesariamente un problema — es una consola unificada con la "misma gramática de registro: buscar, verificar, revocar" declarada en el subtítulo — pero como rutas separadas en el enunciado, vale aclarar que no hay dos pantallas distintas ahí, hay una.

**Cómo ayuda**: cada organización tiene razón social, CUIT, tipo, localidad, y un botón "Revocar verificación" — acción reversible y visible. `/admin/govts` muestra el estado real de una cuenta de gobierno recién creada: `alert-triage-govt` aparece con la etiqueta **"SIN LOCALIDADES — NO PUEDE OPERAR · 0 localidades"** — es decir, el sistema modela correctamente el estado "cuenta creada pero inoperante hasta asignación de jurisdicción".

**Qué es débil o confuso**: la tab "Usuarios" del Directorio, vista como SUPERADMIN, listó solo 4 resultados — todas cuentas con rol ADMINISTRADOR/A (`Administración MiMAR`, `alert-triage-admin`, `br-flow-admin`, `outbreak-test-admin`) — pese a que el dashboard reporta 5280 "usuarios personales" en el sistema. La misma tab, vista como Gobierno (`/gob/usuarios`), sí lista personas reales con roles operativos (Dra. Lilian Marrone · veterinaria, Bruno Segundo · dueño, Dra. Carla Pérez · dueña) sin necesidad de buscar. Esto sugiere que el listado por default de "Usuarios" para un SUPERADMIN no muestra dueños/veterinarios reales sin escribir una búsqueda explícita — inconsistente con la experiencia de Gobierno, y potencialmente confuso para un auditor que asuma que "Usuarios" ya muestra "todos los usuarios".

También noté ruido de datos de prueba sin filtrar: `/admin/admins` tiene un link "Mostrar 80 cuentas de prueba" y una sección colapsada "Cuentas de sistema (3)" — en un entorno de producción real, ¿esas 80 cuentas de prueba existirían? Si el patrón se traslada a producción sin poda, la lista de administradores se vuelve inútil para auditar quién tiene acceso real.

`/admin/servicios` (tab del Directorio) mostró estado vacío ("No hay servicios pendientes de revisión en tu cobertura") — no pude ejercitar el flujo de aprobación real en esta corrida.

---

## 12. `/admin/suscripciones` — alertas y suscripciones

**El escenario**: un analista de programa quiere que le avisen si la cobertura de esterilización de CABA cae debajo del 70%.

**Cómo ayuda**: modelo simple y correcto — "Cada suscripción es personal — solo ves y gestionás las tuyas". Vi una alerta activa real (`DEMO-alert-sterilization-caba` por debajo de 70, valor actual 38,4) con acciones Pausar/Eliminar. El formulario de creación deja provincia opcional ("dejá vacío para cobertura nacional") con una nota aclaratoria sobre qué métrica es siempre global ("Días sin atender").

**Qué es débil**: nada mutable ejercitado (por restricción de la tarea), pero el diseño "personal, no compartida" implica que si la persona que configuró la alerta se va de la organización, nadie hereda esa suscripción — ver sección de continuidad más abajo.

---

## 13. `/admin/acerca/integracion-miarg` — federación con Mi Argentina

**El escenario**: se le muestra a un funcionario o a un socio potencial cómo se vería la federación con Mi Argentina, la premisa fundacional del producto.

**Cómo ayuda**: la maqueta es honesta y clara — banner amarillo "Integración en desarrollo — vista ilustrativa" arriba, y el texto final reafirma: *"La autenticación con Mi Argentina (OIDC) está en desarrollo. Esta pantalla es una maqueta ilustrativa para el proceso de demo."* El botón "Acceder con Mi Argentina (próximamente)" no promete nada que no exista.

**Qué es débil o engañoso — dado que esto es la premisa fundacional del producto**: esta pantalla es una **maqueta estática sin ningún estado real de la integración** — no hay roadmap visible, no hay indicador de a qué % está el desarrollo del OIDC, no hay ningún link a documentación técnica o a un ticket de seguimiento. Para un funcionario de gobierno que está evaluando si confiar en la promesa de federación, la pantalla contesta "¿cómo se vería?" pero no contesta "¿cuándo llega?" ni "¿qué falta?". Es honesta por omisión pero no es informativa sobre progreso — riesgo de leerse como vaporware pese a la etiqueta de trabajo en curso.

**Nota positiva**: un console error 404 apareció durante la corrida de este batch (probablemente un recurso estático menor); no bloqueó el render ni until pude reproducirlo aislado — vale una revisión rápida de consola en esta ruta específica, sin urgencia.

**Mejora de mayor palanca**: agregar a esta pantalla misma un mini-estado de la integración (ej. "Fase actual: diseño de contrato OIDC" / "Próximo hito: piloto con 1 municipio") — convierte una maqueta en una señal de progreso real, que es lo que un socio institucional necesita ver.

---

## 14–19. Gemelos de Gobierno: `/gob/usuarios`, `/gob/organizaciones`, `/gob/directorio`, `/gob/servicios`, `/gob/sistema`, `/gob/suscripciones`

**El escenario**: un operador de Gobierno con jurisdicción en 3 localidades (CABA, Santa Cruz, Tierra del Fuego, chip `GOB · 3 LOCALIDADES · 3 PROVINCIAS`) necesita las mismas herramientas que un admin pero acotadas a su territorio.

**Cómo ayuda — y esto funciona bien**: el scoping por RLS se ve reflejado consistentemente en la UI. `/gob/organizaciones` y `/gob/directorio` (mismo componente, igual que en admin) muestran "Buscá entre las orgs en tus 3 localidades" y listan 1 de 1 resultado (Refugio Patitas del Norte, Palermo/CABA) contra las 12 universales que ve el SUPERADMIN. `/gob/usuarios` lista personas reales scoped a jurisdicción con acciones acotadas ("Revocar rol vet", "Proponer vet" — no "asignar" directo, sugiriendo un flujo de aprobación en dos pasos). `/gob/servicios` y `/gob/suscripciones` son funcionalmente paralelos a sus gemelos admin, con estado vacío correcto para esta jurisdicción de prueba.

**El hallazgo más interesante de este bloque**: `/gob/sistema` **no es un gemelo de `/admin/sistema`** — resuelve a la pantalla "Programa" (resumen ejecutivo de jurisdicción: KPIs, cobertura vs meta, calidad de datos, supervisión de PII). Es decir, Gobierno no tiene ---ni debería tener--- acceso a salud técnica de crons/SLA de infraestructura; en su lugar tiene un resumen de gestión de programa. Es un límite de rol correctamente aplicado y bien resuelto a nivel de ruta, aunque el nombre de la URL (`/gob/sistema`) es potencialmente confuso porque sugiere "sistema técnico" cuando en realidad entrega "programa/gestión".

**Dato duro que vale la pena resaltar**: el resumen ejecutivo de Gobierno muestra que **9 de 9 combinaciones provincia×métrica están bajo meta** en su jurisdicción — CABA con -44% en microchip (~217.021 mascotas sin chip), Tierra del Fuego con -55% en microchip. Es una pantalla que no maquilla los números feos.

**Supervisión de PII** en `/gob/sistema` muestra "Top actores por cantidad de consultas PII-sensibles" limitado a su jurisdicción — buen ejemplo de que el propio sistema de vigilancia interna (quién mira datos personales) también respeta el scope de gobierno, no solo los datos operativos.

---

## Factores de administración pública NO cubiertos por el sistema

Esta es la sección de mayor valor del informe: qué necesitaría una administración pública argentina real que hoy no tiene ningún lugar en la UI.

1. **Delegación formal de autoridad**: no hay ningún mecanismo de "delego mis permisos a X mientras estoy de licencia" ni un registro de quién actuó "en nombre de" otro. Si el SUPERADMIN universal está de vacaciones, no hay rastro de quién tomó decisiones en su ausencia ni bajo qué delegación.

2. **Acto administrativo o resolución que respalde un cambio de regla**: crear un override de regla (ej. agregar el Bull Terrier a razas PPP de CABA) no pide ni permite adjuntar un número de resolución, ordenanza o expediente que legalmente sustente el cambio. Curiosamente el sistema **sí** modela citas legales en otro lugar — el default nacional de "Formato de export a fiscalía" cita explícitamente "Ley 14.346" — pero esa práctica no se extiende al flujo de creación de reglas mismo. Un cambio de regla debería, como mínimo, poder referenciar el acto administrativo que lo origina.

3. **Política de retención y archivo**: la Auditoría dice "Últimas 200 entradas" y el Libro no muestra ningún límite de retención visible ni política de purga/archivo. No hay pantalla que diga "los eventos se conservan X años y luego se archivan/anonimizan según la ley Y".

4. **Obligaciones de transparencia y datos abiertos**: no hay ninguna superficie de exportación pública de datos agregados (dataset abierto, portal de transparencia) más allá de la analítica interna. Para un organismo público argentino, la Ley de Acceso a la Información Pública (27.275) suele exigir publicación proactiva de cierta información — no vi ningún rastro de esa obligación modelada.

5. **Convenios interjurisdiccionales**: el sistema filtra por provincia/localidad pero no modela acuerdos formales entre jurisdicciones (ej. CABA y Provincia de Buenos Aires compartiendo un refugio, o un convenio de reciprocidad de credenciales). Cada jurisdicción aparece como una unidad aislada, sin relación explícita con otras.

6. **Onboarding de un nuevo municipio**: vimos en vivo el estado intermedio — una cuenta de gobierno (`alert-triage-govt`) creada pero "SIN LOCALIDADES — NO PUEDE OPERAR". El botón "+ Crear gobierno" existe, pero no hay ningún flujo visible de: asignar localidades en lote, notificar al nuevo operador, generar credenciales iniciales, ni un checklist de "onboarding completo". Es el gap más concreto y accionable de todo el informe porque literalmente lo capturamos en pantalla.

7. **Continuidad ante rotación de personal**: no hay ningún mecanismo de sucesión o traspaso — si la persona detrás de una cuenta ADMINISTRADOR/A se va, sus suscripciones personales (sección 12), sus reglas creadas y sus decisiones de auditoría quedan atadas a una cuenta que nadie más puede reclamar o reasignar de forma auditable. Contrasta con "Cada suscripción es personal — solo ves y gestionás las tuyas", que es correcto para privacidad pero un problema para continuidad institucional si no hay traspaso.

---

## Resumen de hallazgos por severidad

- **Crítico**: identidad de actor en Auditoría y Libro son cuentas de rol, no personas — compromete la trazabilidad real ("¿quién cambió qué?").
- **Crítico** (si no es artefacto de demo): 0/22 crons saludables en `/admin/sistema/crons`, incluidos los que sostienen vencimientos sanitarios y cola ENO.
- **Alto**: no hay versionado ni registro de "quién/cuándo/por qué" visible directamente en la consola de reglas.
- **Alto**: onboarding de un nuevo municipio se corta en un estado inoperante sin flujo de continuación visible.
- **Medio**: inconsistencia entre lo que "Usuarios" del Directorio muestra según el rol (admin ve cuentas de servicio, gobierno ve personas reales).
- **Medio**: la pantalla de federación con Mi Argentina no comunica progreso/roadmap, solo un mockup estático.
- **Bajo**: ruido de datos de prueba (80 cuentas, cuentas de sistema) sin poda visible en listados de administradores.
