# Revisión portal — Programa, Padrón, Censo, Población y Analítica

**Fecha:** 2026-07-25
**Entorno:** `http://localhost:3000` (local, datos sintéticos) — cuenta `admin@dim.test` (SUPERADMIN · NACIONAL en `/gob`, SUPERADMIN · UNIVERSAL en `/admin`)
**Método:** Playwright headless (`scripts/qa-vis.ts`), screenshots leídos y analizados uno por uno.
**Alcance:** `/gob`, `/gob/programa`, `/gob/padron` (tabs Población/Censo), `/gob/censo`, `/gob/poblacion`, `/gob/analitica`, `/gob/analytics`, `/gob/analytics/export`, `/gob/campanas` (tabs Campañas/Alcance comunitario), `/gob/outreach`, `/gob/adopciones`, `/gob/rupga`, `/gob/historial`, y los cuatro gemelos `/admin/*`.

Nota de arquitectura descubierta durante la corrida: varias de las rutas pedidas **no son páginas distintas** sino alias/deep-links a un mismo componente con tabs. Lo dejo asentado porque cambia cómo hay que leer el resto del informe:

- `/gob/padron`, `/gob/censo` y `/gob/poblacion` son la MISMA página (`¿Crece sano el padrón y contenemos la población?`), con tabs **Población** / **Censo**. `/gob/censo` abre con el tab Censo activo, `/gob/poblacion` con Población activo, `/gob/padron` con Población por defecto.
- `/gob/analytics` es alias en inglés de `/gob/analitica` — contenido idéntico, mismo bug incluido.
- `/gob/outreach` redirige (server-side) a `/gob/operativos`, que es la misma página que `/gob/campanas`, con tabs **Alcance comunitario** / **Campañas**.
- `/gob/rupga` abre `/gob/directorio` con el tab **Credenciales** activo.
- Los cuatro `/admin/*` pedidos son la versión "universal" (todas las jurisdicciones sin filtro obligatorio) del mismo componente que sus gemelos `/gob/*`; `/admin/censo` y `/admin/poblacion` redirigen a `/admin/padron` con el tab correspondiente, igual que en `/gob`.

---

## 1. `/gob` — Panel de jurisdicción (landing)

**Screenshots:** `gob-full.png`, `gob-06-scrolldown.png`, `gob-07-scrollbottom.png`

### El escenario
Un/a funcionario/a de zoonosis o control animal provincial entra un lunes a la mañana a ver "qué pasó" en su jurisdicción. Es la primera pantalla que ve al loguearse — tiene que decirle en 10 segundos si hay algo urgente.

### Cómo ayuda
Cuatro tarjetas de "Alertas priorizadas" en la parte superior (penetración de microchip, disposición trazable de fallecimientos, brecha de escalamiento mordeduras-vs-observaciones, cobertura antirrábica) cada una con: valor, obligación legal citada (Ley Prov. 14.107, Ley CABA 5470, Ley 22.953), meta programática y un link "Ver en X →". Es el patrón correcto: alerta → norma que la exige → adónde ir a actuar. Debajo, "Brechas vs meta" da cuatro métricas con sparkline y contexto ("37.123 perros en el padrón · meta 80% · 0% firmado por matrícula"). Al final, un gráfico de mordeduras por mes y una cola operativa (aprobaciones, denuncias, casos, mascotas perdidas).

Punto fuerte real: la tarjeta de "Cobertura antirrábica" dice explícitamente **"Sin estimación censal"** antes de mostrar "37.123 perros en el padrón". Es la disclosure correcta — dice de qué universo sale el número. Contrasta fuerte con lo que encontré en `/gob/programa` (ver sección 2).

### Qué es débil o engañoso
- **Números sin separador de miles en las líneas de confianza de las alertas.** En `gob-full.png`, las cuatro tarjetas de "Alertas priorizadas" muestran "Confianza: alta · n = 67519" y "Confianza: media · n = 1507" — sin el punto de miles que sí llevan los números grandes del cuerpo de la tarjeta (67.519 en otros lados de la misma página, 1.507 en el título de la propia tarjeta de brecha de escalamiento). Es inconsistente dentro de la MISMA tarjeta: el título dice "1.507 mordeduras" con separador, la línea de abajo dice "n = 1507" sin separador. Esta es exactamente la clase de bug mencionada como recién encontrada — no fue completamente erradicada, sigue viva en la línea de confianza.
- La tarjeta "Brecha de escalamiento" dice correctamente "la ausencia de escalamiento no implica ausencia de riesgo" — buen matiz, pero está enterrada en texto chico dentro de una tarjeta más, no destacada.
- "Mordeduras por mes" tiene "1 período oculto (privacidad)" sin explicar qué período ni por qué — un funcionario que necesita el dato exacto de ese mes no tiene forma de pedirlo desde acá.

