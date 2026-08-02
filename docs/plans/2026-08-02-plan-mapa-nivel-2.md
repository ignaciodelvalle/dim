# Plan — el mapa al siguiente nivel: origen, citas, política y pulido

> Síntesis de 5 investigaciones read-only (2026-08-02, post-corrida del backlog
> consolidado): ficha de origen, citas congeladas, reglas en la línea de tiempo,
> performance/navegabilidad y animaciones. Filtro aplicado: bajo costo, alto
> impacto, norte estricto (funcionarios citando datos con confianza).

## Por qué

Las tres features descansan sobre los mismos tres activos ya construidos y
probados: la espina append-only, el catálogo de métricas (92/92 tiles con
`descriptorId`, baseline del fence vacío) y el reloj as-of coherente. El plan
compone; no inventa motores nuevos.

---

## Lote 0 — pulido inmediato (todo S, sin decisiones abiertas)

### Performance
| # | Qué | Evidencia | Ganancia |
|---|---|---|---|
| P1 | Matar el barrel import (`PanoramaKpiTile.tsx:16`, `BulkRevokeList.tsx`): `@/components/ui/dashboard` → import directo de `OpKpi` | El barrel arrastra CaseDetailShell → zod al bundle del panorama y /gob | ~92 KB raw / ~28 KB gz |
| P2 | `DetailDrawer.tsx:43` importa el catálogo entero por UN label → constante propia | Chunk de 95 KB de prosa metodológica en 109 páginas (incl. landing pública) | ~95 KB raw en casi toda la app (corte S; el split completo de OpKpi es M, va con la Ficha) |
| P3 | Cache headers para `/geo/*.geojson` en `next.config.ts` (`max-age=86400, stale-while-revalidate`) | 2 MB raw / 558 KB gz servidos con `max-age=0` | 558 KB gz por sesión repetida + CDN |
| P4 | `React.memo` en `SituationalMap` + los 4 panes del dock | Cero memo en components/panorama; el console re-renderiza 3-4×/1100 ms en play y por hover; props del map ya son todas memoizadas/primitivas — drop-in | El win de fluidez más grande sin rewrite |
| P5 | Prefetch por hover en el rail (`onPointerEnter` → `router.prefetch`, una vez por href; `prefetch={false}` se queda) + `useLinkStatus` pending en NavLink | 1-3 links por hover, no 248; hoy el click no da feedback hasta el round-trip completo | Navegación percibida ≈ 0 en prod |
| P6 | Mirada de 5 min a `/admin/programa` (0,71 s en warm — el único lento en caliente) | Tabla de timings del review | — |

### Animaciones (CSS-first; el bloque global de reduced-motion las cubre gratis)
| # | Qué | Mecanismo |
|---|---|---|
| A1 | Dim/undim del mapa con transición (`fill-opacity-transition`/`circle-opacity-transition`) | Mismo call shape que `use-choropleth-motion.ts:35` (patrón probado, con su ref de reduced-motion) |
| A2 | Entrada del DetailDrawer: slide/fade con `@starting-style` + `allow-discrete` | CSS puro, cero JS |
| A3 | Settle explícito del strip KPI: `transition-opacity` presente en ambos estados (hoy el reveal depende de remover la clase) | CSS puro — cierra visualmente el "Actualizando al…" |
| A4 | Playhead del scrubber: `left` → `transform: translateX()` + transición 150-200 ms | Refuerza "ver la situación formarse"; de paso cumple el guardrail de compositor |
| A5 | Fade-in de secciones streameadas (skeleton→contenido) con `@starting-style` | Sin View Transitions API (no habilitada; decisión aparte) |
| A6 | Micro-fade del panel del ContextBar (comparte la utility de A2) | CSS puro |

**Cortes documentados (no re-litigar):** count-up en KPIs de consola (registro
equivocado), tween del coroplético en play (MapLibre no transiciona paint
data-driven — ya intentado, documentado en TimeScrubber.tsx:65), animar
`<details>` del rail y el shrink del dock (layout, no compositor), View
Transitions API (decisión propia, no micro-interacción).

---

## Feature 1 — Ficha de origen ("¿De dónde sale este número?")

**v1 (composición pura, cero queries nuevas):**
- Tipo `KpiProvenanceContract` en módulo NUEVO `lib/metrics/kpi-provenance.ts`
  (el catálogo está a 2536 líneas, cerca del techo — extraer, no engordar).
