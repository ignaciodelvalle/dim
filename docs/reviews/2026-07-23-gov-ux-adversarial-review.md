# Evaluación adversarial UX — miMAR Gobierno

**Fecha:** 23/7/2026  
**Método:** browse-only · `http://localhost:3000` · sin lectura de repo  
**Sesión:** Lucas Etcheverry · miMAR Gobierno · GOB / CABA  
**Rol del evaluador:** funcionario senior, sin entrenamiento, escéptico, impaciente  
**Objetivo:** maximizar razones para NO desplegar a escala nacional  

---

## Executive Summary

**¿Aprobaría el despliegue nacional?** **NO**

El Panel luce serio (citas legales, timestamps, “confianza”), pero en ~15 minutos de trabajo real aparecieron: datos que se contradicen, colas legales sin dueño, observaciones rábicas fuera de plazo, ENO sin receptor, y branding de Ministerio mezclado con “datos de demostración”.

**Confianza para firmar un acto administrativo con esta UI: 2/5.**

---

## Top 10 issues más severos

| # | Severity | Location | Summary |
|---|----------|----------|---------|
| 1 | Critical | `/gob/perdidas` | Las mismas 8 mascotas figuran como perdidas, recuperadas y fallecidas (todas «Perdida») |
| 2 | Critical | `/gob/denuncias?etapa=triage` | CRÍTICA sin asignar 311 días; ~28 SLA vencidos; 48 sin asignar / 0 mías |
| 3 | Critical | `/gob/vigilancia` | 3 observaciones rábicas fuera del plazo legal 10d; ENO «endpoint pendiente» |
| 4 | Critical | `/gob/panorama` + `/` | Badge «Datos de demostración» + claim «Ministerio de Salud / registro nacional» |
| 5 | High | `/gob` Panel | Enfermedades notificadas «2» vs desglose «0 lepto · 1 hidat» |
| 6 | High | `/gob/denuncias` | Título «Paso 3 · Caso» con pestaña Triage activa |
| 7 | High | `/gob` Cola operativa | Clic en «Denuncias de maltrato 48» no navega |
| 8 | High | `/gob/vigilancia` | Brotes activos 2 / investigación activa 0 — informa, no decide |
| 9 | High | Rail `/gob` | ~18 ítems; «Cola» ≠ cola de denuncias |
| 10 | High | Sesión | 2 kicks a `/login` a mitad del recorrido |

---

## Scores (1–10)

| Dimensión | Score | Nota |
|-----------|------:|------|
| Clarity | 3 | Paso 3 vs Triage; jerga; truncados |
| Trust | 2 | Demo + aritmética + listas contradictorias |
| Government Readiness | 2 | ENO pendiente; SLA rábico vencido |
| Dashboard Quality | 4 | Timestamps sí; decisión no |
| Ease of Learning | 3 | 18 ítems; colas homónimas |
| Information Architecture | 3 | Catálogo de módulos, no día de trabajo |
| Decision Support | 2 | Informa, no dirige |
| Accessibility | 4 | Skip links sí; contraste uneven |
| Consistency | 3 | Redondeos / Cola / Caso |
| Confidence (actuar) | 2 | No firmaría un acto con esto |
| **Overall Readiness** | **2** | **NO aprobar despliegue** |

---

## Hallazgos detallados

### Issue 1

- **Severity:** Critical  
- **Category:** Data  
- **Location:** `/gob/perdidas`  
- **Description:** Las mismas 8 mascotas (Bruno, Toby, Fido, Toto, Perla, Thor, Laika, Luna) aparecen bajo «Mascotas perdidas (8)», «Mascotas recuperadas (8)» y «Mascotas fallecidas (8)», todas con estado «Perdida».  
- **Why this matters:** Un funcionario no puede saber si un animal está perdido, recuperado o muerto. Cualquier decisión operativa o cifra de reunificación es basura.  
- **Impact on first-time users:** Abandono inmediato del módulo. Informe a superior: «el sistema miente».  
- **Recommended improvement:** Particionar listas por estado real; un animal en un solo bucket; vacíos honestos si no hay recuperadas/fallecidas.  
- **Which design principle failed?** Data Quality + Government Trust  
- **Confidence to act on this screen:** 1/5  