### Mejoras futuras (por palanca)
1. Unificar el formateo de números en TODA la superficie de "Confianza: · n = " — es una función de formato, se corrige en un lugar y se propaga.
2. Destacar visualmente (no solo en texto) cuando "sin escalamiento" ≠ "sin riesgo" — un ícono o color distinto al de las alertas normales.
3. Hacer clickeable "1 período oculto (privacidad)" para ver el motivo exacto (k-anonimato, cuántos registros).

### Factores de administración pública NO cubiertos
- No hay nada sobre **ciclo presupuestario**: ¿esta cobertura del 63,6% cuesta cuánto llegar al 80%? Ningún KPI se traduce a "para cerrar la brecha necesitás X dosis más, a $Y cada una, en el ejercicio actual".
- No hay **trazabilidad de responsabilidad política**: quién es el responsable jurisdiccional de cada alerta, ni un mecanismo de asignación/derivación formal (más allá del link "Ver en X").
- No hay vínculo con **licitación o compra de insumos** (vacunas, chips) — el sistema mide déficit pero no dispara ni sugiere una orden de compra o pedido a Nación/proveedor.
- Nada sobre **dotación de personal** — ¿alcanza el equipo veterinario actual para cerrar la brecha de esterilización en el plazo de la meta?

---

## 2. `/gob/programa` — Resumen ejecutivo de la jurisdicción

**Screenshots:** `programa-01-top.png`, `programa-02-mid.png`, `programa-03-mid2.png`, `programa-04-bottom.png`, `programa-impacto-info-01-hover-impacto.png`

### El escenario
El mismo funcionario, pero ahora en modo "tengo que rendir cuentas a mi superior o a la legislatura": necesita una tabla rankeada de brechas por provincia y métrica para decidir dónde poner el próximo operativo o partida.

### Cómo ayuda
La tabla "Tus provincias — cobertura vs meta" rankea 72 combinaciones provincia×métrica por brecha, con columna "Impacto" en unidades humanas ("~996.765 mascotas sin chip"). Debajo, "Supervisión de PII" — quién buscó qué información personal, cuántas veces, cuándo — y "Calidad de datos" con métricas de completitud (24%) y huérfanas.

### Qué es débil o engañoso — este es el hallazgo más importante de la corrida

**La columna "Impacto" mezcla el padrón real con una población estimada, sin decirlo en ningún lado.**

Evidencia: en `programa-01-top.png`, el tile "TOTAL REGISTRADAS" dice **67.519** mascotas activas o extraviadas — ese es el padrón completo, a nivel nacional, de las 24 provincias. Dos centímetros más abajo, la misma pantalla dice que solo en Buenos Aires "~996.765 mascotas sin chip" — un número **14 veces mayor que todo el padrón nacional**. Eso es matemáticamente imposible si "Impacto" saliera del padrón: solo puede salir de aplicar el % de brecha de microchip a una estimación poblacional (censo estimado, no el registro).

Confirmé que no hay disclosure: pasé el mouse sobre el header "Impacto" (`programa-impacto-info-01-hover-impacto.png`) — no hay ícono de info, no aparece tooltip. Tampoco hay nota al pie en la tabla ni en la sección. Un funcionario que lea esta tabla y la cite en un informe a la legislatura ("en mi provincia faltan casi un millón de chips") está citando una extrapolación estadística como si fuera un conteo, sin que la interfaz se lo advierta en ningún punto de contacto.

Esto es exactamente el peligro que el contexto de esta revisión señala como conocido: confundir el padrón (registro propio) con el censo (población estimada). Y es más grave que la advertencia genérica, porque acá ni siquiera hay un asterisco.

