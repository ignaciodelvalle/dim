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
