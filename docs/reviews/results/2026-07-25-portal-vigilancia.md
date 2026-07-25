# Revisión visual — Vigilancia epidemiológica y salud pública (2026-07-25)

**Alcance**: `/gob/vigilancia`, `/gob/vigilancia/brotes`, `/gob/vigilancia/zoonosis`, `/gob/vigilancia/investigaciones` (+ `/nuevo`), `/gob/mortalidad`, `/gob/denuncias`, `/gob/maltrato`, `/admin/observaciones`, `/admin/alertas`.

**Método**: sesión real contra `localhost:3000` (`admin@dim.test`, rol SUPERADMIN/universal), captura de pantalla + interacción (filtros, tabs, drill-down) con `scripts/qa-vis.ts`. Todas las capturas quedaron en `C:/Users/ignac/.claude/jobs/ef3dba5c/tmp/vig/`.

---

## 1. `/gob/vigilancia` — el mapa de situación

**Escenario**: es la primera pantalla que abre un/a funcionario/a de zoonosis provincial o municipal a la mañana. La pregunta que responde: "¿qué está pasando en mi jurisdicción ahora mismo, y estoy cumpliendo con la ley?"

**Cómo ayuda**: 9 KPIs en dos filas (brotes activos, rábicas activas, altas de hoy, vacunaciones 7d, casos bajo investigación, brecha de escalamiento, cumplimiento de observación a 10 días, SLA de notificación ENO, densidad ATM/AMR), mapa coroplético con drill-down provincia→departamento/barrio, tabla de señales recientes, tendencia de enfermedades reportables y un resumen por enfermedad. Todo con período y jurisdicción filtrables. El diseño ya aplica un principio serio: los ceros se etiquetan como "no-signal" ("la ausencia de señales no implica ausencia de enfermedad") en vez de leerse como "todo tranquilo" — evita el error clásico de leer un dato faltante como un dato bueno.

**Lo débil / engañoso** (evidencia: `a-01-vigilancia-overview.png`):
- **Hallazgo fuerte**: la tarjeta "Cumplimiento observación 10D" muestra **7,1%** (1 de 14 observaciones cerradas dentro del plazo legal de 10 días — Decreto 4669/1973 PBA, Ord. CABA 41.831) pintada con **fondo verde/tono "ok"**, porque la lógica de tono depende de `openBreaches` (incumplimientos *abiertos ahora*), que da 0. El resultado visual: un funcionario ve una tarjeta verde con "7,1%" adentro. Verde + 7,1% es una contradicción que el propio código ya corrigió para el caso inverso (breach activo pisando un % histórico bueno — comentario "coherence fix qa-triage-2026-07-23 #12"), pero **no para este caso**: cero incumplimientos abiertos hoy puede convivir con una tasa histórica de cumplimiento catastrófica, y la tarjeta lo sigue pintando como éxito.
- **Hallazgo fuerte — discrepancia entre pantallas**: esta misma pantalla dice "Rábicas activas: 12" (`cases` con `caseKind='rabies_observation' AND status='open'`). Al filtrar `/admin/observaciones?status=in_progress` (rol admin, alcance universal) el resultado es **0 filas**, con el propio empty-state "Sin observaciones registradas en miMAR" (ver hallazgo detallado en la sección de Observaciones, punto 8). Dos pantallas del mismo panel de administración no coinciden en cuántas observaciones rábicas hay abiertas *ahora*. Esto es exactamente el tipo de deriva que el invariante del proyecto ("las facturas viven en el spine; los cachés se declaran") existe para prevenir — acá parece que una lee de `cases` y la otra deriva de eventos (`rabies_observation_started/ended`), y divergieron.
- **Brecha de escalamiento**: "1.507" mordeduras reportadas (12 meses) vs "0" observaciones rabicas abiertas. La copy es honesta ("la ausencia de escalamiento no implica ausencia de riesgo"), pero el número por sí solo — 1.507 vs 0 — es una alarma de salud pública que en esta pantalla es solo una tarjeta más, sin urgencia visual distinta a "Densidad ATM/AMR: 0".
- El checkbox "Solo verificados institucionalmente" (en `/brotes`) se marcó correctamente en la interacción, pero **la lista de señales no cambió** (mismas 4 filas, mismo total "125 señales" antes y después). Puede ser correcto si las 125 ya están todas verificadas institucionalmente, pero no hay manera de confirmarlo desde la UI — no hay contador de "cuántas sin verificar existen", así que un filtro que no mueve la aguja es indistinguible de un filtro roto.
- "Densidad ATM/AMR: 0 — sin datos de uso registrados" en modo universal/nacional: con miles de eventos en el sistema, cero inicios de tratamiento antimicrobiano registrados a nivel país es o bien una brecha de registro real y grave, o una fuente de datos que este KPI no está mirando. No hay forma de distinguir desde la pantalla.