Contraste importante: en la MISMA carpeta de pantallas, `/gob/padron` sí resuelve esto bien — dice explícitamente "Población (cobertura de esterilización vs. meta) y Censo (crecimiento y calidad del registro) leen el mismo padrón desde dos preguntas distintas" y todos los porcentajes ahí están anclados a "de 67.519" visible al lado del número. La inconsistencia entre ambas pantallas del mismo producto es en sí misma una señal de que el problema es localizado y arreglable — no es una limitación del dato sintético, es una omisión de copy/UX en un solo componente.

- Menor: "Aprobaciones — más vieja" cambió de 8 días a 9 días entre dos corridas de pocos minutos — esperable si es reloj real, pero confirma que no hay período de corte fijo para demos/capturas (una captura tomada en dos momentos distintos del día ya no es reproducible byte a byte).

### Mejoras futuras (por palanca)
1. **Máxima prioridad:** agregar a la columna "Impacto" (o a un tooltip en el header) una leyenda explícita: "estimado sobre población censal proyectada, no sobre el padrón registrado" — mismo patrón que ya usa la tarjeta de cobertura antirrábica en `/gob`.
2. Separar visualmente "Cobertura/Meta/Brecha" (que sí son sobre el padrón real) de "Impacto" (estimado) — por ejemplo con un ícono distinto o una columna en itálica con asterisco.
3. La sección "Calidad de datos" (completitud 24%) debería estar más arriba, antes de la tabla de impacto — es el dato que le da contexto crítico a todo lo demás: si 76% de los perfiles están incompletos, cualquier ranking de cobertura hereda ese ruido.

### Factores de administración pública NO cubiertos
- No hay **exportación de esta tabla específica en un formato para presentar a la legislatura** (más allá del CSV genérico de Analítica) — un informe legislativo necesita fecha de corte, firma/autoría, metodología citada en el propio documento.
- Nada sobre **rendición de cuentas inter-jurisdiccional**: si Buenos Aires y Córdoba comparten un corredor sanitario, no hay vista que junte sus brechas para coordinar un operativo conjunto financiado por ambas.
- "Supervisión de PII" es una auditoría de acceso, no una auditoría de **uso indebido político** (ej: un operador consultando datos de una localidad fuera de su competencia con fines electorales) — no hay alerta automática sobre patrones de consulta anómalos, solo el log crudo.

---

## 3. `/gob/padron` (tabs Población / Censo) y `/gob/censo`, `/gob/poblacion`

**Screenshots:** `padron-01-top.png`, `padron-02-mid.png`, `padron-03-bottom.png`, `padron-censo-tab-01-top.png`, `padron-censo-tab-02-mid.png`, `censo-01-top.png`

### El escenario
Dos preguntas distintas, dos tabs, mismo dueño de dato: (a) el encargado del programa de esterilización necesita saber si va a llegar a la meta 70/80%; (b) el responsable de calidad del registro necesita saber si el padrón está sano (activo, completo, con chip válido) antes de usarlo para cualquier otra cosa.

### Cómo ayuda
Esta es, junto con `/gob`, la mejor pantalla de la corrida en términos de honestidad del dato. El subtítulo explícito ("Población... y Censo... leen el mismo padrón desde dos preguntas distintas. Elegí la vista...") es exactamente el tipo de alfabetización de datos que el resto del portal necesita y no siempre tiene. Cada KPI dice su denominador: "meta programática 70% · 25.933 de 67.519", "Escaneada en el período: solo últimos 90 días (los eventos se purgan automáticamente)". El mapa de cobertura de esterilización por provincia con detalle CABA aparte es un buen patrón de drill-down.

En el tab Censo: "Perfiles incompletos 51.268 (76% del total · sin chip, sexo o localidad)" es un hallazgo de calidad de datos serio y bien mostrado — 76% de incompletitud sobre un padrón que ya de por sí cubre menos del 1% de la población estimada es una doble alerta que el sistema no conecta explícitamente (ver sección 2).

### Qué es débil o engañoso
- **Bug de formato de números confirmado**: en el gráfico "Altas nuevas" del tab Censo (`censo-01-top.png`), el tooltip/etiqueta del punto de datos muestra **"67519"** sin separador de miles, mientras el KPI "TOTAL REGISTRADAS" dos centímetros arriba, en la misma pantalla, muestra "67.519" con separador. Mismo número, misma pantalla, dos formatos.
- El nombre de la ruta pública (`/gob/censo`) apunta a lo que en realidad es el tab "Censo" de la página "Padrón" — semánticamente correcto (censo del padrón = auditoría de calidad del registro), pero puede confundirse con "censo poblacional estimado", que es un concepto completamente distinto que vive en otra parte del sistema (la fuente de los números de `/gob/programa`). El nombre de ruta no ayuda a distinguir ambos "censo".
- "Nacimientos registrados: 0 — Solo partos en seguimiento, subestima la natalidad real" es una buena disclosure, pero al mostrar literalmente "0" sin contexto adicional (¿0 de cuántos esperados?) puede leerse como "no hay nacimientos" en vez de "no tenemos manera de contarlos".

