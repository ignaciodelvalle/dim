# Revisión de la bandeja operativa — 2026-07-25

Alcance: `/gob/casos`, `/gob/cola`, `/gob/disputas`, `/gob/decomisos`, `/gob/decomisos/nuevo`, `/gob/moderacion`, `/gob/outbox`, `/gob/perdidas`, `/gob/operativos`, y sus gemelos `/admin/*`. Sesión: `admin@dim.test`, SUPERADMIN. Entorno: localhost:3000, datos sintéticos.

---

## 1. `/gob/casos` — "¿Qué expediente necesita mi próxima acción?"

**Escenario**: un/a administrador/a nacional (o de jurisdicción) necesita saber, al sentarse a trabajar, cuál de los 2.051 expedientes abiertos requiere atención hoy — no una lista cronológica, sino una cola priorizada.

**Cómo ayuda**: filtros por tipo, provincia y estado; orden por "Urgencia" o "Recientes"; cabecera declara explícitamente el recorte: **"Mostrando los 50 más recientes de 2.051"**. El separador de miles usa el punto es-AR correctamente (2.051, no 2,051 ni 2051). Buena práctica que no se ve en otras pantallas del sistema (ver `/gob/operativos` más abajo).

**Débil / engañoso**:
- El botón "Urgencia" está seleccionado por defecto pero la tabla no expone ninguna columna de urgencia, antigüedad o SLA — no hay forma de auditar por qué un caso aparece antes que otro. Es una caja negra.
- Al entrar al detalle de un caso real (`/gob/casos/CAS-T9TK-MUMX`, mascota perdida, abierto hace minutos), la pantalla es un **callejón sin salida absoluto**: título, estado ABIERTO, quién lo abrió, jurisdicción, motivo, y una "Línea de tiempo" que dice literalmente *"Todavía no hay eventos registrados en este caso."* No hay un solo botón de acción — ni cerrar, ni escalar, ni contactar al denunciante, ni asignar. El único link es "Ver mascota →". Evidencia: `ops5-15-caso-detalle.png`. Para un caso que por definición vive del principio invariante de "eventos append-only", que la primera pantalla de detalle no ofrezca ninguna forma de generar el próximo evento es una falla estructural, no cosmética.
- La pestaña "Disputas" dentro de la misma pantalla (`/gob/disputas`) sólo tiene filtro Todos/Abiertos/Cerrados — sin provincia, sin tipo, sin orden por urgencocia. Es la misma "gramática de expediente" prometida en el subtítulo, pero con un tercio de las herramientas de filtrado. Con 1 sola disputa en el sistema hoy no se nota, pero no escala.

**Mejoras futuras** (por impacto):
1. Alta: dar acciones reales a la pantalla de detalle de caso — como mínimo "agregar nota", "cerrar caso", "escalar". Sin esto la pantalla no es operativa, es un visor.
2. Media: exponer el criterio de "Urgencia" (¿antigüedad? ¿severidad declarada? ¿tipo de caso?) como columna o tooltip.
3. Media: unificar filtros entre Casos y Disputas.

**Factores de administración pública no cubiertos**: no hay asignación de expediente a un/a agente o equipo (¿quién es responsable de CAS-T9TK-MUMX ahora mismo?); no hay número de expediente formal vinculado (solo el código interno DIM); no hay plazo o compromiso de respuesta al ciudadano; no hay registro de notificación al denunciante ni al tenedor de la mascota; no existe derivación inter-jurisdiccional visible (si Mendoza no actúa, ¿escala a Nación?).

---

## 2. `/gob/cola` — en realidad es la pantalla de Aprobaciones

**Escenario**: la ruta `/gob/cola` no lleva a una "cola de casos" separada — renderiza `Aprobaciones` (matrículas veterinarias, verificación de organizaciones, credenciales RUPGA). Un/a oficial que use ese link espera una bandeja de trabajo distinta y se encuentra con la misma pantalla accesible desde el nav "Aprobaciones".

