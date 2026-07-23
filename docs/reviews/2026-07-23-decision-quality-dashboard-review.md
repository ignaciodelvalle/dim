# Decision quality review — Admin + Gobierno

**Fecha:** 2026-07-23  
**Método:** solo browse en `http://localhost:3000` (sin leer el repo)  
**Actor:** `admin@dim.test` — Superadmin Nacional (no Lucas)  
**Portales:** Admin universal → Portales → Gobierno (alcance Nacional)

**Criterio:** cada pantalla debe responder *pregunta → beneficiario → acción → decisión*. Si falta alguno, el tablero falla. No es review estética.

---

## Veredicto

**42/100 — calidad de decisión.**

Hoy miMAR es un inventario rico de indicadores (a menudo honestos a medias), no un sistema de decisión. Hay piezas de clase mundial — alertas priorizadas con confianza + cita legal; Operativos con pregunta de acción; Panorama con presets; denominadores duales — diluidas en redundancia, “rojo total”, forecasts sin plan y brechas de respuesta sanitaria no jerarquizadas.

| Señal | Valor |
|---|---|
| Score decisión | 42/100 |
| Pantallas con patrón fuerte | 3 |
| Fallos estructurales | 7 |
| Destinos de nav competidores | 20+ |

---

## Por pantalla — ¿responde una decisión?

| Pantalla | Pregunta | Decisión soportada | Grado |
|---|---|---|---|
| Admin · Panel | ¿Qué colas / crons están rotos hoy? | Triaje operativo de plataforma | Parcial |
| Admin · Sistema | ¿La plataforma está sana para operar? | Reparar crons / SLA ENO | Fuerte |
| Admin · Programa | ¿Cómo va el programa nacional vs meta? | Priorizar provincias | Débil |
| Admin · Padrón | ¿Crece sano el padrón / contención poblacional? | Campañas de esterilización | Débil |
| Admin · Inteligencia | ¿Dónde hay brecha territorial / efecto de política? | Elegir jurisdicción a intervenir | Parcial |
| Admin · Adopciones | ¿Fluye la custodia hacia hogar permanente? | Capacidad / embudo | Parcial |
| Gob · Panel (Nacional) | ¿Qué debo mirar primero hoy? | Prioridad del día | Parcial+ |
| Gob · Vigilancia | ¿Hay brote / incumplimiento sanitario activo? | Abrir investigación / observación | Parcial |
| Gob · Panorama | ¿Dónde se concentra el riesgo geográfico? | Zoom territorial | Parcial+ |
| Gob · Pérdidas | ¿Dónde priorizar reunificación? | Hotspots / casos urgentes | Falla |
| Gob · Mortalidad | ¿Cumplimos trazabilidad de disposición? | Cerrar brecha Ley 5470 | Parcial |
| Gob · Programa | ¿Brechas de cobertura vs meta? | Asignar esfuerzo programático | Débil |
| Gob · Analítica | ¿Tendencias estructurales / ranking? | Comparación estratégica | Parcial |
| Gob · Operativos | ¿Dónde y cómo intervengo esta semana? | Lista objetivo de campaña | Mejor patrón |

---

## Hallazgos que degradan decisión

### F1 — Catálogo de módulos ≠ sistema de decisión

**Evidencia:** Admin ~20 ítems; Gob ~20 ítems. Panel, Programa y Analítica repiten antirrábica / chip / esterilización con fracciones distintas.

**Impacto:** el funcionario no sabe qué pantalla es la fuente de verdad para “hoy tengo que decidir X”.

### F2 — Rojo total = sin priorización

**Evidencia:** Programa Admin: “24 provincias en alerta” y “72 de 72 combinaciones bajo meta”. Inteligencia: Salta 35 vs La Pampa 70, pero no hay “gap × población”.

**Impacto:** si todo está en peligro, nada está en peligro. No hay ranking accionable.

### F3 — Brecha de respuesta sanitaria oculta

**Evidencia:** Vigilancia: 1.495 mordeduras (12m) vs 0 observaciones rábicas abiertas; cumplimiento 10d 18,8%; 138 brotes activos y 0 casos bajo investigación.

**Impacto:** la decisión crítica (escalar observación / abrir caso) no es el KPI #1; el sistema mide incidencia sin medir respuesta.

### F4 — KPIs contradictorios / denominadores frágiles

**Evidencia:** Panel: esterilizaciones −85% / −95% MoM sin causa. SLA ENO “100%” junto a “12 en incumplimiento”. Pérdidas: reunificación 100% con n&lt;5. Padrón: nacimientos 0 y altas netas +65.145 con el mismo subtítulo.

**Impacto:** un decisor puede celebrar o alarmarse por el número equivocado.

### F5 — Forecast sin plan

**Evidencia:** Programa proyecta antirrábica (linear, n=13). Analítica: “meta en ~27 meses”. Ninguno dice cuántas dosis / barrios / cupos faltan.

**Impacto:** la proyección informa curiosidad, no presupuesto ni operativo.