### Issue 2

- **Severity:** Critical  
- **Category:** Government Compliance  
- **Location:** `/gob/denuncias?etapa=triage`  
- **Description:** Denuncias «CRÍTICA — PELIGRO INMEDIATO» sin asignar: DEN-VHCX-GRC9 hace 311 días / 10 meses; múltiples SLA «vencido hace 60/33/31 días»; ~28 menciones VENCIDO en cola; 48 sin asignar, 0 mías, 0 cerradas en 30d.  
- **Why this matters:** Ley 14.346: peligro inmediato sin dueño de caso durante meses es evidencia de negligencia institucional, no de software útil.  
- **Impact on first-time users:** Riesgo legal/reputacional. El funcionario asume que el sistema no opera o es demo.  
- **Recommended improvement:** Cola ordenada por riesgo×edad; bloqueo de «críticas históricas» sin plan; escalamiento automático; KPI de SLA en Panel.  
- **Which design principle failed?** Workflow + Decision Support  
- **Confidence to act on this screen:** 1/5  

### Issue 3

- **Severity:** Critical  
- **Category:** Government Compliance  
- **Location:** `/gob/vigilancia`  
- **Description:** Banner rojo: «3 observación(es) rábica(s) fuera del plazo legal de 10 días». Cumplimiento 10d = 0%. ENO: «transmisión a la autoridad pendiente de endpoint receptor».  
- **Why this matters:** Incumplimiento legal visible + canal ENO no conectado. No es un MVP incompleto: es un vacío de interoperabilidad estatal.  
- **Impact on first-time users:** No se puede autorizar despliegue sanitario nacional sin receptor ENO ni cierre de observaciones.  
- **Recommended improvement:** Priorizar cola de observaciones vencidas; conectar o declarar explícitamente «no operativo» en UI de gobierno; no mostrar SLA ENO como KPI vacío.  
- **Which design principle failed?** Government Trust + Decision Support  
- **Confidence to act on this screen:** 1/5  

### Issue 4

- **Severity:** Critical  
- **Category:** Trust  
- **Location:** `/gob/panorama` + landing `/`  
- **Description:** Panorama muestra badge «Datos de demostración». Landing pública afirma «República Argentina · Ministerio de Salud» y «registro nacional» mientras Mi Argentina está «próximamente» (disabled).  
- **Why this matters:** Mezclar sello ministerial con datos de demo destruye credibilidad ante cualquier auditor o intendente.  
- **Impact on first-time users:** Rechazo político inmediato: «¿esto es oficial o es un mockup?»  
- **Recommended improvement:** Separar entornos; quitar branding ministerial hasta homologación; o marcar toda la consola como no-producción de forma inescapable.  
- **Which design principle failed?** Government Trust  
- **Confidence to act on this screen:** 2/5  

### Issue 5

- **Severity:** High  
- **Category:** Data  
- **Location:** `/gob` Panel · Enfermedades notificadas  
- **Description:** KPI grande «2» con subtítulo «0 lepto · 1 hidat. · últimos 30 días». 0+1 ≠ 2.  
- **Why this matters:** Si el número principal no cuadra con el desglose, ningún otro KPI es creíble.  
- **Impact on first-time users:** Confianza 1/5 en todo el Panel.  
- **Recommended improvement:** Alinear numerador/desglose; si hay 3ª categoría, nombrarla; si hay k-anon, explicarlo.  
- **Which design principle failed?** Data Quality  
- **Confidence to act on this screen:** 1/5  

### Issue 6