**Cómo ayuda**: cuando se entra al ítem real (clic en el solicitante, no en la pestaña de filtro), la ruta cambia a `/gob/cola/APR-8RFB-E924` y ahí sí hay una pantalla de detalle completa y bien resuelta: datos del aplicante, detalle de la solicitud (matrícula, jurisdicción, especialidad), un bloque "Consulta del registro oficial" con link al Colegio/Consejo profesional correspondiente y la advertencia explícita *"El número de matrícula es autodeclarado por el aplicante: verificalo contra el registro antes de decidir"*, y tres botones de decisión: Aprobar / Rechazar / Pedir más información. Evidencia: `ops6-17-aprobacion-item-click.png`.

**Débil / engañoso**:
- Nomenclatura confusa: la URL `/gob/cola` no comunica "Aprobaciones". Si es un alias legado, debería redirigir a `/gob/aprobaciones` con URL visible consistente, no servir el contenido bajo una ruta con nombre distinto.
- En la pantalla de decisión no hay ningún campo de motivo/comentario visible antes de los botones Aprobar/Rechazar — no se pudo confirmar si al hacer clic aparece un modal que pide justificación (no se ejecutó la acción por ser destructiva), pero visualmente la pantalla no anticipa que se vaya a registrar un "por qué". Dado el invariante de eventos append-only, cada aprobación/rechazo debería dejar una razón legible en el historial, no solo un botón.
- Solo 1 solicitud pendiente en todo el sistema — no se pudo evaluar cómo se comporta la cola bajo volumen (paginación, orden, filtro por antigüedad).

**Mejoras futuras**:
1. Alta: campo de motivo obligatorio en Rechazar y en Pedir más información (Aprobar puede ser opcional).
2. Media: renombrar la ruta o al menos el breadcrumb para que no diga "Aprobaciones" cuando se llegó por `/gob/cola`.

**Factores de administración pública no cubiertos**: no hay historial de decisiones anteriores del mismo profesional (¿es la primera vez que pide matrícula o ya fue rechazado antes?); no hay SLA de respuesta al aplicante; no hay registro de qué funcionario decidió (mostrado en la UI, aunque puede estar en el log de auditoría que no se revisó en esta pasada).

---

## 3. `/gob/decomisos` — Ley 14.346

**Escenario**: un/a inspector/a de bienestar animal necesita ver todos los episodios de custodia oficial (decomisos), saber cuáles siguen abiertos sin refugio asignado, y accionar la devolución o el cierre.

**Cómo ayuda**: tarjeta "Decomisos del período" con selector de rango (7/30/90 días, 12 meses, año en curso, personalizado); por cada episodio se ve estado (CERRADO / EN CUSTODIA OFICIAL SIN REFUGIO ASIGNADO), antigüedad en días, fecha de apertura/cierre, y botones de acción directos "Ver caso" y, cuando corresponde, "Devolver al dueño" en la propia fila — evita un clic extra para la acción más común.

**Débil / engañoso**:
- El selector de período (30 días por defecto) muestra **"0 incautaciones por Ley 14.346"** mientras la lista inmediatamente debajo despliega decenas de episodios con fechas de apertura en junio. Esto no es un bug de datos (el subtítulo aclara "Todos los episodios de custodia del sistema", o sea la lista no está filtrada por período), pero la yuxtaposición es confusa: un/a inspector/a que mire rápido el "0" puede asumir que no hay nada para revisar este mes, cuando la lista de abajo —que sí requiere acción, como los "SIN REFUGIO ASIGNADO"— no tiene relación con ese número. El control de período debería o filtrar también la lista, o etiquetarse más claramente como "solo aplica al indicador de arriba".
- Sin filtro por provincia/jurisdicción en esta pantalla (a diferencia de Casos y Pérdidas), pese a ser Ley 14.346 con competencia potencialmente provincial.

**Mejoras futuras**:
1. Media-alta: que el filtro de período también recorte la lista, o renombrar el control para que quede claro su alcance real.
2. Media: agregar filtro por provincia/jurisdicción y por estado (abierto/cerrado/sin refugio).

