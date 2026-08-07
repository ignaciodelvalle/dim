# Plan Maestro — Integridad por construcción

> Síntesis de 5 reviews adversariales (funcionario primerizo, principal-UX, decision-quality,
> auditoría de sector público, red-team de decisión) + nuestros 4 audits internos, ~35 hallazgos
> verificados. Mandato del PO: **cada hallazgo es un síntoma; corregir el sistema que lo permitió**,
> para que las pantallas futuras salgan naturalmente más claras, consistentes, mantenibles,
> extensibles y difíciles de mal-usar — sin review manual constante.
>
> Método probado del proyecto (no cambia): **primitivo → fence en CI → barrido**. Lo que cambia:
> lo subimos por la pila. Hoy la capa de DATOS está fenceada (scope engine + subsumption fence +
> k-anon + parity harness — Roadmap-10 F1, hecho). Los 5 reviews golpean las capas SIN fence:
> presentación, lenguaje, estado-de-vista e IA.

## 0. Diagnóstico raíz en una línea

**Un número correcto, presentado sin contrato, con una palabra sin contrato, en una pantalla sin
decisión dueña, produce una decisión incorrecta.** Los datos ya son honestos por construcción;
la interpretación todavía es honesta solo por disciplina. Este plan fencea la interpretación.

## 1. Síntoma → Sistema (los ~35 hallazgos mapeados)

| # | Debilidad sistémica (el "sistema que lo permitió") | Síntomas que genera |
|---|---|---|
| **S1** | **Los números no tienen contrato.** Un KPI es un fetcher + un label + un color decididos ad-hoc por cada pantalla. Nada obliga a declarar pregunta, denominador, ventana, especie, meta+fuente, confianza, ni cuándo un color es legítimo. | Doble antirrábica (perros-12m vs histórica) · mortalidad stock-vs-flujo · PPP semáforo como veredicto legal · reunificación 100% junto a 68 perdidas · −95% MoM sobre base inestable · 0/0→0% en home (latente) · ranking sobre métrica histórica · tile insensible al período · "activas" vs denominador active+lost · muros de KPIs a peso igual (parcial) · censo invisible en el número primario (parcial) |
| **S2** | **Las palabras no están atadas al comportamiento.** CTAs, badges y términos legales/de urgencia son strings libres; nada garantiza que "acta" emita un acta, que "cola" lleve a una cola, que "(1 d)" signifique días vencidos, o que "riesgo" mida riesgo. | CTA "Acta de infracción"→cola · "Ver en su cola"→mapa · badge SLA muestra el tier como si fuera overdue · bivariado "riesgo" = intensidad de reporte · "notificada" ENO ambigua · claim "diario" con cron pausado · RUPGA sin expandir · glosario ausente (PPP/ENO/AMR) |
| **S3** | **Dos fuentes de verdad para "qué estoy mirando".** El chrome lee las asignaciones de la sesión; las queries leen el filtro; los exports/captions leen a veces uno y a veces otro. | Badge "1774 LOCALIDADES" con CABA filtrado · censo suprimido para govt multi-localidad aunque la vista agregue provincias · export que tiraba province/locality (instancia arreglada; sistema no) · period URL vs copy en Panorama (repro pendiente) · god-scope default → timeouts |
| **S4** | **La honestidad se enforce en los datos, no en la presentación.** Query-level tenemos fences; render-level no hay guardas: N chico, 0/0, deltas sobre base inestable, y "vacío" que no distingue *cero medido* de *ausencia de señal*. | 100% con N=2 · mediana 0 · 0 observaciones leído como "controlado" (690 mordeduras sin escalar) · vacíos de vigilancia = "tranquilo" en vez de "ciego" · brecha de escalamiento invisible |
| **S5** | **El contenido demo no está sujeto a los invariantes de producción.** El seed escribe lo que quiere; ningún gate valida que lo renderizable parezca real. | PANO-Seed-Owner / PANO-HIST-WEL-* en fichas · cuenta de 1774 localidades · backlog histórico gritando "crítico/SLA" (status sin correlacionar con edad) · 1 org → −95% · feed monótono |
| **S6** | **La IA refleja el árbol de módulos, no el trabajo del funcionario.** Cada capability = un ítem de nav par; colas y tableros mezclados; ninguna pantalla declara su decisión dueña. | 26 destinos · Moderación/Maltrato/Casos/Cola sin mapa mental · feed héroe sin acción · dashboards sin "qué hago ahora" · default "Todas" en maltrato · Outreach decorativo sin pipeline |