### Mejoras futuras
1. Corregir el mismo bug de formato de número en el tooltip del gráfico (mismo fix que en `/gob`, probablemente la misma función de formato de ejes de Recharts/D3 sin pasar por el helper es-AR).
2. Considerar renombrar la ruta/tab "Censo" a algo como "Calidad del padrón" para no competir semánticamente con el censo poblacional estimado de Programa/Analítica.

### Factores de administración pública NO cubiertos
- Nada sobre el **costo de completar el padrón** (76% incompleto) — campañas de actualización de datos suelen tener partida presupuestaria propia y no está modelada.
- No hay vínculo con **RENAPER o padrón de personas** para detectar tenencias no declaradas o duplicadas más allá del propio sistema.

---

## 4. `/gob/analitica` y `/gob/analytics` (alias idéntico)

**Screenshots:** `analitica-01-top.png`, `analitica-02-mid.png`, `analitica-03-mid2.png`, `analitica-04-bottom.png`, `analytics-01-top.png`

### El escenario
Un epidemiólogo o responsable de vigilancia sanitaria zonal revisa tasas de adopción, vacunación histórica, causas de muerte y brotes de rabia sospechados en su radio.

### Cómo ayuda
KPIs de adopción (11,2%, con proyección "a este ritmo, meta en -34 meses" — dato accionable y realista, buena práctica), vacunación histórica (55,6%), gráfico de adquisición por método, ranking de localidades por acceso ("desiertos de atención" ordenados de menor a mayor, con nota de k-anonimato para localidades <5 activos — correcto), causas de muerte (accidente, enfermedad, muerte natural, eutanasia) y un listado extenso de "Brotes históricos" de sospecha de rabia.

### Qué es débil o engañoso
- **Bug de formato confirmado, el más visible de toda la corrida**: el KPI "MASCOTAS TOTALES" en la esquina superior izquierda muestra literalmente **"67519"**, sin punto de miles — es el primer número que ve el ojo al entrar a la página, en la tarjeta más prominente, y está roto. Mismo dato que en el resto del sistema aparece correctamente como "67.519". Este bug se replica automáticamente en `/gob/analytics` porque es el mismo componente.
- La tabla "Brotes históricos" es larga (recorrí ~50 filas visibles en 3 scrolls, todas "SOSPECHA DE RABIA", sin encontrar el final salvo por el timestamp de pie de página) y no tiene: paginación visible, buscador, ni agrupación por provincia/fecha. Para un epidemiólogo que necesita reaccionar rápido a un brote real, desplazarse por una lista plana de decenas de sospechas sin poder filtrar por severidad (columna "Señales" va de 1 a 6+ sin ningún indicador visual de urgencia) es un problema de usabilidad operativa, no solo estético.
- Todos los brotes son del mismo tipo ("sospecha de rabia") — probablemente un artefacto del dataset sintético, pero si es reflejo de un catálogo real limitado, vale confirmar que el sistema soporta otros tipos de brote (moquillo, parvovirus, leptospirosis) con la misma vista.

### Mejoras futuras
1. Arreglar el formato del KPI "Mascotas totales" — mismo fix de número que arriba, altísima visibilidad.
2. Agregar filtro/búsqueda y agrupación a "Brotes históricos" — por provincia, por rango de señales, o colapsar por default mostrando solo los últimos N días con un link "ver histórico completo".
3. Un indicador visual (color/ícono) de severidad en la columna "Señales" en vez de solo el número.

### Factores de administración pública NO cubiertos
- No hay **integración con el sistema nacional de vigilancia epidemiológica** (SNVS/SISA) — los brotes de rabia notificados acá deberían, en un despliegue real, cruzar con ese sistema o al menos declarar si lo hacen.
- Nada sobre **protocolo de contención de brote** (cuarentena, radio de intervención, quién despacha el operativo) — el sistema muestra el dato pero no orquesta la respuesta.
- Sin **reporte a organismos de control/auditoría** (ej. Defensoría, Contaduría) sobre uso de fondos de campañas de vacunación vs. resultado epidemiológico.