- **Severity:** High  
- **Category:** Information Architecture  
- **Location:** `/gob/denuncias`  
- **Description:** Mientras la pestaña activa es Triage (48), el encabezado grande dice «Paso 3 · Caso» con 38 abiertos. El trabajo real queda debajo de chrome de recorrido + 5 filtros + 4 KPIs + 5 sub-tabs.  
- **Why this matters:** El funcionario no sabe en qué paso está ni qué decisión tomar primero.  
- **Impact on first-time users:** >30s para orientarse; abandono a favor de WhatsApp/planilla.  
- **Recommended improvement:** El título debe reflejar la etapa activa; colapsar el «recorrido» a un stepper compacto; default = Urgentes con conteo.  
- **Which design principle failed?** Clarity + Cognitive Load  
- **Confidence to act on this screen:** 2/5  

### Issue 7

- **Severity:** High  
- **Category:** Workflow  
- **Location:** `/gob` Panel · Cola operativa  
- **Description:** Clic en «Denuncias de maltrato 48» no navega (URL permanece `/gob`). Hay que ir por el menú lateral.  
- **Why this matters:** La acción primaria del Panel falla. Un funcionario impaciente asume que el enlace está roto.  
- **Impact on first-time users:** Fricción y pérdida de confianza en CTAs del home.  
- **Recommended improvement:** Hacer el contador un link real a `/gob/denuncias?etapa=triage` (o equivalente).  
- **Which design principle failed?** Workflow  
- **Confidence to act on this screen:** 2/5  

### Issue 8

- **Severity:** High  
- **Category:** Decision Support  
- **Location:** `/gob/vigilancia`  
- **Description:** «Brotes activos: 2» y señales de sospecha de rabia, pero «Casos bajo investigación activa: 0». CTA «Abrir investigación» existe en lista, no en el KPI.  
- **Why this matters:** El dashboard informa una crisis y no responde «¿qué hago ahora?» en el mismo bloque.  
- **Impact on first-time users:** Pantalla de vigilancia = museo de números, no puesto de mando.  
- **Recommended improvement:** Cada KPI de alerta debe llevar acción primaria (asignar / abrir / escalar) y dueño.  
- **Which design principle failed?** Decision Support  
- **Confidence to act on this screen:** 2/5  

### Issue 9

- **Severity:** High  
- **Category:** Navigation  
- **Location:** Rail `/gob`  
- **Description:** ~18 ítems en 5 grupos (Situación / Programa / Intervención / Bandeja / Profundidad). «Cola» = aprobaciones (1 matrícula); «Denuncias» tiene su propia «cola de trabajo». «Casos» vs «Paso 3 Caso» en denuncias.  
- **Why this matters:** Homónimos y catálogo de módulos, no un día de trabajo.  
- **Impact on first-time users:** Nuevo empleado no encuentra la bandeja correcta en <30s.  
- **Recommended improvement:** Una «Bandeja del día» unificada; renombrar Cola → «Aprobaciones»; ocultar profundidad por defecto.  
- **Which design principle failed?** Information Architecture + Consistency  
- **Confidence to act on this screen:** 2/5  

### Issue 10

- **Severity:** High  
- **Category:** Workflow  
- **Location:** Sesión `/gob`  
- **Description:** Sesión expiró dos veces durante el recorrido (~10 min), redirigiendo a `/login` sin conservar la URL de trabajo.  
- **Why this matters:** Interrumpe triage de denuncias críticas y fuerza re-autenticación.  
- **Impact on first-time users:** Abandono de tareas largas; sensación de inestabilidad.  
- **Recommended improvement:** TTL más largo para operadores; deep-link post-login; aviso de sesión por vencer.  
- **Which design principle failed?** Workflow + Performance  
- **Confidence to act on this screen:** 2/5  

### Issue 11