**Factores de administración pública no cubiertos**: sin plazo reglamentario visible para la reubicación del animal decomisado (más allá del "7 días para aceptar/rechazar" que sí aparece en el alta); sin alerta de vencimiento cuando un episodio "sin refugio asignado" lleva 35 días abierto (visto en pantalla, sin ningún indicador de riesgo/alerta pese a ser un plazo largo para un animal en custodia oficial).

---

## 4. `/gob/decomisos/nuevo` — formulario "Ejecutar decomiso" (solo vista, no se envió)

**Escenario**: un/a inspector/a en el momento del operativo necesita registrar la incautación de un animal por autoridad sanitaria.

**Cómo ayuda**: formulario claro en 3 pasos — sujeto del decomiso (mascota registrada por token DIM-XXXX-XXXX o animal callejero sin registrar), motivo (select con opciones normadas: maltrato físico, abandono extremo, hoarding, tráfico, sin resguardo, pelea de perros, otro), expediente judicial opcional, estado del animal al momento del decomiso, y selección de refugio destinatario (solo refugios/redes verificados, con la regla de negocio "7 días para aceptar o rechazar el handoff" explicitada en el propio formulario). El aviso "Requiere mínimo 2 adjuntos (foto del animal + acta administrativa)" está arriba de todo, antes de que el usuario invierta tiempo llenando el resto.

**Débil / engañoso**:
- El campo "Denuncia de maltrato vinculada" está deshabilitado con la nota "Para vincular una denuncia, iniciá el decomiso desde la denuncia de maltrato con el botón 'Ejecutar decomiso'" — correcto como diseño, pero significa que si un/a inspector/a llega a este formulario por la ruta directa (como se hizo en esta revisión) y el decomiso sí viene de una denuncia previa, tiene que abandonar el formulario y volver a entrar desde otro lado. Sin un buscador de denuncias aquí mismo, es fácil perder la trazabilidad denuncia→decomiso si el usuario no conoce ese atajo.

**Mejoras futuras**:
1. Media: permitir buscar/vincular una denuncia existente desde este mismo formulario, no solo desde el flujo inverso.

**Factores de administración pública no cubiertos**: no se ve mención de acta firmada digitalmente o cadena de custodia del expediente judicial fuera del campo de texto libre "Ej: EXP-2025-123456" (sin validación de formato ni verificación contra un padrón judicial).

---

## 5. `/gob/moderacion` (denuncias) — "El recorrido de una denuncia"

**Escenario**: el equipo de moderación necesita revisar denuncias anónimas marcadas por heurísticas antes de que entren a triage según Ley 14.346.

**Cómo ayuda**: modelo de 3 pasos muy bien comunicado en el propio copy — Moderación → Triage → Caso — con contadores en cada etapa (Moderación: 0, Triage: 1.213, Casos abiertos: 2.051) y links directos a la siguiente etapa. Filtros por tipo de denuncia y severidad (baja/media/alta/crítica).

**Débil / engañoso**:
- La cola de Moderación está vacía ("Cola vacía — No hay denuncias pendientes de moderación de todo el país"), así que no se pudo ver el flujo de triage real de un ítem individual en esta pasada — riesgo no evaluado.
- El contador "Triage: 1.213" no tiene link directo a esa cola de trabajo, a diferencia de "Casos: 2.051" que sí tiene "Ver casos →". Es una etapa intermedia con 1.213 ítems pendientes y ningún botón para entrar a trabajarla desde esta pantalla resumen.

**Mejoras futuras**:
1. Alta: agregar el link "Ver triage →" junto al contador de 1.213, simétrico al de Casos.

**Factores de administración pública no cubiertos**: sin indicador de antigüedad media de las 1.213 denuncias en triage (¿hay alguna con semanas de atraso?); sin distribución de carga entre moderadores/as; sin criterio visible de qué hace que una denuncia "sin jurisdicción clara" la tome "el equipo de plataforma" (mencionado en el texto, no operacionalizado en la UI).

---