**Mejoras futuras (por palanca)**:
1. Corregir la lógica de tono de "Cumplimiento observación 10D": el semáforo debería reaccionar al histórico (compliancePct) además de al breach activo, no solo al segundo.
2. Investigar y resolver la discrepancia 12 vs. 0 entre "Rábicas activas" y `/admin/observaciones?status=in_progress` — es el tipo de bug que le cuesta la credibilidad al sistema frente a un auditor.
3. Convertir la "brecha de escalamiento" en un semáforo real (con umbral) en vez de una tarjeta neutra — hoy 1.507:0 tiene la misma jerarquía visual que cualquier otro número.
4. Mostrar, junto al checkbox "solo verificados", el conteo excluido (p. ej. "125 → 118 al filtrar") para que el usuario confíe en que el filtro hizo algo.

**Factores de administración pública no cubiertos**:
- **Ninguna vía de escalamiento inter-agencia visible**: la pantalla habla de SENASA, zoonosis provincial, Ley 22.953 en el copy legal, pero no hay ningún botón/flujo para *notificar* a esas autoridades desde acá — solo texto que dice "hacelo por tus canales habituales". Ese es el hueco más grande de toda la superficie: el sistema **mide** el cumplimiento legal pero no **participa** en el cumplimiento (no genera el oficio, no arma el expediente, no dispara el correo a la Dirección de Zoonosis).
- **Sin trazabilidad de responsable**: ninguna tarjeta dice *quién* debe actuar sobre la brecha de escalamiento o el incumplimiento de 10 días — no hay asignación, no hay "en manos de X desde hace Y días".
- **Sin dimensión de dotación/recursos**: 125 brotes activos + 1.507 mordeduras sin escalar + 1.213 denuncias sin asignar (ver más abajo) — nada en el sistema contrasta esa carga contra la cantidad de personal disponible. Un director de zoonosis necesita saber si esto es manejable con su equipo actual.

---

## 2. `/gob/vigilancia/brotes` — listado de señales

**Escenario**: el mismo funcionario, ya en modo trabajo, revisando cada sospecha de rabia o brote reportado, filtrando por enfermedad o por confiabilidad de la fuente.

**Cómo ayuda**: lista completa con período/enfermedad/jurisdicción/verificación institucional, cada fila linkeable a "Abrir investigación →".

**Lo débil**: 125 señales activas y **0 investigaciones de brote abiertas** (ver punto 3) — es decir, ninguna de las 125 señales de "sospecha de rabia" tiene, hoy, una investigación formal asociada en el sistema. La pantalla de brotes no lo señala; hay que cruzarla con `/investigaciones` para notarlo.

---

## 3. `/gob/vigilancia/zoonosis` — ruta muerta (por diseño)

**Escenario**: alguien con un bookmark viejo o un link externo a "zoonosis".

**Hallazgo confirmado**: es un `redirect()` puro a `/gob/vigilancia` (`app/gob/vigilancia/zoonosis/page.tsx`, comentario explícito: "retired… kept as a thin redirect so any deep link still resolves instead of 404ing"). Verificado en vivo: `goto /gob/vigilancia/zoonosis` termina en `location.href = /gob/vigilancia`, breadcrumb "Panel > Vigilancia", contenido idéntico a la pantalla 1 (`a-04-zoonosis-redirect.png` = pixel-idéntica a `a-01`). No es un bug — es intencional y documentado —, pero **no hay ningún indicio en el sidebar ni en la navegación de que esta ruta exista o haya existido**; si un funcionario tenía guardado ese link específico para "la vista de zoonosis", hoy aterriza en el panorama general sin ninguna explicación de qué pasó con la vista que buscaba.

---

## 4. `/gob/vigilancia/investigaciones` — investigaciones de brote

**Escenario**: un epidemiólogo abre un expediente formal de investigación sobre un brote sospechado (a diferencia de una señal individual).

