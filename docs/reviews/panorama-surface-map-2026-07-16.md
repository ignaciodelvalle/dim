# Panorama — mapa de superficie para recorrer y probar

Guía completa del Centro de Situación (panorama) para una pasada de QA. Entorno: `http://localhost:3001` (Cursor) — mismo build que :3000. Cuentas: `admin@dim.test` (universal) y `govt@dim.test` (scope: Ushuaia, El Calafate, Palermo), `govt-local@dim.test` (solo Palermo). Password `Test1234!`.

## Qué es
Un mapa MapLibre de Argentina + chrome flotante + dock inferior. Una MISMA consola sirve dos portales:
- **`/admin/panorama`** — alcance UNIVERSAL (cualquier provincia).
- **`/gob/panorama`** — acotado a la jurisdicción del operador (scope-bound; un `?province` fuera de alcance rebota con aviso).

Toda vista es una proyección `(eventos, filtros) → mapa`. La URL es compartible (lleva `layers`, `preset`, `period`, `province`, zoom/centro; el `basis` bitemporal NO va en la URL).

## Las 17 capas (por familia)

**Densidad / señal de eventos (temporales — cambian con la línea de tiempo):**
| id | label | tipo |
|---|---|---|
| perdidas | Pérdidas / avistajes | densidad |
| mordeduras | Mordeduras / antirrábica | densidad |
| denuncias | Denuncias de bienestar | densidad (ubicación por localidad, nunca exacta) |
| zoonosis | Zoonosis / señales | señal |
| sintomas | Síntomas / vigilancia sindrómica | densidad |
| reunificacion | Reunificación | señal (tasa) |

**Cumplimiento / cobertura (choropleth de tasa %, estado actual — la línea de tiempo las atenúa):**
| id | label |
|---|---|
| cobertura | Cobertura antirrábica (perros, 12m) |
| esterilizacion | Cobertura de esterilización |
| microchip | Penetración microchip (C1) |
| ppp | Registro PPP (C7) |
| antiparasitario | Cobertura antiparasitaria (12m) — NUEVA |

**Estado actual (densidad/índice, no temporal):**
| id | label | nota |
|---|---|---|
| mortalidad | Mortalidad / disposición | estado actual |
| acceso-veterinario | Acceso veterinario (visitas/1.000) — NUEVA | densidad por localidad |
| indice-territorial | Índice territorial (0-100) — NUEVA | **solo provincia** (no baja a departamento) |

**Directorio (pins, no series temporales):**
| id | label |
|---|---|
| refugios | Refugios |
| clinicas | Clínicas veterinarias — NUEVA |
| decomisos | Decomisos |

## Las 8 vistas (presets — empaquetan capas + narrativa)
`brotes-activos` (zoonosis + cobertura + mordeduras) · `sintomas` · `cumplimiento` (antirrábico) · `registro-ppp` · `bienestar` (fiscalización) · `control-poblacional` · `mortalidad` · `perdidas-reunificacion`.

## Los docks (barra inferior)
- **Registros** — tabla por unidad (valor por unidad) + total de eventos/estado. Rótulo honesto: "Eventos en el período" para capas temporales, "Registros (estado actual)" para mortalidad/acceso-veterinario. Muestra el residual k-anon ("+N protegidas").
- **Estadísticas** — ranking (peores/mejores N unidades) + lectura auto en criollo.
- **Línea de tiempo** — scrubber con play/pausa + toggle **"Cuándo ocurrió" (válido) vs "Según lo conocido al momento" (transacción)** (bitemporal) + histograma de actividad detrás del track.

## Exportar
Copiar vista (link), Vistas guardadas, CSV, PNG (con pie de método auditable), Informe imprimible.

## Interacciones clave a probar
1. **Desagregación automática por zoom (NUEVO — lo más importante):** arrancá nacional → se ven las 24 provincias coloreadas. Hacé zoom sobre un área → **los departamentos/partidos se rellenan solos** con el mismo indicador, sin tocar nada. Verificá: el rótulo dice "Provincias" cuando pinta provincias y "Departamentos" cuando pinta departamentos; la cámara NO se mueve sola al hacer zoom (solo aparece más detalle).
2. **Drill por click** en una provincia → baja a esa provincia (departamentos, o barrios en CABA vía el inset).
3. **Hover** sobre una unidad → popup con el valor.
4. **Click en una unidad** → drawer de detalle con sparkline + eventos recientes (funciona en las capas drillables, incl. sintomas/esterilización/microchip/ppp).
5. **k-anon:** una unidad con <5 casos se pinta con RAYADO ("Protegido k<5"), distinto del blanco de "sin datos". El índice territorial es la excepción: provincia suprimida = sin celda (no rayado).
6. **KPIs:** cada chip dice su base temporal ("estado actual" vs "período") — verificá que el número, el rótulo y el mapa cuenten la misma historia.
7. **Cambio de vista:** cambiar de vista NO te saca del zoom/scope donde estás (solo cambia qué capas/métricas muestra).

## Contraste de scope a probar
- `govt@dim.test`: arranca en su jurisdicción más amplia; el chip "Ver tus 3 jurisdicciones" lista Ushuaia/El Calafate/Palermo; `?province=AR-X` (Córdoba, ajena) → rebota a su provincia con aviso "No tenés acceso a esta jurisdicción".
- `admin@dim.test`: puede visitar cualquier provincia (válido); ya NO ve "Volver a mi jurisdicción" (lee "Vista nacional").

## Privacidad (no romper)
k=5 + supresión complementaria; denuncias por centroide de localidad (nunca exacto); points-mode (coords reales) solo dentro del scope asignado; el cubo sirve solo a admin. Toda supresión que faltara sería un hallazgo.

## Recorrido sugerido para Cursor
Admin: nacional (provincias) → zoom a un área (aparecen departamentos) → drill a una provincia → CABA (barrios) → cambiar entre las 8 vistas → abrir cada dock (Registros/Estadísticas/Línea de tiempo) → mover el scrubber + toggle válido/transacción → click en una unidad (drawer) → exportar (CSV + PNG + informe) → probar las 3 capas nuevas (acceso-veterinario, antiparasitario, índice territorial). Luego repetir como `govt@` para el contraste de scope + el rebote OOS.

**Formato del hallazgo:** BLOQUEA/ALTO/MEDIO/BAJO/IDEA · pantalla · qué esperabas · qué viste. Priorizar coherencia rótulo↔número↔mapa, honestidad de supresión, y que el zoom nunca mueva la cámara sola.