## 6. `/gob/outbox` (Bandeja de salida) — el hallazgo más fuerte de la sesión

**Escenario**: un/a administrador/a de jurisdicción necesita saber si las notificaciones salientes hacia la Autoridad ENO, webhooks de gobierno o exportaciones de auditoría se están entregando a tiempo.

**Cómo ayuda**: esta es la pantalla que mejor cumple con "no dejar sin sla/ageing signal" de todo el relevamiento — banner rojo arriba de todo: **"12 items en incumplimiento de SLA — Revisá los items marcados en rojo y reintentá si es necesario"**, con las filas de incumplimiento efectivamente resaltadas en rojo en la tabla. Filtros por estado, destino, SLA (todos / solo incumplimientos / solo dentro de SLA) y provincia. Columnas SLA / Destino / Jurisdicción / Evento origen / Intentos / Creado / SLA vence / Acción, con link "Detalle →" por fila.

**Débil / engañoso**:
- La columna "Intentos" muestra "—" en todas las filas visibles, incluso en las marcadas INCUMPLIMIENTO. Si un item incumplió el SLA, es información crítica saber si se reintentó 0 veces o 5 veces antes de fallar — el guion sugiere que el dato no se está poblando o que hay 0 intentos registrados, lo cual sería aún más grave (¿el sistema ni siquiera reintentó automáticamente?).
- El subtítulo dice "Últimas 24 filas de la bandeja de salida en tu jurisdicción asignada" — un tope explícito, bien declarado (a diferencia de otras pantallas), pero no hay paginación visible ni link "ver todas" para ir más allá de esas 24 filas, así que si hay más de 12 incumplimientos reales fuera de esas 24, no hay forma de descubrirlos desde acá salvo por el banner que sí cuenta el total.

**Mejoras futuras**:
1. Alta: poblar o explicar la columna "Intentos" — es el dato que le dice al operador si vale la pena reintentar manualmente o si ya se agotaron los reintentos automáticos.
2. Media: agregar paginación o "ver todas las filas" más allá de las últimas 24.

**Factores de administración pública no cubiertos**: no hay escalamiento automático (¿a quién se le avisa si un incumplimiento de SLA hacia la Autoridad ENO no se resuelve en X horas?); no hay vínculo visible hacia el caso o expediente de origen más allá del hash truncado del "evento origen" (18ef9281…) — un funcionario no puede, desde acá, saltar directo al caso que generó esa notificación fallida.

---

## 7. `/gob/perdidas` (Mascotas perdidas)

**Escenario**: vista nacional de mascotas perdidas para un/a administrador/a que necesita ver patrones geográficos y tasas de recuperación, no gestionar un caso puntual.

**Cómo ayuda**: mapa coroplético por jurisdicción con escala de color declarada explícitamente (incluye rango "Sin datos" y "Datos insuficientes (privacidad)" como categorías propias del mapa, no solo huecos). Métricas: Pérdidas activas (116), Recuperados 30d (3), Antigüedad media (51 días), Tasa de reunificación (100%) con nota de honestidad estadística **"Muestra chica (n<5) — no interpretar como tendencia"** y el detalle "meta 39% · 2 de 2 episodios (30d)". Esto es un patrón sólido, coherente con lo visto en `/panorama` según los commits recientes del repo (revivir el ranking de Mortalidad, dejar de llamar "sin señal" a la supresión estadística). Aclara también "vista nacional/multi-provincial: se ocultan los datos de contacto y ubicación exacta" — protección de privacidad correctamente declarada en el propio filtro.

**Débil / engañoso**:
- La tarjeta "Pérdidas activas: 116" no aclara si ese 116 es el total real o un recorte — a diferencia de Casos, que sí declara "50 más recientes de 2.051". La lista de abajo (`Mascotas perdidas (116)`) coincide en número con la tarjeta, así que probablemente es el total real, pero no hay ninguna aclaración textual de que no hay cap, y con una lista tan larga valdría la pena confirmarlo explícitamente para no generar la misma duda que en Casos.
- "Tasa de reunificación 100%" con n=2 es un dato técnicamente correcto pero visualmente el número grande (100%, en verde) compite con la advertencia chica de "muestra chica" que está en gris debajo. Un vistazo rápido se queda con el 100%.