**Cómo ayuda**: lista con estado (abierta/escalada/cerrada), filtro de jurisdicción, botón directo "Nueva investigación", y un banner permanente que declara honestamente la brecha: *"La notificación obligatoria a SNVS/SENASA/zoonosis (Ley 15.465/60, Decreto 3640/64) NO está integrada en esta versión."*

**Lo débil / engañoso** (evidencia: `a-05-investigaciones-list.png`):
- **0 investigaciones** en todo el sistema (alcance universal/nacional), a pesar de 125 señales de brote activas. No pude probar el flujo "abrir fila → ver detalle" porque no existe ninguna fila para clickear — intenté clickear "Ver →" y el intento no tuvo efecto (no había ningún link con ese texto en la página). Esto es en sí mismo un hallazgo: **con datos sintéticos de demo con miles de eventos, la funcionalidad central de esta pantalla (investigar un brote) nunca se ejerció ni una vez**. No sé si es una limitación del seed de demo o un reflejo de que, en la operación real, "abrir una investigación" es un paso que nadie da — pero en cualquier caso, es una pantalla sin body of evidence detrás.
- El empty state usa `nature="measured-zero"` (cero verificado, no "sin señal") — correcto conceptualmente (una investigación es un acto administrativo, no un hecho pasivamente reportado), pero no explica *por qué* debería haber alguna dado que hay 125 señales activas.

**Factores de administración no cubiertos**: no hay ningún vínculo automático "señal de brote → sugerencia de abrir investigación" — el puente entre `/brotes` (125 señales) y `/investigaciones` (0 casos) depende 100% de que un humano decida cruzarlo manualmente, sin ningún indicador que le avise "tenés 125 señales sin investigación asociada".

---

## 5. `/gob/vigilancia/investigaciones/nuevo` — alta de investigación

**Escenario**: el mismo epidemiólogo, decidiendo abrir el expediente.

**Cómo ayuda**: formulario simple — enfermedad (catálogo ENO), motivo (mínimo 10 caracteres), señal vinculada opcional.

**Lo débil / engañoso** (evidencia: `a-07-investigacion-nueva-form.png`):
- El campo "Signal vinculada (opcional)" pide **el ID crudo del evento** `outbreak_signal` ("ID del outbreak_signal event (si existe)") — sin buscador, sin autocompletado, sin selector de la lista de 125 señales ya visibles en `/brotes`. Un funcionario no tiene forma de saber ese ID sin ir a inspeccionar la base de datos o el payload de un evento. Es un campo técnico disfrazado de campo operativo — probablemente quede sistemáticamente vacío en uso real, lo que rompe la trazabilidad señal→investigación que el sistema dice querer sostener.
- Repite el mismo banner de "notificación externa no integrada", esta vez advirtiendo hacerlo "antes o después de registrar la investigación en este sistema" — coherente, pero confirma que el paso legal obligatorio (SNVS/SENASA) vive completamente fuera del producto.

**Mejora de alto impacto**: reemplazar el campo de ID crudo por un buscador/selector sobre las señales ya cargadas en `/brotes` (mismo jurisdiction scope) — es una mejora de bajo costo y alto impacto en la usabilidad real de este formulario.

---

## 6. `/gob/mortalidad` — mortalidad y disposición final

**Escenario**: un/a inspector/a sanitario/a de zoonosis auditando cómo se están disponiendo los cadáveres de mascotas — trazabilidad exigida por normativa (Ley CABA 5.470 y equivalentes provinciales).

**Cómo ayuda**: KPIs de trazabilidad de disposición, tasa de desconocido, participación de enfermedades notificables, gráfico de causas por semana/mes, distribución por localidad con supresión k-anónima, todo period/species/cause-filtrable.

**Lo débil / engañoso** (evidencia: `b-01-mortalidad-overview.png`):
- **Muertes (período)**: 2.011 con **+76% vs. período anterior** (desde 1.142) — un salto así de grande, presentado con delta "neutral" (ni bueno ni malo, correcto conceptualmente porque puede ser mejor registro en vez de más muertes), pero sin ningún mecanismo para que el usuario indague *por qué* subió 76% — no hay drill-down a "qué cambió" (¿una localidad nueva empezó a reportar? ¿un evento real de mortalidad masiva?).
- **Trazabilidad de disposición: 32,0%** contra una meta de 75% — muy por debajo, correctamente en tono de alerta.
- **Disposición desconocida: 25,9%**, apenas por encima del umbral de 25% que dispara el banner "Baja trazabilidad de disposición" — la pantalla lo señala bien, con el número exacto y el umbral citado.
- El intento de click en el filtro "Perro" (control de especie) **falló por timeout** — es un `<select>` nativo, no un botón/pill como el filtro de período; mi paso de automatización asumía mal el tipo de control, no es un bug de producto, pero vale la nota de UX: el filtro de especie/causa usa un patrón visual (dropdown) distinto al de período/provincia (pills), lo que puede generar fricción de descubribilidad para un usuario nuevo que espera que todos los filtros se vean/comporten igual.

