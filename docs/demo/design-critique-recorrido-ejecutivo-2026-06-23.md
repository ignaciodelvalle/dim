# Design Critique — Recorrido ejecutivo gubernamental (MiMAR / DIM)

> Fecha: 2026-06-23 · Revisor: Claude (Cowork) · Entorno: `localhost:3001`, `NEXT_PUBLIC_DEMO_MODE=true`, cuenta `admin@dim.test`.
> Alcance: las superficies del **corte completo** de la demo — `/admin` (Dashboard), `/admin/panorama`, `/admin/programa`, `/admin/libro`, `/admin/alertas`, `/gob`, `/admin/acerca/integracion-miarg`.
> Etapa: **pre-demo / final** — el objetivo es filmar, así que el listón es "terminado y con datos válidos", no exploración.

---

## Overall Impression

El esqueleto narrativo es fuerte: cada pantalla tiene una tesis clara (panorama → mide → confía → acciona → escala) y el tono institucional (banner honesto, disclaimers no ocultables, libro append-only) genera credibilidad ante un funcionario. La mayor oportunidad no es de layout sino de **integridad de datos y render**: dos beats centrales (Forecast y el mapa de Panorama) hoy se ven rotos o vacíos en la primera pintura, y varias métricas en 0% leen como "sin poblar" más que como hallazgos reales. Eso es lo que primero rompería la confianza del espectador.

---

## Usability

| Finding | Severity | Recommendation |
|---------|----------|----------------|
| **Forecast en blanco.** En `/admin/programa`, la "Proyección de vacunación antirrábica" muestra un SVG vacío pese a haber datos (el header dice "3 períodos ocultos"). El recharts no dibuja. | 🔴 Critical | Es un beat titular ("mide+planifica"). Arreglar el render (ver handoff). Hasta entonces, queda **excluido** del video. |
| **Mapa de Panorama oscuro en la primera pintura.** El coropleto carga negro/vacío; la "Reproducción temporal" atenúa las capas sin dimensión temporal y muestra "Sin datos para esta capa en tu cobertura". Recién con segundos extra y/o cambiando de capa aparecen las provincias. | 🔴 Critical (demo) | Que la capa por defecto pinte datos en el primer render y que la reproducción temporal **no** arranque atenuando. El centro visual no puede leerse como roto. |
| **Primeras cargas lentas (~11–15s).** En dev, compilar `/admin/panorama` tardó 11.5s; navegaciones devolvían la pantalla anterior unos segundos. | 🟡 Moderate | Es modo dev; filmar sobre `pnpm build && start` (prod) elimina la mayor parte. Pre-calentar rutas antes de grabar. |
| **Métricas en 0% que parecen vacías.** En "Outliers por provincia", Microchip y Antirrábica dan 0% en TODAS las provincias (BA, Córdoba, Santa Fe, CABA); solo Esterilización tiene valores reales. | 🔴 Critical (demo) | Poblar esas series en el seed o esconder esas filas — hoy leen como dato faltante, no como outlier. |

---

## Visual Hierarchy

- **Qué atrae el ojo primero**: en el Dashboard, los números grandes (260 / 0 / 2). Correcto como jerarquía, pero el contenido es **administrativo** (usuarios, cola, decisiones) — para un ejecutivo, los primeros números deberían ser de **salud poblacional** (cobertura, zoonosis), que hoy viven recién en Panorama.
- **Reading flow**: en `/admin/programa` los valores en rojo sobre tinte rosa (Esterilización 31.4%, Provincias en alerta 72) tiran el ojo a "dónde estamos fallando" — excelente para lectura ejecutiva. Bien.
- **Emphasis**: en `/gob` (Panel de jurisdicción) los KPIs con sparkline + delta ("−4% vs semana ant.") son lo más escaneable de todo el recorrido; ese patrón debería subir también al Programa de `/admin`.

---

## Consistency

| Element | Issue | Recommendation |
|---------|-------|----------------|
| Tarjetas KPI | `/admin/programa` no tiene sparkline; `/gob` sí, para métricas equivalentes (esterilización, antirrábica). | Unificar el componente KPI (con mini-tendencia) entre portales. |
| Deltas | `/gob` muestra "+1169.7% vs mes ant." en esterilizaciones — magnitud implausible, huele a artefacto de ventana del seed. | Acotar la ventana o suavizar el cálculo; un delta así hace dudar de todo el tablero. |
| Estado de métrica | Microchip aparece como "—" en Programa y "0%" en otras vistas para el mismo vacío. | Un único tratamiento de "sin dato" (em-dash) en todos lados. |

---

## Accessibility

- **Contraste**: rojo sobre tinte rosa (Esterilización, Provincias en alerta) y el banner tostado de demo — **verificar ≥4.5:1**; el rojo-sobre-rosa es el de mayor riesgo de fallar. Punto a favor: la alerta usa **doble codificación** (ícono ⚠ + color), no solo color.
- **Forecast (a11y)**: aunque el visual está roto, el componente trae `figure[role=img]`, `figcaption` sr-only y tabla de datos accesible — muy bien; al arreglar el SVG queda redondo.
- **Touch targets / tipografía**: botones de acción en Alertas (Reconocer/Contactar) con tamaño adecuado; textos de KPIs legibles.

---

## What Works Well

- **Banner de "Datos de demostración" no ocultable** — honestidad que suma credibilidad con un funcionario.
- **`/gob` Panel de jurisdicción** — KPIs con sparkline y deltas: el tablero más vendedor del recorrido.
- **Libro de eventos** — el framing "nada se edita, todo se anexa" comunica trazabilidad/confianza de inmediato.
- **Cierre Mi Argentina** con disclaimer "Integración en desarrollo — vista ilustrativa" no ocultable — cierra escalando sin sobre-prometer.
- **Modelo de portales** — admin entra a `/gob` sin desloguearse, y el Dashboard ofrece "Ver el portal de Gobierno →"; el cruce de contexto está bien resuelto.

---

## Priority Recommendations

1. **Arreglar el render del ForecastChart** — es el beat de "planifica" y hoy es un cuadro blanco. (Ver `handoff-demo-blockers-cc.md`.)
2. **Poblar (o esconder) Microchip y Antirrábica en los outliers/series** — para que las tablas no se lean como datos faltantes en cámara.
3. **Panorama: capa por defecto con datos en la primera pintura + no atenuar al iniciar** — el mapa es el centro visual y no puede aparecer negro.