---

## 5. `/gob/analytics/export` — Exportar datos

**Screenshots:** `export-01-top.png`, `export-02-bottom.png`, `export2-01-after-click.png`

### El escenario
Un/a analista necesita bajar datos crudos (anonimizados) para cruzar en Excel/Python fuera del portal, o para adjuntar a un pedido de informes.

### Cómo ayuda
El aviso de protección de datos personales (Ley 25.326) es explícito, dice qué NO se incluye (nombre, DNI, email, microchip), que el link vence a las 24 horas y que el uso queda en el log de auditoría — correcto y necesario. Selector de período, jurisdicción, tipo de dato (mascotas/eventos/casos/organizaciones) y formato (CSV/JSON, Parquet "próximamente").

### Qué es débil o engañoso
- Al clickear "Generar exportación" no hubo **ninguna confirmación visible** en pantalla (sin toast, sin spinner, sin cambio de estado del botón, sin mensaje de éxito o error) — ver `export2-01-after-click.png`, idéntico al estado previo al click. Puede ser que dispare una descarga de archivo fuera del DOM que este método de captura no ve, pero desde la perspectiva de un usuario real es una acción sin feedback: no sabe si funcionó, si está procesando, o si falló silenciosamente.
- Typo menor: "protección" aparece sin tilde ("proteccion") en el aviso legal — llamativo justamente porque es el párrafo que cita una ley.

### Mejoras futuras
1. Agregar estado de carga + confirmación (toast o cambio de texto del botón) al generar la exportación.
2. Corregir el typo en el aviso legal.
3. Mostrar una lista de exportaciones recientes generadas por el usuario (con su fecha de expiración) en vez de un formulario que no recuerda nada.

### Factores de administración pública NO cubiertos
- Nada sobre **firma digital o certificación** del archivo exportado para que tenga valor probatorio ante un pedido de informes formal.
- Sin integración con **Boletín Oficial o portales de datos abiertos** provinciales/nacionales para publicación periódica automática.

---

## 6. `/gob/campanas` (tab Campañas) y `/gob/outreach` → `/gob/operativos` (tab Alcance comunitario)

**Screenshots:** `campanas-01-top.png`, `campanas-02-mid.png`, `campanas-03-bottom.png`, `campanas-alcance-01-top.png`, `campanas-alcance-02-mid.png`, `outreach-01-top.png`

### El escenario
Dos momentos de un mismo trabajo: (a) "¿dónde armo el próximo operativo de vacunación/esterilización esta semana?" (Alcance comunitario) y (b) "¿cómo rindieron los operativos que ya hice?" (Campañas).

### Cómo ayuda
El tab **Alcance comunitario** es el mejor ejemplo de "de dato a acción" de toda la corrida: convierte un indicador (antirrábica vencida, 500 mascotas en 12m) en una lista rankeada por localidad con un botón "Armar operativo →" por fila. Es exactamente el patrón que le falta al resto del portal — no solo mostrar el número, sino ofrecer la acción siguiente en el mismo click.

El tab **Campañas** muestra 71 servicios con inscripciones/completitud/ausencias/prestaciones — útil para evaluar rendimiento de una campaña ya lanzada.

### Qué es débil o engañoso
- Con el filtro por defecto ("30 días"), **las 5 tarjetas KPI de Campañas y las ~71 filas de servicios muestran 0 en absolutamente todo** (inscripciones, asistencias, ausencias, impacto sanitario), con caídas de "-100% vs período anterior". Para alguien que entra por primera vez esta pantalla, parece un sistema roto o sin datos, cuando en realidad es que los operativos históricos caen fuera de la ventana de 30 días. Es la misma familia de problema que ya se corrigió en Mortalidad ("sin señal" no es "sin riesgo") — acá el equivalente es "sin actividad en la ventana" no es "la campaña no sirvió/no existe", y no hay ningún texto que lo aclare cuando todo el bloque da cero.
- El header de la tabla "Performance por servicio" dice "(71 servicios)" pero en tres capturas de scroll (top/mid/bottom) conté visualmente bastante menos de 71 filas completas antes de llegar al pie de página con el timestamp — vale confirmar si la lista realmente renderiza las 71 o si hay una lógica de corte silenciosa (paginación implícita sin control de "ver más").
- El intento de click en el filtro "Últimos 12 meses" dentro del tab Alcance comunitario falló (timeout) — ese tab no tiene selector de período visible (todas sus tarjetas dicen "NO VARÍA CON EL PERÍODO"), lo cual es coherente con su diseño ("foto del estado actual"), pero conviene confirmarlo como decisión intencional y no como control roto.