- `<ProvenanceCard>` compartida junto a OpKpi, abierta desde "Ver origen →" en
  el popover ⓘ existente (reusa su mecánica de pin).
- Muestra: alcance, período, base temporal (stock/flow ya derivado), fórmula
  es-AR, frescura (`lastIngestAt`/`dataAsOf` ya calculados), link congelado.
- Donde no hay `n`: **"n no disponible en esta vista"** — hueco honesto, nunca
  omisión silenciosa.
- Backfill de contenido: `ui.formula` es-AR existe en 19/73 KPIs → completar
  los 54 restantes (tarea de autoría, no de código).
- **Regla de privacidad (diseño cerrado en research):** la ficha CONSUME el
  veredicto de supresión existente, jamás lo recomputa; `n<5` se muestra como
  "oculto por privacidad"; el par n+drill a localidad suprimida es la zona de
  peligro de diferenciación (defensa espejo de `province-suppression.ts`).

**v2 (el caro, después de instrumentar):** exponer `n` + último evento
contribuyente en ~55-65 fetchers, priorizados por clicks reales de "Ver origen"
medidos en v1. La mayoría es un `COUNT`/`MAX(occurred_at)` dentro de la query
ya existente.

## Feature 2 — Citar esta vista (citas congeladas)

**v1 (disclosure primero, ingeniería después):**
- Acción "Citar esta vista" junto a "Copiar vista": **pinnea asOf explícito**
  (nunca "en vivo" — cierra la ambigüedad cache/cubo) y reusa
  `ViewScopeDescriptor` + digest + Informe existentes.
- Párrafo de procedencia en el footer del Informe, con el candor del PDF MPF:
  nombra QUÉ no es reproducible — el backlog "acumulado hoy" (sin corte por
  diseño) y la supresión k<5 (evaluada en vivo, puede cambiar al reabrir).

**v2 (determinismo real):**
- Watermark del spine (max `recorded_at`) en URL + footer.
- Fix de las 2 excepciones de mayor severidad: asOf en el backlog de bienestar,
  y visibilidad de moderación replicada as-of (patrón `activePetsAsOf` ya
  probado en repository-choropleth).
- Vintage censal registrado en la cita (hoy "el año más nuevo presente" —
  una recarga de INDEC reescribe todos los per cápita históricos).
- `NEXT_PUBLIC_APP_VERSION` desde `VERCEL_GIT_COMMIT_SHA` (gratis, sin usar hoy).
- Allowlist de params de URL con test (el informe ya lo marca como deuda).

**Fase 4 explícitamente diferida:** extracto público verificable (ruta sin
auth + supresión re-derivada para audiencia pública + firma real) — cuerpo de
trabajo aparte, gateado por PO.

## Feature 3 — Reglas en la línea de tiempo (política → resultado)

**Prerrequisito (va primero, es de seguridad):** `fetchRuleChanges` hoy trae
cambios de TODA la plataforma sin filtro — agregar filtro provincia/localidad
antes de cualquier reuso fuera de /admin/inteligencia (postura G1 de /gob).

**v1:** marcas en el track del scrubber (modo Detalle), posicionadas en
`changedAt` con la matemática del histograma existente; ícono distinto de la
densidad de eventos; **rótulo incondicional "cambio registrado el X"** (nunca
"vigente desde" — DIM no conoce la fecha de decisión real), independiente de la
base temporal activa; reglas nacionales siempre visibles; hover: label del
RULE_TYPE_REGISTRY + acción + jurisdicción + fecha + link a la fila de
Inteligencia (que ya carga el caveat "correlación, no atribución" completo —
nada de deltas en el hover).
**v2:** modo Simple / siempre visible una vez validada la densidad real;
clustering solo si aparece churn real (volumen esperado bajo).

---

## Secuencia propuesta

1. **Lote 0** (P1-P6 + A1-A6) — una ola de 2 writers, territorios disjuntos,
   gate estándar. Rinde hoy y no bloquea nada.
2. **F3 prereq + F1 v1** en paralelo (territorios disjuntos: data layer de
   policy-outcome vs componente ficha + catálogo).
3. **F2 v1** (informe + acción citar) — reusa el vocabulario de honestidad de F1.
4. **F3 v1** (marcas en scrubber).
5. **v2s** según instrumentación y decisiones PO (watermark, census vintage,
   fetchers con n).

Cada ola: spec corto → writers → gate (verify + suite) → review adversa → push.