### F6 — Operativos: mejor pregunta, peor lista

**Evidencia:** título “¿Dónde y cómo intervengo esta semana?” + pipeline antirrábica → 500 filas “Apolo… sin registro”.

**Impacto:** el patrón decisión→lista es correcto; la ejecución actual no prioriza territorio ni genera confianza.

### F7 — Ruido de demo / PII en vista nacional

**Evidencia:** Pérdidas lista dueños y coords a escala nacional; casi todos “Marisa Funes”. Mi actividad muestra “Mutación forzada de evento” repetida.

**Impacto:** envenena confianza y mezcla cola táctica con vigilancia estratégica.

---

## Criterios transversales

### Lo que ya funciona

- Alertas con prioridad + confianza (n) + cita legal
- Dual denominator padrón vs censo (cuando existe)
- Disclaimers: k-anon, forecast no garantía, embudo no cohorte
- Panorama preset = pregunta (“Brotes activos”)
- Operativos: del indicador a lista auditada
- Admin Sistema: crons caídos con acción clara

### Lo que falla sistemáticamente

- Jerarquía: demasiados KPIs al mismo peso visual
- Benchmarks presentes, recomendaciones ausentes
- Comparación provincial sin peso poblacional
- Tendencias MoM sin explicación / descomposición
- Incertidumbre a veces bien, a veces contradice el número grande
- Drill-down a listas sin ranking de intervención

---

## Observaciones por superficie (evidencia browse)

### Admin · Panel

- Colas: 1 matrícula pendiente (más vieja 6d), 1 alerta, **12 SLA outbox**, **908 casos abiertos**, 0 observaciones.
- Banner: **5 procesos automáticos caídos**.
- Métricas: 4.056 usuarios personales, 130 instituciones, 2 decisiones / 7d.
- El “mapa del sitio” duplica el menú → ruido.

### Admin · Programa (“Salud del programa”)

- KPIs: 67.167 registradas; esterilización 38,6% (meta 70%); microchip 36,4% (meta 80%); SLA ENO 100% con 12 en incumplimiento; cola más vieja 6d; **24 provincias en alerta**.
- Tabla de outliers: **72/72** bajo meta (microchip / esterilización / antirrábica por provincia).
- Forecast linear de vacunación (n=13) con disclaimer — sin cupos faltantes.

### Admin · Padrón

- Título pregunta bueno: “¿Crece sano el padrón…?”
- Esterilización 38,6%; preñeces 0; nacimientos 0; altas netas **+65.145** (mismo subtítulo de subestimación).
- Leak técnico: `pregnancy_status='in_progress'` en UI.

### Admin · Inteligencia

- Índice compuesto (antirrábica 80% / esterilización 70% / chip 80%): La Pampa 70 … Salta 35.
- “Política → resultado” ±60d: mayormente enmascarado por privacidad / reglas de test.
- Calidad de datos alta (~77–83) — no explica el fracaso programático.

### Admin · Adopciones

- Embudo no-cohorte (disclaimer correcto): ingresos 1.120 / tránsito 1.133 / finalizadas 1.623 / devoluciones 0,1%.
- En tránsito activo = 0; cupo de refugio “no declarado”.

### Admin · Sistema

- Mejor pantalla admin para su rol: crons en FALLO con impacto y “avisá a soporte”.
- SLA ENO: 12 vencidas ahora vs “cumplimiento histórico 100%”.

### Gob · Panel (Nacional)

- Alertas priorizadas fuertes: microchip 36% (n=67.167), disposición 32% (n=2.022), antirrábica 64% (n=37.110).
- Grid denso: esterilizaciones −85,3% MoM; enfermedades notificadas 126 (30d); chip 36,4%; disposición 31,9%.
- Cola operativa: 1.144 denuncias, 908 casos, 109 perdidas.

### Gob · Vigilancia

- Brotes activos 138; rábicas activas 12; brecha mordeduras vs observaciones **1.495 vs 0**.
- Cumplimiento observación 10d **18,8%** (3 abiertas &gt; 10d).
- CTA “Abrir investigación” presente — pero 0 casos bajo investigación activa.
- AMR densidad 0 / 1.000 se lee como éxito vacío.

### Gob · Panorama

- Preset “Brotes activos”; capas zoonosis + cobertura; modo bivariado disponible.
- KPI chip: cobertura 64,4%; señales 442; mordeduras 1.495.
- Dock “Registros” puede mostrar 0 mientras hay actividad — fricción cognitiva.

### Gob · Pérdidas

- 109 activas; reunificación **100%** con aviso n&lt;5 (2 de 2).
- Lista nacional con dueño + coords; seed “Marisa Funes” dominante → falla de confianza y de priorización.

### Gob · Mortalidad

- 2.022 muertes (+76% vs período); trazabilidad 31,9% (meta 75%); desconocida 25,8%.
- Rollup “Santiago del Estero (otras localidades) **1.965**” domina el chart de localidades.

