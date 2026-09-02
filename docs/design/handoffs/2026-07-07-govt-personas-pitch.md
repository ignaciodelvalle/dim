# MiMAR para el Estado — personas, journeys y propuesta de valor

> **Superseded for the 2026-09 presentation by `docs/presentation/2026-09-oficiales/00-guion.md`.** The persona table still holds. Everything else is graded stale by lens D05: the roadmap (two of five items shipped), the "Gap" on jurisdictional moderation (shipped end to end), the three-legged queue claim (two legs), "legally anchored" (2 statute-backed KPIs, both CABA / Buenos Aires), the comparative against private alternatives (no benchmark on the axes named), and the brand casing throughout (the brand is `miMAR`, lowercase m). Read `docs/reviews/2026-09-fresh/DECK-FACTS.md` §3 before quoting any sentence in this file.

Artefacto de pitch para una dirección de zoonosis / bienestar animal (GCBA, provincia o municipio). Destila la persona-review 2026-07-07. Úsalo para armar el deck o guiar una demo con un funcionario.

## El modelo de roles (aclarar SIEMPRE al inicio)
| Rol en MiMAR | Quién es en la vida real | Alcance |
|---|---|---|
| **`govt`** | Funcionario de salud animal / bienestar / zoonosis de un municipio, provincia o CABA | **Solo su jurisdicción** (sus localidades asignadas) |
| **`admin`** | Operador técnico de la **plataforma** (equipo DIM, Innovación, contratista del piloto) | Universal — todo el país |

> Un director de Zoonosis de GCBA **no es `admin`** — es `govt` con asignaciones en CABA. El `admin` le crea la cuenta, le asigna barrios y actúa de respaldo. Si en un piloto chico una misma persona usa ambos, es señal de que el piloto es chico, no de que los roles deban fusionarse.

## Lo que un funcionario quiere de verdad (no "un dashboard")
1. **"¿Qué explota hoy?"** — 3 alarmas que no puede ignorar (rabia fuera de los 10 días, denuncia crítica sin asignar, brote en barrio de baja cobertura). *¿Mando al equipo al campo o sigo con el café?*
2. **"¿Qué tengo que cerrar esta semana?"** — colas con decisión documentada (matrículas, refugios, denuncias, observaciones, disputas). Cada fila pendiente es riesgo político y legal.
3. **"¿Dónde mando el camión de vacunación?"** — no un %, una **lista exportable** de mascotas con antirrábica vencida por barrio.
4. **"¿Puedo rendir cuentas mañana?"** — **un número canónico** (no 42% en una pantalla y 54% en otra) + export PDF/CSV con fecha de corte.
5. **"¿Esto me cubre legalmente?"** — constancia de que notificó a tiempo (ENO/SLA), quién vio qué PII (Ley 25.326), evidencia de acción en plazo.
6. **"¿Encaja con lo que ya uso?"** — que **alimente** SENASA/MPF/Excel, no que le pida reescribir todo.
7. **"¿Quién más necesita saber?"** — puente con SENASA, refugios, Colegio de Veterinarios, fiscalía, policía.

## Las personas (cada una = un journey en `/gob`)

### 1. Autoridad sanitaria operativa — "el de guardia"
**Cargos:** inspector de Zoonosis municipal, coordinador de campaña antirrábica, técnico del Centro de Zoonosis, personal de Mascotas CABA.
**Mandato legal diario:** vacunación antirrábica (Ley 22.953), observación 10 días post-mordedura (Ord. CABA 41.831), notificación ENO, disposición de cadáveres (Ley CABA 5470), microchip/PPP.
**Su día en MiMAR:** Panel (alarmas) → /gob/vigilancia (brotes) → /gob/observaciones (cierre 10 días en plazo) → outreach (lista de vencidos por barrio).
**Qué le damos:** ✅ panel con severidad, vigilancia epidemiológica, observaciones A8/A9, cumplimiento chip/PPP. **Gap:** integración de la atención en calle (Mascotas CABA) + export por lote a SENASA.

### 2. Oficial de bienestar animal — "el de casos"
**Cargos:** inspector de fiscalización Ley 14.346, coordinador de decomisos.
**Su día:** denuncia → investigación → decomiso → refugio → derivación a fiscalía (MPF).
**En MiMAR:** /gob/maltrato (severidad + **export MPF** ✅) → /gob/decomisos → /gob/casos (código `CAS-` unificado). **Gap:** que el govt modere las denuncias anónimas de su propia jurisdicción (hoy solo `admin` — SDD escrito, phased).

### 3. Analista de salud pública — "el del informe mensual"
**Cargos:** epidemiólogo, planificador del ministerio, consultor del programa nacional.
**Su día:** no cierra casos; compara provincias, exporta CSV, arma el slide para el ministro/SENASA.
**En MiMAR:** /gob/analytics, /gob/programa, Panorama (mapa comparativo), CSV. **Gap:** que el número canónico sea inatacable (ya cerramos la colisión antirrábica 42/54 y 42/11).

### 4. Habilitador / registrador — "el del sello"
**Cargos:** quien verifica matrículas de veterinarios, personería de refugios, habilitación de clínicas.
**Su día:** cola de aprobaciones → revisar evidencia → aprobar/rechazar con motivo documentado.
**En MiMAR:** /gob/cola (matrículas + orgs), decisión auditada. ✅ Fuerte.

## Propuesta de valor al Estado
MiMAR ya le da el **marco legal, la privacidad defendible (k-anon, audit de PII, sin DNI en claro), la vigilancia epidemiológica y los tableros de cumplimiento** mejor que cualquier alternativa privada del espacio. El North Star —**población, no mascota individual**— es lo que un director de Zoonosis pediría: *"no me vendas una libreta digital, mostrame dónde está el hueco de vacunación en Villa Lugano".*

**La brecha no es de features sueltos sino de costuras cerradas** — el día en que la vacuna en la calle, la denuncia de anoche y la mordedura de esta mañana aparezcan como *trabajo cerrable* en una sola cola, con un número que el secretario repita sin dudar. Es la diferencia entre *"DIM corre la plataforma y te pasa reportes"* y *"tu oficina corre el bienestar animal en tu territorio, sobre nuestros rieles".*

## Cierre honesto para la demo
- **Fortaleza:** *public-health-grade, legally anchored* — es exactamente lo que un funcionario necesita para confiar.
- **Diferenciador real:** privacidad con trazabilidad (les da miedo la Ley 25.326).
- **Lo que pedir de la contraparte:** un piloto territorial honesto — un gobierno, un barrio, datos reales — para que el funcionario vea *su* territorio.
- **El habilitador institucional que falta:** login Mi Argentina (con convenio, el Estado "vende" la app en vez de que la vendamos nosotros).

## Roadmap del lado estatal (post-piloto)
Moderación govt jurisdiccional (SDD) · integración Mascotas CABA calle · export SENASA/LSUCyF por lote · UX de campañas (crear → asignar turnos → medir asistencia) · Mi Argentina login. Ver `2026-07-07-post-demo-backlog.md`.
