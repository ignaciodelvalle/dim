# Hito: Panorama + dashboards — "explorar con fluidez, leer con confianza"

> Origen: maratón de red-team admin/Panorama (2026-07-24). Este doc consolida las
> decisiones de PO (Ignacio) y el audit de superficies repetidas en un hito con
> DOS tracks. Reemplaza el pitch previo de "decision desk" (rechazado — ver §Identidad).

## Identidad de Panorama (fijada por PO)

Panorama es un **instrumento analítico**: EXPLORAR + ENTENDER PATRONES (espacial +
temporal) + EXPORTAR vistas. **NO** es una consola de acción/decisión.

- Las acciones viven en las superficies operativas (`/gob`, `/admin` colas), no en el mapa.
- **Sin modelado de costos/presupuesto por ahora** — diferido hasta investigar quién
  paga y las fuentes reales de costo. No construir estimados de $ ni supuesto unitario.
- El foco es la EXPERIENCIA de explorar (fluidez) y la CONFIANZA en el número
  (legibilidad), no un CTA de "hacé algo".

(Engram: `panorama/product-identity`.)

## El audit que define el alcance

Uso real (archivos que importan cada superficie, `rg` 2026-07-24):

| Superficie | Archivos | Estado |
|---|---|---|
| `OpKpi` (tile de KPI) | 181 | **Lever #1.** El tile es cada dashboard. Necesita legibilidad. |
| `OpFilterBar` + `PeriodPicker` | 161 + 47 | El filtro/tiempo. Necesita fluidez. |
| Paginación "N de M" | ~113 | Keyset compartido; display + tabla ad-hoc por superficie. |
| `CaseQueue` / tablas | 36 | Sort/filtro/export/desglose inconsistentes. |
| `deltaV2` | ~8-10 | Honesto (guards) pero legibilidad floja (no revela base). Bajo apalancamiento. |
| `OpCard` (548), `LnEmptyState` (149), `OpStatusPill`/tonos (30, `TONE_LABELS`) | — | **Ya están bien. FUERA de alcance.** |

## Los dos tracks

### Track A — Fluidez (cómo se SIENTE explorar)

1. **Filtro sin recarga de documento.** Hoy `PeriodPicker` usa `window.location.assign`
   (navegación de documento completa) → cada toque recarga toda la página. Mover a
   commit **client-side** para que cambiar período/filtro actualice al instante. Es el
   lever de fluidez más grande fuera del mapa.
2. **Animación del mapa (Panorama):**
   - Fase 1 (fundación): transiciones animadas de coropleta (no snap), easing de cámara
     en drill, piso `prefers-reduced-motion`.
   - Fase 2 (héroe): reproducción temporal fluida (frames interpolados, el mapa se anima
     al reproducir). **Vista-ejemplar: zoonosis/brotes** (dinámica espacio-temporal real;
     esterilización es stock, descartada como ejemplar).
   - Fase 3: transiciones del hover-preview (P1.3), exportar frame/secuencia.
3. **Selector de tiempo:** arreglar la etiqueta YTD ("Año en curso" que se auto-describe
   "últimos 205 días"), colapsar/anotar presets que colisionan en silencio (3y=5y por
   span del seed), granularidad menos arbitraria.

### Track B — Legibilidad / honestidad (¿puedo CONFIAR y LEER el número?)

1. **`OpKpi` — framing stock-vs-flujo sistemático.** Extender el patrón `periodInvariant`
   (agregado en /admin/programa, Path B) a TODO tile de stock, para que ningún KPI
   point-in-time quede bajo un control de período que no lo mueve ("miente por proximidad").
2. **Revelar la base del delta** donde `deltaV2` aparece: mostrar el "N → M" o "vs X
   (período anterior)" para que un "+139%" sea chequeable, no cifra de prensa. Matar la
   fuga del label sr-only "Normal:".
3. **Tablas/paginación:** el contexto que falta — desglose tipológico ("1.263 casos" ¿de
   qué tipo?), sort consistente, "Mostrando N de M" con un display compartido.

## Interacción unificada (P1.3, decidida)

Ranking ↔ mapa: **click = drill en todos lados** (fila o mapa entran/drillean, mismo
modelo mental) + **hover-preview** (el `HoverTip` ya construido muestra los números clave
al pasar el mouse). Cero clicks extra para el detalle.

## Bugs de misión ligados (de la review, ya en cola)

- **P1.2 — deep-link roto** (Registros 49→0 al reabrir la URL): bajo la identidad
  "exportar vistas", una URL compartible que miente es lo opuesto al producto. Root cause
  trazado (el sync de URL siempre escribe `layers=`, matando el seed-por-preset). **Bug de
  misión central**, no nice-to-have.
- **P1.4** — el cajón expandido tapa el toggle Capas/Per-cápita → mover el toggle al rail.

## Fuera de alcance (explícito)

`OpCard`, sistema de tonos/semáforo (`TONE_LABELS`, centralizado), `LnEmptyState`,
skeletons. Ya están sistematizados. Y todo lo de acción/presupuesto/costos.

## Secuencia sugerida (por apalancamiento)

1. `OpKpi` framing stock/flujo + base del delta (toca 181 archivos — barato por impacto).
2. Filtro: commit client-side (fluidez, toca 161).
3. Charts/mapa: animación temporal Fase 1 → Fase 2 (zoonosis).
4. Tablas: contexto + sort consistente.
5. Deep-link (P1.2) + toggle al rail (P1.4).

## Primitivas ya disponibles

- `HoverTip` (`components/ui/HoverTip.tsx`) — hover-tooltip accesible. Sirve para glosario
  (P2.5), labels de íconos, y el hover-preview (P1.3). Construida esta maratón.