**Factores de administración no cubiertos**: la trazabilidad de disposición es una obligación *municipal* en la práctica (quién controla el crematorio/cementerio autorizado), pero no hay ningún vínculo a un registro de establecimientos habilitados ni una vía para que el sistema avise a la autoridad municipal cuando la tasa de "desconocido" cruza el umbral — el breach es visual, no accionable.

---

## 7. `/gob/denuncias` (incluye `/gob/maltrato`) — el recorrido de una denuncia

**Escenario**: la cola de trabajo diaria de un operador de bienestar animal, triando denuncias bajo Ley 14.346 (maltrato animal).

**Hallazgo de ruteo confirmado**: `/gob/maltrato` **redirige** permanentemente a `/gob/denuncias?etapa=triage` (verificado en vivo, `location.href` final = `.../gob/denuncias?etapa=triage`). Documentado en el código como fusión intencional (F1, 2026-07-22) — no es un bug, pero de nuevo: cualquier material de capacitación, bookmark o comunicación previa que diga "andá a Maltrato" hoy termina en una URL con un nombre distinto ("Denuncias"), lo cual puede confundir a operadores acostumbrados al nombre viejo.

**Cómo ayuda**: dos tabs (Moderación / Triage) con badges de conteo, cola de trabajo con sub-tabs (Urgentes/Sin asignar/Mías/Todas/Atrasadas), tarjeta de acceso a "Caso" (paso 3, regulatorio) con conteo de abiertos.

**Lo débil / engañoso — el hallazgo más fuerte de toda la revisión** (evidencia: `b-03-denuncias-triage-default.png`):
- **"Sin asignar": 1.213 denuncias.** La primera fila visible en la cola de trabajo — la que un operador vería apenas entra — es *"Animal encadenado o sin movilidad"*, severidad **"CRÍTICA (HISTÓRICA)"**, etiquetada **"HISTÓRICO · SIN SLA ACTIVO"**, reportada **hace 29 meses** (más de dos años). Es decir: la cola por defecto ("sin asignar", que el propio código documenta como el default deliberado — "sin asignar abiertas", no "Todas" — precisamente para no enterrar el trabajo urgente) tiene en su tope visible una denuncia crítica de casi tres años de antigüedad. Si "sin asignar" es la vista que un operador mira cada mañana para decidir qué tomar, un backlog de 1.213 con una denuncia crítica de 29 meses arriba de todo sugiere que **la cola no se está vaciando ni remotamente al ritmo que entra**, o que el criterio de orden no prioriza por antigüedad/severidad de forma efectiva.
- "Mías: 0", "Cerradas (30d): 0" — ningún operador tiene denuncias asignadas propias, y no se cerró ninguna en 30 días, en un sistema con 1.213 pendientes y 93 "en curso". Esto, combinado con el punto anterior, dibuja un cuadro de una cola que crece sin throughput visible de cierre.
- El tab "Moderación" muestra "Cola vacía" (0 pendientes) — coherente, no es un problema en sí, pero contrasta fuerte con el volumen de Triage, sugiriendo que el cuello de botella real está después del filtro de moderación, no en él.
- "Paso 3 · Caso — Abiertos: 2.051" — otro número enorme, presentado como una tarjeta chica y de-enfatizada al pie de la pantalla (deliberadamente, según el comentario del código, para no competir visualmente con la etapa activa), pero 2.051 casos regulatorios abiertos es, en cualquier lectura administrativa, una cifra que merece más protagonismo del que tiene acá.

**Mejoras futuras (por palanca)**:
1. Máxima prioridad: investigar por qué la denuncia #1 de la cola "sin asignar" tiene 29 meses — o es un artefacto del dataset sintético (¿fecha de seed mal generada?) o hay una denuncia crítica real abandonada durante más de dos años, y ambas posibilidades ameritan revisión inmediata.
2. Agregar un indicador de "antigüedad promedio de la cola" o "denuncias > X días sin tomar" como KPI propio, no solo visible fila por fila.
3. Mostrar throughput (cerradas por semana/mes) junto al stock (sin asignar), para que la cola no luzca estática cuando en realidad se está achicando (o creciendo) a cierto ritmo.