**Mejoras futuras**:
1. Media: declarar explícitamente si la lista de 116 es el total o un recorte paginado.
2. Baja: rediseñar la jerarquía visual de "muestra chica" para que compita en peso con el número grande, no quede como nota al pie.

**Factores de administración pública no cubiertos**: sin asignación de un caso de pérdida a la comisaría/oficina local que debería estar buscando activamente; sin mecanismo de derivación cuando una mascota perdida cruza de jurisdicción (Bruno perdido en Olivos, Buenos Aires — ¿quién actúa si aparece en CABA?).

---

## 8. `/gob/operativos` (Alcance comunitario / Campañas)

**Escenario**: un/a coordinador/a de campañas sanitarias necesita traducir un indicador epidemiológico (antirrábica vencida) en una lista accionable de localidades para programar un operativo.

**Cómo ayuda**: tabla de localidades ordenada de mayor a menor cantidad de vacunas antirrábicas vencidas, con botón "Armar operativo →" por fila — el patrón "del dato a la acción" prometido en el subtítulo se cumple literalmente. Aclara "pipeline (a) · agregado por localidad · sin PII" y "las consultas quedan registradas en el audit log" — buena señal de gobernanza sobre el propio uso del dato.

**Débil / engañoso**:
- **La cifra grande "500" en la tarjeta ANTIRRÁBICA VENCIDA no lleva separador de miles** ni aplica — es menor a mil, así que no se puede confirmar el comportamiento con números de 4+ dígitos en esta pantalla puntual, pero es la única tarjeta de "número grande" del relevamiento que no se pudo verificar contra un valor de 4+ cifras. Vale la pena una pasada específica de QA numérica en esta vista con datos de producción reales.
- No se ve link directo desde la fila de una localidad hacia el listado de mascotas/dueños afectados (más allá de "Armar operativo") — si un coordinador quiere auditar el dato antes de lanzar la campaña, no hay forma de verificar el "32" de Córdoba sin confiar ciegamente en el agregado.

**Mejoras futuras**:
1. Media: exponer un link de "ver detalle agregado" (sin PII) antes de comprometerse a "Armar operativo".

**Factores de administración pública no cubiertos**: sin presupuesto o capacidad operativa vinculada (¿cuántos operativos puede sostener la jurisdicción este mes?); sin coordinación inter-área con Salud Pública más allá del propio módulo.

---

## 9. Comparación `/admin/*` vs. `/gob/*` — inconsistencia real encontrada

Se navegó a los cuatro gemelos pedidos: `/admin/casos`, `/admin/cola`, `/admin/moderacion`, `/admin/outbox`.

**Hallazgo**: `/admin/casos`, `/admin/cola` y `/admin/outbox` sí son rutas `/admin` reales — mismo contenido que su gemelo `/gob`, pero con **scope elevado visible** ("SUPERADMIN · UNIVERSAL" en vez de "· NACIONAL") y, más importante, **con badges de notificación en el sidebar que no aparecen en `/gob`** (Alertas: 1, Bandeja de salida: 12 — ambos en rojo). Evidencia: `ops3-10-admin-casos.png`, `ops3-11-admin-cola.png`, `ops4-13-admin-outbox.png` vs. `ops1-01-gob-casos.png`, `ops1-02-gob-cola.png`, `ops2-07-gob-outbox.png`.

**Pero `/admin/moderacion` no se comporta igual**: al navegar ahí, Next.js redirige silenciosamente a `/gob/denuncias?etapa=moderacion` — la URL cambia, se pierde el badge "UNIVERSAL" y se pierden los contadores de notificación del sidebar. Confirmado en una segunda pasada aislada (`ops7-18-admin-moderacion-recheck.png`, `location.href` final = `/gob/denuncias?etapa=moderacion`).