Transversal (infra de confianza): frescura-como-copy (S2+S3), ENO delivery-status (S2), privacy-text
drift (S2), MPF single-jurisdiction (capability gap → feature cascade), escala nacional (PF1 →
Roadmap-10 F4).

## 2. Los 6 contratos (primitivo → primeros consumidores → fence → barrido)

Regla del plan: **ningún fix aterriza suelto** — cada fix verificado es el *primer consumidor* del
contrato que mata su clase. Así los quick-fixes urgentes de demo llegan temprano SIN violar el
mandato de causa-raíz.

### C1 · Contrato de Métrica — `MetricDescriptor` (mata S1 + la mitad de S4)
*Es Roadmap-10 Fase 2, ahora con spec completa validada por 3 reviews externos.*
- **Primitivo:** todo KPI renderizado DEBE provenir de una entrada del catálogo que declara:
  `pregunta · numerador · denominador(es, dual cuando hay censo) · ventana · especie ·
  kind(stock|flow|rate) · meta + fuente-de-la-meta (ley/programa/benchmark) · exclusiones ·
  confianza (cobertura de padrón, celdas suprimidas, frescura) · política de semáforo (contra qué
  se pinta y cuándo NO se pinta) · guardas de presentación (smallN→gate, 0/0→"—", delta suprimido
  sobre base inestable, ausencia≠cero) · próxima acción si está en rojo`.
  El renderer (`OpKpi`/KpiRenderer) consume descriptores; las guardas viven UNA vez en el renderer.
- **Primeros consumidores (fixes verificados):** gate de mortalidad en home (0/0) · reunificación
  co-headline stock+tasa + gate N chico · una antirrábica de decisión (perros-12m; histórica
  renombrada, solo Profundidad — PO lockeado) · PPP "adopción MiMAR" vs "cumplimiento externo" ·
  supresión del −95% MoM sobre base inestable · denominador dual antirrábica donde el censo aplique ·
  microchip wording del denominador · KPI de brecha de escalamiento (mordeduras vs observaciones).
- **Fence:** `lint:metric-contract` — prohibido renderizar valor+label KPI fuera del descriptor
  (baseline + ratchet, como siempre). El kpi-catalog.ts existente es el embrión: se expande de
  "docs" a "contrato ejecutable".
- **Test de aceptación:** la **suite del lector hostil** — la tabla de "narrativas opuestas" del
  red-team se convierte en tests: para cada par, el tile renderizado DEBE portar la información que
  desarma la narrativa incorrecta (denominador visible, stock junto a tasa, confianza, etc.).

### C2 · Contrato de Lenguaje Operativo (mata S2)
- **Primitivo:** (a) **registro de CTAs/nav**: todo CTA operador declara destino + clase de
  capability del destino (`queue | map | form | report | config`); el label se valida contra la
  clase — no podés etiquetar "cola" un link a un mapa, ni nombrar un instrumento legal ("acta") sin
  un flujo que lo emita. (b) **vocabulario restringido**: términos legales/de urgencia (`acta, SLA,
  vencido, crítico, peligro, riesgo, notificada, habilitación`) solo renderizan desde componentes
  tipados — p.ej. `SlaBadge{daysOverdue, tierDays}` que imprime honesto ("SLA 1 día · vencido hace
  899") en vez del tier disfrazado. (c) **glosario**: una expansión canónica por sigla (RUPGA, PPP,
  ENO, AMR), primera aparición auto-expandida.