### Mejoras futuras
1. Cuando el período filtrado da 0 en todo, mostrar un mensaje explícito ("no hubo actividad de campañas en los últimos 30 días — cambiá el período o revisá Alcance comunitario para planificar la próxima") en vez de silencio numérico.
2. Confirmar/paginar correctamente la lista de 71 servicios con un contador real de "mostrando N de 71" y un "cargar más".
3. Llevar el patrón "Armar operativo →" de Alcance comunitario también a Campañas, para poder relanzar una campaña de bajo rendimiento con un click.

### Factores de administración pública NO cubiertos
- **Logística de campaña real**: no hay módulo de reserva de insumos (dosis, jeringas, chips) por operativo, ni de asignación de personal veterinario/voluntario a una fecha y locación concretas — "Armar operativo" abre una acción pero no vi (no se exploró en profundidad) si conecta con inventario o RRHH.
- Nada sobre **licitación de proveedores** de vacunas/chips ni comparación de precios entre jurisdicciones que podrían comprar en conjunto.
- Sin vínculo a **calendario administrativo** (ejercicio fiscal, fechas de rendición) que le diga al funcionario cuánto presupuesto de campañas le queda en el año.

---

## 7. `/gob/adopciones`

**Screenshots:** `adopciones-01-top.png`, `adopciones-02-mid.png`, `adopciones-03-bottom.png`

### El escenario
El responsable de un refugio o de la política de adopciones necesita saber cuántos animales están en custodia, cuánto tardan en salir, y si las adopciones "pegan" (tasa de devolución).

### Cómo ayuda
"Flujo de custodia" con conteo por etapa (ingresos, tránsito, adopciones finalizadas, devoluciones) y una nota metodológica clara sobre que cada etapa es independiente del cohorte. "Ocupación de refugios" declara honestamente "cupo no declarado" cuando no hay dato de capacidad, en vez de inventar un porcentaje. "Embudo de postulaciones" con tasa de conversión (66,7%).

### Qué es débil o engañoso
- "Custodia en refugio — Mediana (días): 0,2" es un dato sospechoso: 0,2 días (~5 horas) de mediana de estadía en refugio antes de adopción es un número que, de ser real, sería un logro extraordinario, pero con mayor probabilidad es un artefacto del generador de datos sintéticos (fechas de ingreso y adopción coincidentes). No hay alerta de "valor atípico" en esta tarjeta como sí hay en otras partes del sistema (p. ej. "valores atípicos por jurisdicción" mencionado en el subtítulo de `/admin/programa`).
- "Tasa de retorno 0,1%" es extremadamente baja — de nuevo, plausible pero no auditada por ningún control de sanity-check visible en la propia pantalla.

### Mejoras futuras
1. Aplicar el mismo detector de "valores atípicos" que ya existe conceptualmente en Admin también acá, y marcarlo cuando la mediana de custodia da un valor fuera de rango plausible.
2. Mostrar el desvío/rango (no solo mediana y P75) para que un valor como 0,2 días salte a la vista como anómalo y no como un logro.

### Factores de administración pública NO cubiertos
- Nada sobre **habilitación/inspección de refugios** (requisitos sanitarios, aforo autorizado por autoridad competente) más allá del "cupo declarado" opcional.
- Sin conexión a **convenios con ONGs/protectoras** para tránsitos ni a un registro de idoneidad de adoptantes más allá del propio embudo.

---

## 8. `/gob/rupga` → `/gob/directorio` (tab Credenciales)

**Screenshot:** `rupga-01-top.png`

### El escenario
Un/a funcionario/a necesita verificar si una persona que invoca su derecho de acceso con perro de asistencia (Ley 26.858) tiene la credencial RUPGA vigente, o revocarla si corresponde.

### Cómo ayuda
El texto introductorio cita la norma completa (Ley 26.858, Decreto 792/2019, Resolución ANDIS 2588/2022) y explica en una frase el propósito. El estado vacío ("Sin credenciales RUPGA en este estado") tiene una explicación específica y útil de por qué está vacío en vez del genérico "no hay datos" — buena práctica de UX que no vi replicada en todas las demás pantallas vacías del sistema.

