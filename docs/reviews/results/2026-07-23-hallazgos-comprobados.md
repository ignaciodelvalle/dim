# Hallazgos COMPROBADOS de la ronda QA 2026-07-23 — origen y resolución

> Fuentes: red-team Cursor (6 claims) + gov-ux-adversarial (20) + decision-quality (42/100).
> Disciplina aplicada: verificar contra código+DB viva ANTES de arreglar. De ~40 claims,
> ~19 comprobados y arreglados, ~6 ya-arreglados/refutados, resto = seed/estratégico.
> Commits: e1e4f5cc (red-team) + beacc766 (browse QAs) + parciales previos.

## A · Origen: primitivo compartido con comportamiento oculto
1. **Perdidas: mismas 8 mascotas en perdidas/recuperadas/fallecidas (CRITICAL)** —
   UrlTabsContent montaba TODOS los paneles (hidden) y las páginas mapean UN array por
   todos los headings → el DOM llevaba las 8 perdidas bajo los títulos de los otros tabs
   (invisible al ojo, real para lectores de DOM y a11y). FIX en el primitivo: solo monta
   el panel activo + fallback de param basura. Sana a TODO consumidor de UrlTabs.

## B · Origen: contrato de métrica incompleto (residuales de C1)
2. **% de padrón como héroe con padrón=0,4% del censo** — faltaba un piso de confianza
   registro-vs-censo. FIX: guard censusCoverageFloor(20%): tono nunca pinta del % de
   registro y el tile declara que no representa protección poblacional.
3. **Ranking con 1 provincia en scope → CABA primera Y última** — el top5/bottom5 asumía
   scope multi-provincia. FIX: <3 provincias = valor plano, sin framing de ranking.
4. **Ley citada junto a meta programática como si el número fuera legal** — target.source
   era un string. FIX: sourceKind tipado (statutory|programmatic|benchmark) + render
   "Obligación: Ley X · Meta programática: Y%" en TODOS los 11 KPIs con meta.
5. **ENO SLA "100%" junto a "12 en incumplimiento"** — el tile lideraba con el histórico.
   FIX: lo actual lidera; el histórico queda como contexto etiquetado.
6. **Redondeos 65/65,3/65,2 entre superficies** — formateo independiente por pantalla.
   FIX: formatters compartidos en todas (1 decimal para tasas).
7. **Labels truncados ("OBSERVACIONES R…")** — labels de catálogo largos para el tile.
   FIX: acortados EN el catálogo (fuente canónica).

## C · Origen: capa de presentación del Panorama
8. **"Cobertura antirrábica (conteo)" pintando conteos bajo nombre de tasa** — el label
   no seguía el modo de datos. FIX: countLabel por capa ("Vacunaciones antirrábicas").
9. **Caption bivariado ciego al par activo** (ronda previa) — hardcodeaba cobertura×zoonosis.
   FIX: bivariateCaptionText(pair) desde el vocabulario del par.

## D · Origen: composición de los hubs (residuales de las fusiones)
10. **"Paso 3 · Caso" ARRIBA de los tabs** — la tarjeta link-out dominaba el fold con
    Triage activo. FIX: movida debajo; la etapa activa domina.
11. **"CRÍTICA — PELIGRO INMEDIATO" junto a "HISTÓRICO · SIN SLA"** — C2 demotó el SLA
    pero el pill de severidad seguía gritando. FIX: "Crítica (histórica)" — una sola
    verdad de prioridad por card.

## E · Origen: refactors recientes con cabos sueltos
12. **Cards de cola del Panel sin navegación** — el batch de-a-1 dejó counts sin href.
    FIX: cada card es link real.
13. **Enfermedades "2" con desglose "0+1"** — el numerador contaba categorías que el
    desglose no nombraba. FIX: resto nombrado; numerador siempre reconcilia.
14. **Session kick pierde la URL de trabajo** — el login no preservaba returnTo. FIX:
    middleware/auth-guards preservan deep-link post-login (el TTL en sí es config env).

## F · Origen: fences con globs incompletos
15. **pregnancy_status='in_progress' crudo en UI ejecutiva** — el fence de enum-text no
    escaneaba esa superficie. FIX: localizado + fence apretado.