**Factores de administración no cubiertos**:
- **Sin asignación por carga de trabajo**: "Tomar" es manual, fila por fila — no hay balanceo automático entre operadores ni visibilidad de cuántas denuncias tiene cada uno.
- **Sin escalamiento por SLA vencido**: la etiqueta "Atrasadas" existe como sub-tab, pero no vi ningún disparador automático (alerta, notificación) cuando una denuncia cruza determinado umbral de antigüedad — es responsabilidad 100% de que un humano entre a mirar esa pestaña.
- **Sin comunicación al denunciante**: el flujo modela muy bien el lado interno (moderación → triage → caso), pero no hay ningún rastro de si el ciudadano que denunció recibe alguna devolución de estado ("tu denuncia fue tomada / cerrada").

---

## 8. `/admin/observaciones` — observaciones antirrábicas (Ley 22.953 / plazo de 10 días)

**Escenario**: el veterinario/a de salud pública que debe cerrar profesionalmente cada observación de un animal mordedor dentro del plazo legal de 10 días (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987).

**Cómo ayuda**: lista con filtro de provincia/localidad/estado, cada observación "en curso" con link directo "Cerrar profesionalmente →"; las cerradas se muestran de referencia.

**Lo débil / engañoso — segundo hallazgo más fuerte de la revisión** (evidencia: `c-01-observaciones-list.png`, `d-01-observaciones-en-curso.png`):
- Vista por defecto (sin filtro de estado): 16 filas visibles, **todas "CERRADA NEGATIVA"** — ninguna en curso a la vista.
- Al filtrar explícitamente `Estado: En curso`, el resultado es **0 filas**, con el empty-state "Sin observaciones registradas en miMAR — la ausencia de observaciones no implica ausencia de casos por escalar". Esto, en alcance universal/admin (todo el país), significa: **no hay ni una sola observación rábica actualmente en curso en todo el sistema**.
- Esto **contradice directamente** la tarjeta "Rábicas activas: 12" de `/gob/vigilancia` (que cuenta `cases` con `caseKind='rabies_observation' AND status='open'`). Doce pantallas de vigilancia dicen que hay 12 casos abiertos; la pantalla dedicada a gestionarlos dice que hay cero. No pude cerrar ninguna observación "en curso" para probar el flujo `CloseObservationForm` porque, según esta pantalla, no existe ninguna para cerrar.
- Intenté navegar directo a `/admin/observaciones/PANO-014105` (el código de referencia que sí se muestra en cada fila cerrada, ej. "PANO-014105") esperando llegar al detalle — **404** ("No encontramos esta página"). El código visible en la lista (`PANO-XXXXX`) **no es el mismo identificador** que usa la ruta de detalle (`[publicToken]`, que espera el token público real de la mascota, tipo `DIM-XXXX-XXXX`, no mostrado en esta pantalla para las filas cerradas). Conclusión concreta: **para una observación ya cerrada, no existe ningún camino de UI hacia su detalle** — ni un link en la fila, ni una forma de reconstruir la URL a partir de lo que la pantalla muestra. Es un final de trayecto real, no solo un artefacto de mi prueba.

**Mejoras futuras (por palanca)**:
1. **Máxima prioridad**: reconciliar la fuente de "rábicas activas"/"en curso" entre `/gob/vigilancia` (12) y `/admin/observaciones` (0) — es el tipo de discrepancia que, mostrada a un auditor de SENASA o de una Legislatura provincial, cuestiona la confiabilidad de todo el panel.
2. Agregar un link real "Ver detalle →" en cada fila cerrada (no solo en las "en curso"), usando el token público interno, no un código de referencia sin ruta asociada.
3. Si "PANO-XXXXX" es un identificador puramente cosmético, no mostrarlo como si fuera navegable — o convertirlo en el link real.

**Factores de administración no cubiertos**: el texto de la pantalla cita dos normas distintas por jurisdicción (Decreto PBA / Ordenanza CABA) en la misma frase genérica — no hay diferenciación de plazo/autoridad por provincia más allá del texto fijo, y ninguna vía de notificación automática hacia la autoridad sanitaria de cada jurisdicción cuando una observación se acerca al día 10 sin cierre (dependencia total en que alguien revise manualmente esta lista).