### Qué es débil o engañoso
- No hay datos de prueba para validar el flujo de búsqueda/verificación/revocación real — no se pudo ejercitar el buscador con un caso concreto en esta corrida. Recomendable una segunda pasada con datos sintéticos de RUPGA cargados.

### Mejoras futuras
1. Cargar al menos un caso RUPGA de ejemplo en el dataset sintético para poder validar el flujo completo de verificación/revocación.

### Factores de administración pública NO cubiertos
- Nada sobre **interoperabilidad real con ANDIS** — el sistema dice que ANDIS emite el número RUPGA, pero no hay indicio de una integración/API, solo carga manual presumida.
- Sin proceso de **apelación o reclamo** para una persona a la que se le revoca la credencial por error.

---

## 9. `/gob/historial` — Historial de auditoría

**Screenshots:** `historial-01-top.png`, `historial-02-mid.png`

### El escenario
Un auditor interno o un responsable de cumplimiento revisa qué hizo cada usuario del sistema, cuándo, y sobre qué recurso — para responder ante una denuncia de mal uso de datos o un pedido de rendición de cuentas.

### Cómo ayuda
Filtro por acción/actor, agrupación de acciones consecutivas repetidas ("×7", "×16", "×50" con "tocá para expandir"), enlaces directos a la solicitud de vista referida, y paginación real ("Ver más antiguos →", 100 entradas visibles del total). Es una de las pantallas mejor resueltas técnicamente de la corrida.

### Qué es débil o engañoso
- Aparecen nombres de eventos internos sin traducir/humanizar: **"case_events_mutation_override"**, **"travel_export_generated"** — son literalmente nombres de tipo de evento en snake_case en inglés, mezclados con entradas bien traducidas como "Búsqueda de información personal" o "Mutación forzada de evento de mascota (override)". Para un auditor no técnico, ver `case_events_mutation_override` sin traducir es una fuga de detalle de implementación en una pantalla que por definición va a ser leída por personas no técnicas y potencialmente citada en un informe formal.

### Mejoras futuras
1. Completar el mapeo es-AR para los tipos de evento que hoy caen al nombre técnico crudo (`case_events_mutation_override`, `travel_export_generated`, y cualquier otro con el mismo patrón).

### Factores de administración pública NO cubiertos
- Sin **exportación del historial de auditoría en formato apto para un expediente administrativo** (con foliado, firma digital) — hoy es solo lectura en pantalla.
- Nada sobre **retención legal obligatoria** de estos logs (¿por cuánto tiempo hay que guardarlos según la normativa de protección de datos?) — no se ve una política de retención declarada en la UI.

---

## 10. Comparación `/gob/*` vs `/admin/*`

**Screenshots:** `admin-programa-01-top.png`, `admin-padron-01-top.png`, `admin-censo-01-top.png`, `admin-poblacion-01-top.png`

### Qué cambia entre el gemelo `/gob` y `/admin`
- El badge junto al rol pasa de **NACIONAL** (en `/gob`) a **UNIVERSAL** (en `/admin`) — la vista admin no está atada a una jurisdicción, ve todo sin partición.
- El framing del subtítulo cambia de "GOBIERNO · Resumen ejecutivo — tu jurisdicción" a "ADMIN · RESUMEN EJECUTIVO · Salud del programa — KPIs principales, valores atípicos por jurisdicción, calidad de datos y supervisión de PII" — la versión admin promete explícitamente "valores atípicos", algo que no vi resaltado como tal en ningún tile visitado (ver el hallazgo de "0,2 días" en Adopciones, que sería justamente candidato a esa detección).
- **Inconsistencia de definición del mismo KPI entre gemelos**: en `/gob/programa`, la tarjeta se llama "SLA ENO" y muestra "100% · 12 en breach activo de 24". En `/admin/programa`, la misma posición de tarjeta se llama "SLA ENO (RESUELTOS)" y muestra "12 vencidas ahora · Mediana de entrega 42 h" — mismo nombre de KPI, dos definiciones distintas del número principal (un porcentaje de cumplimiento vs. un conteo de vencidas). Un funcionario que use ambas vistas (por ejemplo, un superadmin que también opera como gob de su provincia) puede llevarse una lectura contradictoria del mismo concepto.
- `/admin/padron` pierde los filtros de Provincia/Localidad (coherente con ser vista universal) pero mantiene "Especie" — diseño razonable, aunque el subtítulo pasa de period-neutral a mencionar "ranking por provincia" sin que se vea el ranking en el viewport inicial (probablemente más abajo, no explorado en esta pasada).
- Todos los bugs de formato de número (`67519` sin separador) y la falta de disclosure en "Impacto" de Programa se replican igual en `/admin`, porque comparten el mismo componente subyacente.