- **Primeros consumidores:** fix del badge SLA (el bug de confianza #1) · renombres "Acta de
  infracción"→"Denuncias" y "Ver en su cola"→"Ver en el mapa" (o ruteo a cola real) · bivariado
  "riesgo"→"intensidad de reporte" hasta normalizar · RUPGA expandido + empty accionable · labels
  de estado ENO ("registrada y en cola — transmisión pendiente de endpoint receptor", NO
  "próximamente": el pipeline existe y audita) · flecha ASCII.
- **Fence:** `lint:copy-contract` — vocabulario restringido fuera de componentes tipados + siglas
  fuera del glosario + labels de nav validados contra la clase del destino.

### C3 · Un solo ViewScope (mata S3)
- **Primitivo:** `ProjectionContext` (ya existe y las queries ya lo consumen) se vuelve LA fuente
  para TODO lo que describe la vista: chrome/badges ("Vista: CABA · filtro activo" — nunca la
  asignación de sesión), captions, exports, elegibilidad censal y defaults. Elegibilidad censal se
  resuelve EN el ctx: si la vista agrega provincia entera, el censo aplica aunque las asignaciones
  sean grano-barrio (el fix estructural del red-team). Default **local-first** (PO lockeado):
  jurisdicción asignada primero, nacional = drill explícito (mata god-scope + timeouts de primer clic).
- **Primeros consumidores:** chrome del layout gob · badge de localidades · captions de export ·
  gating censal de `govt-home-kpis` · repro y fix del period-drift de Panorama.
- **Fence:** extender `lint:scope` — prohibido que chrome/captions lean `session.jurisdictions`
  directo; todo por ctx.

### C4 · Guardas de presentación + estados epistémicos (mata el resto de S4)
- **Primitivo:** las guardas viven en el renderer vía descriptor (C1). Lo que excede al KPI:
  el sistema de estados (Ola 2) gana **naturaleza epistémica** — `EmptyState` distingue
  `measured-zero` ("se midió y dio 0") de `no-signal` ("MiMAR no recibió señales — sin
  notificaciones ≠ sin enfermedad") con copy y tono distintos.
- **Primeros consumidores:** vacíos de vigilancia/brotes ("ciego, no tranquilo") · todos los
  empty-states de superficies epidemiológicas.
- **Fence:** extensión de `lint:states` (naturaleza obligatoria en superficies de vigilancia).

### C5 · El seed es ciudadano de primera (mata S5)
- **Primitivo:** los generadores de seed respetan invariantes de realismo: status correlacionado
  con edad (viejo→cerrado), cuentas con forma de rol real (lucas@ = 1 provincia), multi-org,
  variedad de tipos de evento; y un validador post-seed que consulta la DB buscando patrones
  seed-identificables en columnas renderizables.
- **Fence:** `lint:no-seed-ids` — patrones `PANO-Seed|PANO-HIST|...` prohibidos en superficie
  operador (fence estático) + el validador post-seed (gate dinámico).
- **Barrido:** extender seed-demo-polish a `display_name` + descripciones welfare; re-seed.

### C6 · IA de 5 capas + gramática de workqueue (mata S6) — *la iniciativa mayor, PO-dirigida*
- **Primitivo conceptual:** `BRIEFING → SITUACIÓN → PROGRAMA → INTERVENCIÓN → PROFUNDIDAD`, y
  **colas ≠ tableros** (maltrato/moderación/decomisos/cola = bandeja operativa con gramática
  inbox→tomar→actuar→cerrar). **Toda pantalla declara su decisión dueña** (manifest por pantalla —
  la lente D3 de nuestro audit, ahora obligatoria); si no hay decisión, es reporte o cola, no
  dashboard.
- **Ya lockeado por PO:** iniciativa comprometida post-quick-fixes · maltrato default "sin asignar
  abiertas" + histórico demotado · journey único de Denuncias · Briefing reemplaza el feed héroe
  (3-5 trabajos del día, alertas priorizadas gap×población×tendencia, forecast-a-meta) · Outreach
  como pipeline de intervención (filtros + CTA de asignación) · Vigilancia se parte
  (epidemiología→Situación, cumplimiento→Programa).
- **Fence:** el manifest por pantalla es lintable (pantalla nueva sin decisión declarada = falla CI).
- **Dependencia dura:** C6 se construye SOBRE C1-C3 — rediseñar la IA sin contratos reproduce
  las mismas debilidades con otra cara.

### Infra de confianza (transversal, con dueños)
- **Frescura como dato, fail-closed:** los claims de frescura derivan de `cron_runs` (telemetría
  que YA existe), nunca de copy. Si el pipeline no corrió, la UI lo dice. Cadencia real del plan
  Hobby reflejada (upgrade a Pro = decisión $ del PO).
- **MPF formato por jurisdicción con fallback local→provincial→nacional** — feature nueva reusando
  la máquina de cascade de Reglas (`resolveBusinessRule`); pantalla de config + resolución en el
  export. (Idea del PO, aprobada.)
- **Privacy-text audit** (mío): captura real de ubicación vs texto jun-2025; alinear o flagear a legal.
- **Escala:** read models incrementales (Roadmap-10 F4) absorben PF1 — DESPUÉS de C1 (el catálogo
  define QUÉ materializar). Sin cambio de orden.

## 3. Secuencia

| Ola | Contenido | Por qué en este orden |
|---|---|---|
| **I** | **C2 (lenguaje) + C5 (seed) completos; C1 arrancado** (descriptor spec + renderer + primeros 8 consumidores) | C2/C5 son baratos, independientes y matan los síntomas que destruyen confianza en el demo (SLA, CTAs, seeds). C1 es el linchpin — empieza ya. |
| **II** | **C1 completo (barrido de ~80 tiles + fence + suite lector-hostil) + C3 (ViewScope) + C4 (epistémico)** | Con el catálogo ejecutable y una sola fuente de vista, toda pantalla existente queda honesta por construcción. |
| **III** | **C6 (IA 5 capas + workqueues)** — la iniciativa de diseño, PO-dirigida, construida sobre I+II | Las pantallas nuevas nacen con contrato de métrica, lenguaje y scope. |
| **IV** | **Escala + cierre:** read models (F4/PF1), MPF cascade, forecast-a-meta, peer comparison | La capa de performance y las features que el catálogo habilita. |

## 4. Criterios de aceptación (del sistema, no de los fixes)

1. **Test de los 90 segundos** (QA #3): un funcionario responde en 90s — qué está fuera de meta,
   dónde se concentra, qué hago esta semana, con qué certeza.
2. **Suite del lector hostil** (QA #5): ninguna de las narrativas-opuestas es construible desde el
   número primario + color; cada tile porta su desambiguación. Corre en CI.
3. **Test parlamentario** (QA #4): screenshot de cualquier superficie operador sobrevive a una
   consulta — sin seeds, sin SLA falso, sin frescura mentirosa, sin scope-chrome mentiroso.
4. **Test del futuro desarrollador:** crear una pantalla nueva con un KPI sin descriptor, un CTA
   sin clase, o sin decisión declarada → **CI falla**. La calidad deja de depender de review manual.

## 5. Métricas de éxito (los 5 objetivos del PO)

| Objetivo | Métrica |
|---|---|
| Menos defectos futuros | Clases de defecto que NO PUEDEN recurrir (fences): hoy 8 clases fenceadas (tokens, scope, subsunción, estados, iconos...) → +4 (métrica, lenguaje, view-scope, seed). Cada review adversarial futuro debería rendir hallazgos decrecientes por clase fenceada. |
| Menos carga cognitiva | Nav 26 ítems → 5 capas + bandeja · 100% pantallas con decisión dueña declarada · 0 muros de KPI sin jerarquía |
| Más calidad de decisión | Suite lector-hostil verde · % KPIs con denominador/confianza visibles · guardas smallN/0-gating al 100% de tiles |
| Más confianza institucional | Test parlamentario verde · frescura fail-closed · 0 seed-IDs (fence) · SLA/CTAs honestos |
| Más consistencia de implementación | % KPIs vía descriptor (0→100 con ratchet) · % CTAs vía registro · las pantallas nuevas heredan todo por defecto |

## 6. Decisiones PO ya lockeadas que este plan absorbe
Rediseño 5-capas = iniciativa mayor · maltrato "sin asignar abiertas"+histórico demotado ·
scope local-first · una antirrábica de decisión · ENO label honesto (pipeline real, endpoint
pendiente) · MPF cascade config · cron Hobby (upgrade = PO) · privacy-text lo audito yo ·
owner-nudges borrado · reversa de adopción custody→org+re-publicar (hecho).

## 7. Gated (PO)
Upgrade Vercel Pro (frescura diaria real) · migración saved-views server-side · validación visual
de cada entrega de C6 · push/cutover #760 · aplicar migraciones a remoto.