16. **Códigos internos A7–A12 visibles en Vigilancia** — FIX: ocultos de la UI.

## G · Menores comprobados
17. **Filtro Localidad muerto con mandato mono-provincia** — FIX: oculto/explicado.
18. **/gob/analitica (typo) → 404** — FIX: redirect alias.
19. **Mortalidad "% del máximo" + rollup "SdE (otras) 1.965" dominando** — FIX: eje como
    distribución + bucket residual segregado.

## Ya-arreglado/refutado (verificado, sin tocar)
Rename de antirrábica histórica (C1) · smallN de reunificación (C1, funciona como
diseño) · aritmética maltrato (slices documentados) · footer de frescura (intencional).

## Estratégico → decisión PO (NO tocado)
Branding "Ministerio de Salud" en landing vs entorno demo · ranking por gap×población ·
forecast con cupos/dosis faltantes · Operativos: agregación geográfica antes del dump
PII · scoping de la lista nacional de perdidas · receptor ENO (conocido) · federación
Mi Argentina (premisa, conocido) · backlog seed de 311 días (dato demo).

## Ronda cursor UX admin/gob (canvas 2026-07-23) — veredictos verificados

Regla aplicada: nada válido por defecto; 5 claims concretos verificados contra código + DB viva.

| ID | Claim | Veredicto | Resolución |
|---|---|---|---|
| G1 | Alert "supera plazo legal" vs KPI "0 en curso" (BLOCKER) | CONFIRMADO — pero el ALERT era el falso positivo: seed sin observation_started_event_id → start fantasma; la observación cerró EN TÉRMINO | df89e713: invariante breach ⊆ abiertas en el predicado A9 + el runner de storylines garantiza la clave de pareo |
| G2 | "-98,3%" esterilizaciones = ruido vestido de urgencia | REFUTADO — 121→2 real en seed; guard (piso 5) correcto. Suprimirlo violaría honestidad métrica | Sin cambio de código. Opcional: suavizar distribución del seed (cola baja) |
| G3 | Citas legales CABA/PBA sin condicionar por mandato | CONFIRMADO — maquinaria jurisdiccional existe (case-normatives) pero no cableada a KPIs/alerts | TAREA: citas con badge de jurisdicción / resolución por mandato (ojo: borrarlas sería el fix deshonesto) |
| A1 | Admin "siempre en llamas" (5 procesos caídos) | CONFIRMADO, causa benigna — 375 filas fixture de vitest en cron_runs compartida | DB curada (df89e713); banner honesto queda. TAREA: teardown de tests cron + estado "paused" en registry |
| G7 | Bandeja ordenada con inbox vacíos primero | CONFIRMADO — orden hardcodeado, PO-locked | DECISIÓN PO: de-énfasis de count-cero (recomendado) vs resort por volumen (rompe memoria espacial) |
| A3 | Colisión "Gobiernos" vs "Ir a Gobierno" | CONFIRMADO (les pasó en demo) | df89e713: "Cuentas gobierno" |
| B4 | 21 rutas crasheadas transitorias | EXPLICADO — era el incidente del server stale (chunks muertos), ya blindado en qa-up | TAREA chica: página de error con id + "reportar" (el "sin-digest" no le da nada a soporte) |
| G6 | Omnibox "mandate-blind" — sugiere "existe fuera de tu mandato" | FIX PROPUESTO RECHAZADO — revelar existencia fuera del mandato viola privacy-by-design | Sin cambio; el empty-state actual es el correcto |
| G4 | Panorama vacío como primera impresión | PARCIAL — el aviso in-map k-anon (V2) ya aterrizó; falta capa default con datos + H1 | Se pliega a la tarea existente "seed ≥5 eventos" + TAREA: H1/capa default |
| G8 | Confianza+n como chrome sistémico de KPI | ALINEADO con C1 — el catálogo ya carga confidence; falta render homogéneo | TAREA fase 3: barrido + fence "rate/coverage ⇒ confianza visible" |

Direcciones PO (sin verificar código, son decisiones de producto): G5 analítica como decision desk ·
A2/S1 work queues query-first para escala · B1 densidad de nav · B3 checklist demo/prod · L1
tratamiento Mi Argentina en login · B2 alcance repetido 3× en chrome desktop.