### Mejoras futuras
1. Unificar la definición de "SLA ENO" entre `/gob` y `/admin` — o, si son intencionalmente distintas (una es cumplimiento, otra es cola operativa), renombrarlas para que no compartan el mismo label.
2. Si "Admin" promete "valores atípicos por jurisdicción" en su copy, agregar el detector real y mostrarlo, no solo prometerlo en el subtítulo.

### Factores de administración pública NO cubiertos (específicos de la vista Admin/superadmin)
- Nada sobre **gestión de permisos entre jurisdicciones** desde esta misma pantalla — un superadmin nacional necesitaría poder auditar o restringir qué ve cada provincia, y eso no aparece en Programa/Padrón, solo en el log de auditoría genérico.
- Sin **comparación inter-jurisdiccional formal** (benchmark entre provincias con ranking exportable para reunión de gabinete o Consejo Federal) más allá de la tabla de brechas ya cubierta en la sección 2.

---

## Resumen de hallazgos por severidad

**Alto (impacto en la narrativa/decisión pública):**
1. `/gob/programa` — columna "Impacto" mezcla estimación censal con conteo de padrón sin ninguna disclosure (ni tooltip, ni nota al pie). Máxima prioridad de fix.
2. Inconsistencia de definición del KPI "SLA ENO" entre `/gob/programa` y `/admin/programa`.

**Medio (calidad de dato / usabilidad operativa):**
3. Números sin separador de miles: línea de confianza en alertas de `/gob` (`n = 67519`), KPI "Mascotas totales" en `/gob/analitica`/`/gob/analytics` (`67519`), tooltip del gráfico "Altas nuevas" en Padrón/Censo (`67519`).
4. `/gob/campanas` (tab Campañas) muestra 0 en todo con el filtro por defecto, sin explicar que es un artefacto de ventana temporal, no ausencia de actividad real.
5. Sin confirmación visible al generar una exportación en `/gob/analytics/export`.
6. Valor sospechoso sin flag de outlier: "0,2 días" de mediana de custodia en `/gob/adopciones`.

**Bajo (pulido):**
7. Nombres de evento técnicos sin traducir en `/gob/historial` (`case_events_mutation_override`).
8. Typo "proteccion" sin tilde en el aviso legal de exportación.
9. Tabla "Brotes históricos" larga sin paginación/búsqueda/agrupación visible.

---

## Factores de administración pública transversales, no cubiertos en ninguna pantalla

Estos aplican al portal completo, no a una vista puntual:

1. **Ciclo presupuestario**: ningún KPI de brecha se traduce a costo estimado ni se vincula a una partida o ejercicio fiscal.
2. **Procuración/licitación de insumos**: el sistema mide déficit de vacunas/chips pero no dispara ni sugiere pedidos de compra, ni compara proveedores.
3. **Dotación y logística de personal**: no hay módulo de asignación de veterinarios/voluntarios a operativos, ni cálculo de si el personal actual alcanza para cerrar una brecha en el plazo de la meta.
4. **Rendición de cuentas formal**: no hay exportación con valor probatorio (firma digital, foliado) para presentar ante legislatura, Contaduría o Defensoría — el CSV genérico no alcanza para un expediente administrativo.
5. **Coordinación inter-jurisdiccional**: no hay vista que permita a dos o más provincias planificar un operativo conjunto o comparar formalmente su desempeño para una reunión de Consejo Federal.
6. **Interoperabilidad con otros sistemas del Estado**: SNVS/SISA para vigilancia epidemiológica, ANDIS para RUPGA, RENAPER para personas — se citan las normas pero no hay evidencia de integración real, solo de carga/consulta manual dentro del propio sistema.
7. **Política de retención de datos y auditoría** declarada en la propia UI (cuánto tiempo se guardan los logs, quién puede purgarlos).