- **Severity:** Medium  
- **Category:** Consistency  
- **Location:** Panel / Programa / Alertas  
- **Description:** Microchip 34% (alerta) vs 33,7% (tarjeta); antirrábica 65% / 65,3% / 65,2% entre superficies.  
- **Why this matters:** Redondeos inconsistentes se leen como errores de dato.  
- **Impact on first-time users:** Discusión en reunión: «¿cuál es el número oficial?»  
- **Recommended improvement:** Una regla de redondeo + mismo denominador etiquetado en todas las vistas.  
- **Which design principle failed?** Consistency + Data Quality  
- **Confidence to act on this screen:** 3/5  

### Issue 12

- **Severity:** Medium  
- **Category:** UX  
- **Location:** Panel · Brechas vs meta / Vigilancia  
- **Description:** Títulos truncados («OBSERVACIONES R…», «ATESTACIÓN PPP E…»). Códigos internos A7–A12 visibles en Vigilancia. «n = 3492», «k<5 protegido», «PPP», «SLA» sin glosario.  
- **Why this matters:** Jerga de producto/ingeniería en UI de gobierno.  
- **Impact on first-time users:** El funcionario no entiende o malinterpreta.  
- **Recommended improvement:** Labels completos; glosario/tooltip en lenguaje de oficio; ocultar códigos A* de la UI.  
- **Which design principle failed?** Clarity + Accessibility  
- **Confidence to act on this screen:** 3/5  

### Issue 13

- **Severity:** Medium  
- **Category:** Trust  
- **Location:** Panel · Esterilizaciones / mes  
- **Description:** «26» con «−95,4% vs mes ant.» en tarjeta blanca (sin alerta), mientras métricas menores van en rosa/amarillo.  
- **Why this matters:** Una caída del 95% debería ser la historia principal o explicarse como gap de carga.  
- **Impact on first-time users:** O se ignora una crisis o se actúa sobre un artefacto de datos.  
- **Recommended improvement:** Clasificar como alerta + nota de cobertura de carga / organizaciones reportantes.  
- **Which design principle failed?** Information Hierarchy + Data Quality  
- **Confidence to act on this screen:** 2/5  

### Issue 14

- **Severity:** Medium  
- **Category:** UX  
- **Location:** `/gob/casos`  
- **Description:** Badges rojos «33D» / «91D» sin leyenda. Disputas con mascota «—». Pregunta «¿Qué expediente necesita mi próxima acción?» pero la tabla no prioriza por urgencia.  
- **Why this matters:** La promesa de decisión no se cumple en el orden ni en la semántica.  
- **Impact on first-time users:** El funcionario abre filas al azar.  
- **Recommended improvement:** Leyenda «días abiertos»; sort por edad×tipo; mostrar sujeto aunque sea «sin mascota vinculada».  
- **Which design principle failed?** Decision Support + Clarity  
- **Confidence to act on this screen:** 2/5  

### Issue 15

- **Severity:** Medium  
- **Category:** Accessibility  
- **Location:** `/gob/perdidas` listados  
- **Description:** «Última ubicación: -34.5732, -58.5375» en crudo. Texto denso, badges solo por color (crítica/SLA).  
- **Why this matters:** Coordenadas no son accionables para un empleado de calle; color-only falla a11y.  
- **Impact on first-time users:** No se puede despachar un operativo desde la lista.  
- **Recommended improvement:** Dirección/barrio legible + mapa; icono+texto para severidad.  
- **Which design principle failed?** Accessibility + Decision Support  
- **Confidence to act on this screen:** 3/5  

### Issue 16

- **Severity:** Medium  
- **Category:** Dashboard  
- **Location:** `/gob/mortalidad`  
- **Description:** Disposición «Otro / sin especificar: 22 (100% del máximo)» — framing «% del máximo» confunde con cumplimiento Ley 5470.  
- **Why this matters:** El Panel alerta 31% trazable; acá el eje relativo al máximo de barras no comunica brecha legal.  
- **Impact on first-time users:** Dos lecturas incompatibles del mismo tema.  
- **Recommended improvement:** Mostrar % trazable vs meta 75% como KPI primario; barras como distribución secundaria.  
- **Which design principle failed?** Clarity + Trust  
- **Confidence to act on this screen:** 3/5  