### Gob · Programa / Analítica

- Mismos tres % de cobertura que Panel/Admin.
- Analítica vive en `/gob/analytics` (nav OK); `/gob/analitica` → 404 si se tipea.
- “→ a este ritmo: meta en ~27 meses” sin plan de recursos.
- Distinción histórica vs 12m está documentada — bien — pero compite visualmente con el KPI de cumplimiento.

### Gob · Operativos

- Mejor framing del sistema: “¿Dónde y cómo intervengo esta semana?”
- Pipeline antirrábica → lista PII auditada → **… y 450 más** de nombres “Apolo”.
- Falta agregación geográfica priorizada antes del dump de filas.

---

## Rediseño conceptual (no visual)

Misma marca, mismos datos. Cambiar qué pregunta organiza cada superficie y qué se omite deliberadamente.

### L1 — Centro de Decisión Diaria (único home)

**Pregunta:** ¿Cuáles son las 3 decisiones de hoy?

Cada ítem: evidencia + confianza + acción recomendada + dueño + plazo.

Ejemplos observados hoy:

1. Abrir/escalar observaciones ante 1.495 mordeduras / 0 abiertas  
2. Microchip 36% — top 5 provincias por gap × población  
3. 12 ENO fuera de SLA + 5 crons caídos (si rol admin)

Todo lo demás colapsa en “más señales”.

### L2 — Situación (Panorama + Vigilancia fusionados)

**Pregunta:** ¿Dónde hay riesgo y falta respuesta institucional?

KPI primario = **Brecha de respuesta** (mordeduras / denuncias / señales vs observaciones / casos / investigaciones).

Mapa siempre bivariado: intensidad del fenómeno × capacidad de respuesta.

Presets solo como decisiones (“¿Hay rabia sin observación?”, “¿Cobertura baja con señales altas?”).

### L3 — Programa & Equidad (un solo scorecard)

**Pregunta:** ¿A qué territorios asigno cupos / presupuesto?

Una fila por jurisdicción:

- cobertura (padrón)  
- cobertura (censo)  
- gap a meta  
- población afectada  
- tendencia  
- proyección de meses a meta  
- dosis / cirugías / chips faltantes  

Ranking por **impacto esperado**, no por % solo.

Eliminar la duplicación Panel ↔ Programa ↔ Analítica de los mismos tres %.

### L4 — Acción (Operativos como destino, no anexo)

**Pregunta:** ¿Qué lista ejecuto esta semana?

Flujo: territorio priorizado → cupo de campaña → export CSV / asignación a equipo.

Primero agregados por barrio/localidad; PII solo tras confirmación de operativo.

Nunca 500 nombres sin ranking geográfico.

### L5 — Plataforma (solo Admin)

**Pregunta:** ¿Puede el Estado confiar en que el sistema opera?

Crons, SLA ENO, colas de aprobación, deriva de caché.

Separado del scorecard sanitario para no mezclar “falló el cron” con “cayó la cobertura”.

---

## KPIs: cortar / agregar / corregir

### Cortar (ruido)

- Mapa del sitio en Panel Admin  
- “Provincias en alerta: 24” como KPI  
- Reunificación 100% con n&lt;5 en hero  
- Vacunación histórica vs 12m sin rol distinto  
- AMR 0 sin interpretarlo como “sin dato / sin uso”  
- Listas nacionales de PII en Pérdidas  

### Agregar (faltan)

- Brecha de escalamiento (hecho vs respuesta)  
- Gap × población (impacto)  
- Cupos / dosis faltantes a meta  
- Tiempo a decisión / SLA de cola de casos  
- Cobertura de registro vs censo siempre visible  
- Recomendación explícita por alerta  

### Corregir (engañan)

- SLA ENO 100% + 12 breach → un solo estado  
- −85% MoM esterilización → descomponer  
- Embudo adopciones no cohorte → no llamar “embudo” sin más  
- Rollup “Santiago del Estero (otras)” 1.965  
- `pregnancy_status` en UI ejecutiva  
- `/gob/analitica` 404 si se tipea mal  

---

## Narrativa objetivo (storytelling de gobierno)

### Un día en el Centro de Decisión

1. Abrís el home: **tres decisiones**, no quince tarjetas.  
2. Elegís “escalar rabia”: Panorama ya filtrado a mordeduras sin observación.  
3. Confirmás cupo semanal en Operativos por localidad.  
4. El scorecard de Programa actualiza la proyección de meses-a-meta con el cupo comprometido.  
5. Admin solo entra si el sistema avisa que ENO/crons impiden cerrar el circuito.

Eso convierte miMAR de “plataforma con muchos dashboards” en **instrumento de gobierno sanitario**.

---

## Método / límites

- Solo browse en `:3000` con admin (Portales → Gobierno, alcance Nacional).  
- No se leyó el repo para esta evaluación.  
- Datos de demo sintéticos — los fallos de decisión se juzgan por **diseño de información**, no por realismo epidemiológico del seed.