Esto quiere decir que el "admin console" para la bandeja operativa está construido a medias: dos tercios de las pantallas (casos, aprobaciones, outbox) tienen una capa administrativa real con más visibilidad (scope Universal + badges), pero Moderación no la tiene — un/a SUPERADMIN que entra a revisar denuncias desde `/admin` pierde exactamente la señal de alertas/incumplimientos SLA que sí ve en las otras tres pantallas admin, sin ningún aviso de que "salió" del contexto admin.

**`/admin/aprobaciones` no existe** — 404 confirmado, página de error de marca correcta (no un 404 genérico de Next), con botón "Volver al inicio". Se registraron ~21 errores de consola CSP/chunk en esa página de error puntual (violaciones de `script-src` con nonce), pero son atribuibles al build de la página de error en sí, no a las pantallas del relevamiento.

**Mejora de mayor impacto de toda la sesión**: unificar el comportamiento de `/admin/moderacion` con sus dos hermanas — o darle scope Universal + badges reales, o, si la intención es que denuncias/moderación no tenga vista admin separada, sacarla de la lista de rutas admin documentadas para no generar la falsa expectativa.

---

## Resumen de hallazgos por severidad

| Severidad | Hallazgo | Pantalla |
|---|---|---|
| Alta | Detalle de caso es un callejón sin salida — cero acciones disponibles | `/gob/casos/CAS-T9TK-MUMX` |
| Alta | Columna "Intentos" vacía en incumplimientos de SLA — no se sabe si hubo reintentos | `/gob/outbox` |
| Alta | `/admin/moderacion` redirige a `/gob` y pierde scope Universal + badges, a diferencia de sus gemelas | admin vs gob |
| Media | Sin campo de motivo visible antes de Aprobar/Rechazar en Aprobaciones | `/gob/cola/APR-...` |
| Media | Filtro de período no filtra la lista de decomisos, solo el indicador superior | `/gob/decomisos` |
| Media | Triage (1.213 ítems) sin link directo a su cola, a diferencia de Casos | `/gob/moderacion` |
| Baja | Ruta `/gob/cola` no comunica que es Aprobaciones | `/gob/cola` |
| Baja | "500" en Operativos no permite verificar separador de miles (menor a 1.000) | `/gob/operativos` |

## Factores de administración pública ausentes (transversal a toda la bandeja)

- **Asignación y carga de trabajo**: ningún expediente, denuncia o aprobación tiene un responsable asignado visible en la UI ni una vista de "mis casos" vs. "todos los casos" para un/a agente de base.
- **Escalamiento formal**: existe la palabra "escalar" en varios copys (denuncias → equipo de plataforma; casos sin jurisdicción clara), pero no hay un botón ni un flujo visible que lo ejecute en las pantallas relevadas.
- **Revisión supervisoria**: no se vio ningún paso de doble validación (un/a inspector/a decide, un/a supervisor/a confirma) en decomisos ni en aprobaciones — el mismo rol que decide parece tener autoridad final e inmediata.
- **Compromisos de servicio al ciudadano**: sin un SLA visible de "tiempo de respuesta a una denuncia" o "tiempo de resolución de una mascota perdida" comparable al que sí existe (y se comunica bien) en la bandeja de salida técnica.
- **Expediente formal / vinculación judicial**: el campo "Expediente judicial" en decomisos es texto libre sin validación; no hay una noción de expediente administrativo formal (numeración, mesa de entradas) que conecte el caso DIM con el trámite en el organismo real.
- **Notificación al ciudadano**: no se observó ningún mecanismo, en las pantallas de casos o aprobaciones, para notificar al denunciante o al aplicante sobre el estado de su trámite (más allá de la bandeja de salida técnica hacia sistemas, que es B2B, no B2C).
- **Derivación inter-jurisdiccional**: ni en Pérdidas ni en Casos hay una acción de "derivar a la jurisdicción X" cuando un caso cruza fronteras provinciales.

---

*Evidencia visual completa (18 capturas) en `C:/Users/ignac/.claude/jobs/ef3dba5c/tmp/ops/`.*