### Issue 17

- **Severity:** Medium  
- **Category:** Trust  
- **Location:** `/gob/programa`  
- **Description:** Calidad de datos: sexo desconocido 1.168 / 3.492 (~33%); sin microchip 2.316. SLA ENO «—».  
- **Why this matters:** El padrón que alimenta las metas legales está incompleto; no se declara como limitación en cada KPI de cobertura.  
- **Impact on first-time users:** Metas 80% se leen como fracaso de política, no de registro.  
- **Recommended improvement:** Denominador doble + disclaimer de completitud en cada % de programa.  
- **Which design principle failed?** Data Quality + Government Trust  
- **Confidence to act on this screen:** 3/5  

### Issue 18

- **Severity:** Low  
- **Category:** UX  
- **Location:** Filtros Panel  
- **Description:** Localidad deshabilitada en «Todas» con una sola provincia asignada — filtro muerto.  
- **Why this matters:** Controles inútiles aumentan carga cognitiva.  
- **Impact on first-time users:** Menor; genera duda («¿está roto?»).  
- **Recommended improvement:** Ocultar o explicar «una sola jurisdicción asignada».  
- **Which design principle failed?** Cognitive Load  
- **Confidence to act on this screen:** 4/5  

### Issue 19

- **Severity:** Low  
- **Category:** Consistency  
- **Location:** Denuncias · badges  
- **Description:** «HISTÓRICO · SIN SLA ACTIVO» junto a «CRÍTICA — PELIGRO INMEDIATO» en el mismo card.  
- **Why this matters:** Contradicción semántica: ¿es peligro inmediato o archivo histórico?  
- **Impact on first-time users:** Parálisis: no se sabe si actuar hoy.  
- **Recommended improvement:** Una sola verdad de prioridad; históricos críticos deben reabrirse o archivarse con justificación.  
- **Which design principle failed?** Clarity + Consistency  
- **Confidence to act on this screen:** 2/5  

### Issue 20

- **Severity:** Medium  
- **Category:** Trust  
- **Location:** `/login`  
- **Description:** Login sin sello institucional fuerte; «Conectar con Mi Argentina (próximamente)» disabled. Acceso a gobierno vía email/password de prueba.  
- **Why this matters:** Para despliegue nacional, federación de identidad es premisa, no nice-to-have.  
- **Impact on first-time users:** No pasa control de identidad del Estado.  
- **Recommended improvement:** No presentar como listo para gobierno hasta OIDC/Mi Argentina operativo.  
- **Which design principle failed?** Government Trust  
- **Confidence to act on this screen:** 3/5  

---

## Si solo hubiera dos semanas

Mayor aumento de confianza del funcionario (orden de impacto observado en el browse):

1. **Arreglar la verdad operativa** — Particionar Pérdidas; reconciliar KPI enfermedades 2≠1; unificar redondeos. Sin datos coherentes, el resto es teatro.  
2. **Bandeja del día con dueño** — Una home: críticas Ley 14.346 + observaciones rábicas vencidas + 1 cola de aprobaciones. CTAs que naveguen. Default Urgentes con conteo.  
3. **Honestidad institucional** — Quitar o aislar «demo» del branding Ministerio; marcar ENO como no conectado; no mostrar metas legales como si el padrón fuera censo.  
4. **Claridad de etapa en Denuncias** — Título = etapa activa; resolver CRÍTICA vs HISTÓRICO; escalar o archivar los 311 días.  

---

## Evidencia de método

- Browse live `:3000` únicamente (sin leer código/docs del repo en esta pasada).  
- Session kicks a `/login` observados 2×.  
- Panorama «Datos de demostración» visto en captura.  
- Landing «República Argentina · Ministerio de Salud» en DOM.  
- Timestamps de pantallas: «Calculado al 23/7/26» (~11:31–11:41).  