---

## 9. `/admin/alertas` — bandeja de alertas

**Escenario**: un/a administrador/a que suscribió umbrales (p. ej. cobertura de esterilización, SLA de ENO) y necesita reconocer/investigar/contactar autoridad/resolver cada disparo.

**Cómo ayuda**: tabla con métrica, jurisdicción, valor observado vs. meta, antigüedad, estado, y acciones (Reconocer/Descartar) por fila. Filtros por métrica/provincia/estado/fecha.

**Lo débil / engañoso** (evidencia: `c-03-alertas-inbox.png`):
- Con el filtro por defecto "Abiertas (todas)", la bandeja muestra **una sola alerta**: "Cobertura de esterilización (%)" en Palermo, CABA (observado 38, meta 70), 9 días de antigüedad, "VENCIDO"/"DISPARADA".
- **Ninguna de las tres crisis de cumplimiento que `/gob/vigilancia` expone en sus propias tarjetas** — el 7,1% de cumplimiento de observación a 10 días, las "12 vencidas ahora" de SLA ENO, ni la brecha de escalamiento de 1.507 mordeduras — **aparece como alerta en esta bandeja**. Un/a administrador/a que solo revisa `/admin/alertas` (que es, por diseño, la bandeja de "cosas que requieren acción") no se enteraría de ninguna de esas tres situaciones a menos que también entre a Vigilancia y las lea manualmente. Esto es una brecha real entre "lo que el sistema puede medir" (visible en dashboards) y "lo que el sistema efectivamente empuja como alerta accionable" (esta bandeja).
- Un click sobre la fila de la tabla no tiene ningún efecto (no es un link ni expande detalle) — la interacción esperada es a través de los botones "Reconocer"/"Descartar", lo cual es razonable, pero no hay ninguna pista visual (cursor, hover) de que la fila en sí no es clickeable.

**Mejoras futuras (por palanca)**:
1. Máxima prioridad: dar de alta suscripciones de alerta para las métricas de cumplimiento legal que ya existen en Vigilancia (cumplimiento 10 días, SLA ENO) — hoy esas métricas se calculan y muestran, pero no disparan una fila en la bandeja de alertas, lo cual rompe la promesa implícita de "esta es la bandeja de lo que necesita mi atención".
2. Mostrar en la tabla algún indicador visual de que la fila NO es clickeable (o hacerla clickeable hacia un detalle con historial de reconocimientos).

**Factores de administración no cubiertos**: no hay ningún registro visible de a qué autoridad externa se contactó ni cuándo ("contactar autoridad" es un paso nombrado en la copy de cabecera, pero no vi un campo o botón dedicado a esa acción específica en la fila, solo Reconocer/Descartar); sin esa traza, la bandeja no puede servir como evidencia de que el organismo cumplió su propio protocolo de escalamiento.

---

## Síntesis — lo más importante para un decisor no técnico

1. **Dos números distintos para "cuántas observaciones rábicas hay abiertas hoy" (12 vs. 0)**, entre la pantalla de panorama y la pantalla operativa dedicada. Es el hallazgo de mayor riesgo reputacional: un organismo de control que cruce ambas pantallas lo va a notar.
2. **Una denuncia crítica de 29 meses en el tope de la cola "sin asignar"** de Denuncias/Maltrato, sobre un backlog de 1.213. Amerita revisión inmediata de datos (¿seed sintético mal fechado?) y, si es representativo, una revisión seria del throughput operativo.
3. **Una tarjeta verde mostrando 7,1% de cumplimiento legal** — la lógica de semáforo no cubre el caso "cero incumplimientos abiertos ahora, pero historial de cumplimiento pésimo".
4. **Ninguna de las tres alertas de cumplimiento más graves de Vigilancia llega a la Bandeja de Alertas** — la bandeja de "cosas para actuar" y el dashboard de "cosas que están pasando" no están conectados.
5. **El puente legal obligatorio con SENASA/zoonosis provincial/SNVS no existe en el producto** — está honestamente declarado como pendiente en tres pantallas distintas, pero sigue siendo, en la práctica, el hueco estructural más grande de toda esta superficie: el sistema mide y documenta el cumplimiento, pero no participa en el cumplimiento inter-agencia.
6. **Cero investigaciones de brote formales sobre 125 señales activas** — la funcionalidad central de "investigar un brote" no tiene ni un solo caso de uso ejercido en estos datos.
