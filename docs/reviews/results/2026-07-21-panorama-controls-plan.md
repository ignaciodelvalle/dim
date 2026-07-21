# Panorama — rethink de botones y elementos (PLAN para revisar con PO)

> Encargo del PO: "repensemos todas los botones y elementos de panorama". Panorama
> es la estrella (feature long-term que siempre mejoramos). El dock ya se rediseñó
> (`c44878d1`: pestaña Referencias, agrupación DATOS|HERRAMIENTAS, captions por
> pane). Este plan es el paso siguiente, para VALIDAR visualmente antes de tocar
> código — la estrella no se toca a ciegas.

## 1. El problema: los controles viven en 4 lugares sin una regla clara

Hoy la superficie de control está repartida y cada cluster nació por separado:

| Cluster | Componentes | Qué controla |
|---|---|---|
| **Rail izquierdo** | `FiltroPanel` · `LayerPanel` · `PeriodPanel` · `PresetPanel` · `FilterChips` | Período, jurisdicción, capas, presets, filtros activos |
| **Dock inferior** (rediseñado) | `PanoramaDock` → Estadísticas · Registros · Referencias · Línea de tiempo | Lectura de datos + referencias del mapa |
| **Overlays del mapa** | `LegendPill` · `ModeSwitcher` · `SimpleDetalleToggle` · `SavedViewsPopover` · `OverlayDisclosure` | Modo de vista, detalle, leyenda, vistas guardadas |
| **Scrubber** | `TimeScrubber` | Navegación temporal |

**El síntoma:** un operador que quiere cambiar QUÉ ve tiene que aprender 4 gramáticas distintas — un panel en el rail, una pastilla sobre el mapa, un toggle flotante, una pestaña en el dock. No hay una regla de "los controles de tipo X viven siempre en el lugar Y".

## 2. Principio organizador propuesto (a validar)

Una sola regla, por INTENCIÓN del control:

- **DEFINIR el recorte** (qué universo de datos: período, jurisdicción, filtros, capas) → **rail izquierdo**, siempre. Es el "qué estoy mirando".
- **NAVEGAR el tiempo** dentro de ese recorte → **scrubber**, abajo, ancho completo. Es el "cuándo".
- **CAMBIAR cómo se dibuja** (modo de vista, detalle simple/completo, opacidad) → **overlays del mapa**, arriba a la derecha, agrupados en UN control, no 3 flotantes sueltos.
- **LEER lo que salió** (stats, registros, referencias, timeline) → **dock inferior** (ya hecho).

Con esa regla: `ModeSwitcher` + `SimpleDetalleToggle` + control de opacidad se consolidan en **un solo cluster "Vista"** arriba-derecha del mapa (hoy son 3 piezas separadas). `SavedViewsPopover` es "recortes guardados" → pertenece al rail (definir), no flotando sobre el mapa.

## 3. Islas de elementos a deduplicar (del audit §4 de plan-maestro)

Panorama tiene ~19.6k líneas y NO aparece en `components/ui/REGISTRY.md`. Reinventó primitivos que ya existen:

| Isla | Dónde | Acción | Costo |
|---|---|---|---|
| `DeltaGlyph` clonado verbatim | `DeltaGlyph.tsx` vs el de `OpKpi` | Extraer a UN primitivo registrado, ambos lo consumen | barato |
| Dos sparklines (SVG a mano vs recharts) | `Sparkline.tsx` vs `OpKpiSparkline` | Unificar en el primitivo registrado | medio |
| KPI card paralelo (no usa `OpKpi`) | `KpiChips.tsx` | **Mantener el fork** — diverge a propósito (tags de base temporal + delta neutro). Documentar por qué, NO forzar chrome de operador | — |

> Nota honesta: el objetivo es **catalogar y deduplicar**, NO forzar a Panorama al
> chrome de operador. Panorama es un dominio con lenguaje propio legítimo; solo
> matamos la duplicación GRATUITA (delta glyph, sparkline), no la divergencia
> deliberada (KpiChips).

## 4. Secuencia propuesta para mañana (bajo riesgo → validar cada paso)

1. **Consolidar el cluster "Vista"** (ModeSwitcher + SimpleDetalle + opacidad en un control arriba-derecha). Cambio visual → validación PO. *(el más visible)*
2. **Mover SavedViews al rail** ("recortes guardados" junto a los filtros).
3. **Dedupe DeltaGlyph** → primitivo registrado (barato, mecánico, con test de paridad visual).
4. **Dedupe Sparkline** → primitivo registrado (medio).
5. **Documentar KpiChips como fork intencional** en REGISTRY.md (cierra el "por qué Panorama no está en el registro").

Pasos 1-2 son diseño (tu ojo primero). Pasos 3-5 son mecánicos y los ejecuto autónomo con tests de paridad.

## Preguntas abiertas para el PO
- ¿El principio organizador de §2 te cierra, o hay controles que preferís en otro lado?
- ¿El control de opacidad del mapa (hoy pendiente de verificación manual del drag) entra en el cluster "Vista" consolidado?
