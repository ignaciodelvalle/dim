"use client";

// MapLegends — the "Referencias" rail section (ARCHETYPE A situation room).
//
// The situational map's scales used to stack as translucent overlays in the
// canvas's bottom-left corner, covering geography. They now live OFF-canvas as a
// named "Referencias" section in the monitoring rail: one block per active layer
// scale, each titled by the layer it decodes. The map keeps ONLY the
// zoom/home/Volver controls + the aggregation badge on the canvas.
//
// Data flow:
//   - province ramp + bivariate legends are RENDER-DERIVED from `layers` (the same
//     derivation SituationalMap used) — recomputed here, no coupling to the map;
//   - the division-fill legend + graduated-symbol scale are computed imperatively
//     inside SituationalMap's syncLayers (from the rendered data) and LIFTED here
//     via props (onDivisionLegendChange / onGraduatedScaleChange), so a legend
//     bubble/ramp always matches its on-map mark.
//
// The k-anon trichotomy copy (color = value · hatch = protected · outline/neutral
// = no-data) is preserved verbatim — only the container skin changes (from an
// on-canvas translucent panel to a dark rail sub-card).

import type { ActiveLayer, DivisionLegendDescriptor } from "@/components/panorama/SituationalMap";
import { BIVARIATE_LEGEND_GRID } from "@/components/panorama/bivariate-fill";
import {
  type ClassScale,
  type ClassSwatch,
  classSwatches,
  computeClassScale,
} from "@/components/panorama/class-scale";
import type { GraduatedScale } from "@/components/panorama/graduated-scale";
import { histogramPeak, valueHistogram } from "@/components/panorama/legend-histogram";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  FIXED_RATE_DOMAIN,
  type ScaleBounds,
  provinceValueBounds,
} from "@/components/panorama/province-choropleth-style";
import { COLOR_NO_DATA, COLOR_SUPPRESSED } from "@/lib/analytics/viz-scales";

type Props = {
  /** The currently-active layers — the render-derived legends read from these. */
  layers: ActiveLayer[];
  /** Lifted division-fill legend descriptor (null when no division fill is active). */
  divisionLegend: DivisionLegendDescriptor | null;
  /** Lifted graduated-symbol scale (null until it resolves with real data). */
  graduatedScale: GraduatedScale | null;
};

// Shared skin for one legend sub-card in the rail (was `bg-black/55` on canvas).
const CARD = "rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-stripe px-3 py-2";

/** Round a class break to a readable precision for the legend label. */
function formatBound(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded.toLocaleString("es-AR");
}

/** The value-range label for one class swatch (open-below / range / open-above). */
function swatchLabel(s: ClassSwatch): string {
  if (s.lo === null && s.hi === null) return "Todos";
  if (s.lo === null) return `< ${formatBound(s.hi as number)}`;
  if (s.hi === null) return `≥ ${formatBound(s.lo)}`;
  return `${formatBound(s.lo)} – ${formatBound(s.hi)}`;
}

/**
 * Discrete CLASS-swatch legend for a threshold-classed choropleth (Theme 3):
 * one colored chip per class with its value range, replacing the old continuous
 * gradient bar that hid where the data actually fell. The swatches are built from
 * the SAME ClassScale the map fill renders, so legend and map never disagree.
 */
function ClassSwatchLegend({ scale }: { scale: ClassScale }) {
  const swatches = classSwatches(scale);
  return (
    <div className="flex flex-col gap-0.5">
      {swatches.map((s, i) => (
        <div key={`${s.color}-${i}`} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-4 flex-none rounded-[var(--radius-xs)] border border-white/15"
            style={{ background: s.color }}
            aria-hidden="true"
          />
          <span className="tabular-nums text-white/75">{swatchLabel(s)}</span>
        </div>
      ))}
    </div>
  );
}

export function MapLegends({ layers, divisionLegend, graduatedScale }: Props) {
  // task #63: the active bivariate layer (if any) drives the 3×3 matrix legend;
  // it is excluded from the ordinary province ramp legends.
  const bivariateLayer =
    layers.find((l) => l.geomType === "choropleth" && l.level === "province" && l.bivariateCells) ??
    null;

  const provinceLegends = layers
    .filter((l) => l.geomType === "choropleth" && l.level === "province" && !l.bivariateCells)
    .map((l) => ({
      layer: l,
      bounds: provinceValueBounds(l.features),
      isDivergent: l.dataType === "rate" && typeof l.complianceTarget === "number",
    }))
    .filter(
      (x): x is { layer: ActiveLayer; bounds: ScaleBounds; isDivergent: boolean } =>
        x.bounds !== null,
    );

  // #6/#7: the graduated legend is data-driven — sample bubbles come from
  // `graduatedScale` (built in syncLayers from the observed max) at the exact
  // area-proportional sizes rendered on the map. Only shown once it resolves.
  const hasGraduatedLayer =
    layers.some((l) => l.renderMode === "graduated") &&
    graduatedScale !== null &&
    graduatedScale.bins.length > 0;
  // Name the graduated legend by its layer(s): "Eventos por unidad — Zoonosis".
  const graduatedLayerLabel = layers
    .filter((l) => l.renderMode === "graduated")
    .map((l) => l.label)
    .join(" · ");

  const anyLegend =
    provinceLegends.length > 0 ||
    hasGraduatedLayer ||
    divisionLegend !== null ||
    bivariateLayer !== null;
  if (!anyLegend) return null;

  return (
    <section
      aria-label="Referencias del mapa"
      className="space-y-2 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card px-3 py-2.5"
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Referencias</h3>
      <div className="space-y-2 text-white/90">
        {/* task #63: the bivariate legend IS the 3×3 matrix — coverage terciles
            (x, "Cobertura →") × signal terciles (y, "Señales ↑"). The risk corner
            (low coverage · high signal) is marked. A hatch swatch names the
            k-anon-protected state (color withheld, never inferred). */}
        {bivariateLayer !== null && (
          <div className={CARD}>
            <div className="mb-1.5 font-medium text-ln-op-ink-2">
              Riesgo de brotes
              <span className="font-normal text-ln-op-mute"> — {bivariateLayer.label}</span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <div className="flex flex-col items-center justify-center">
                <span className="whitespace-nowrap text-[var(--text-xs)] text-white/60 [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                  Señales ↑
                </span>
              </div>
              <div>
                {/* 3 rows × 3 cols; grid is row-major, top row = high signal. */}
                <div className="grid grid-cols-3 gap-0.5">
                  {BIVARIATE_LEGEND_GRID.map((sw) => (
                    <span
                      key={`biv-${sw.cov}-${sw.sig}`}
                      className={`h-4 w-4 rounded-[var(--radius-xs)] ${
                        sw.risk ? "ring-1 ring-white/80" : "border border-white/10"
                      }`}
                      style={{ background: sw.color }}
                      title={sw.risk ? "Riesgo alto: cobertura baja · señales altas" : undefined}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="mt-0.5 text-center text-[var(--text-xs)] text-white/60">
                  Cobertura →
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-white/70">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(203,213,225,0.85) 0, rgba(203,213,225,0.85) 1px, transparent 1px, transparent 3px)",
                }}
                aria-hidden="true"
              />
              Protegido (k-anonimato)
            </div>
          </div>
        )}
        {/* Division-fill legend: sequential ramp for the active locality choropleth
            over the barrio/departamento polygons. Names the unit and states that an
            unfilled division is genuine no-data (or k-anon protected). */}
        {divisionLegend !== null && (
          <div className={CARD}>
            <div className="mb-1 font-medium text-ln-op-ink-2">
              {divisionLegend.label}{" "}
              <span className="font-normal text-ln-op-mute">· por {divisionLegend.unitNoun}</span>
            </div>
            {divisionLegend.hasRamp && (
              <ClassSwatchLegend
                scale={{
                  breaks: divisionLegend.breaks,
                  colors: divisionLegend.colors,
                  method: "quantile",
                }}
              />
            )}
            {/* cursor #2: trichotomous — colored fill = value, DIAGONAL HATCH =
                k-anon-protected, outline-only = genuine no-data. */}
            {divisionLegend.suppressed && (
              <div className="mt-1 flex items-center gap-1.5 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(203,213,225,0.85) 0, rgba(203,213,225,0.85) 1px, transparent 1px, transparent 3px)",
                  }}
                  aria-hidden="true"
                />
                Suprimido (k-anonimato)
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-white/70">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/15"
                aria-hidden="true"
              />
              Sin datos (solo contorno)
            </div>
          </div>
        )}
        {provinceLegends.map(({ layer, isDivergent }) => {
          // #5: the actual province values, for the in-legend distribution. On
          // the FIXED [0,100] divergent axis they otherwise vanish into the mid
          // band — the histogram shows the real spread.
          const values = layer.features.features
            .map((f) => (f.properties as { value?: number } | null)?.value)
            .filter((v): v is number => typeof v === "number");
          const hist =
            isDivergent && typeof layer.complianceTarget === "number"
              ? valueHistogram(values, FIXED_RATE_DOMAIN.min, FIXED_RATE_DOMAIN.max, 16)
              : [];
          const histPeak = histogramPeak(hist);
          const metaPct =
            typeof layer.complianceTarget === "number"
              ? (100 * (layer.complianceTarget - FIXED_RATE_DOMAIN.min)) /
                (FIXED_RATE_DOMAIN.max - FIXED_RATE_DOMAIN.min)
              : 0;
          return (
            <div key={layer.id} className={CARD}>
              <div className="mb-1 font-medium text-ln-op-ink-2">{layer.label}</div>
              {isDivergent && typeof layer.complianceTarget === "number" ? (
                // F5: divergent legend — two poles with the target anchor labeled.
                // Colorblind-safe: orange=below, white=at target, teal=above.
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-white/70">0</span>
                    <span className="relative h-6 w-28 flex-none">
                      {histPeak > 0 && (
                        <span
                          className="absolute inset-x-0 top-0 flex h-3.5 items-end gap-px"
                          aria-hidden="true"
                        >
                          {hist.map((b) => (
                            <span
                              key={b.lo}
                              className="flex-1 rounded-t-[1px] bg-white/45"
                              style={{ height: `${Math.round((100 * b.count) / histPeak)}%` }}
                            />
                          ))}
                        </span>
                      )}
                      <span
                        className="absolute inset-x-0 bottom-0 block h-2.5 rounded-full"
                        style={{
                          background: `linear-gradient(to right, ${COLOR_DIVERGENT_BELOW}, ${COLOR_DIVERGENT_NEUTRAL}, ${COLOR_DIVERGENT_ABOVE})`,
                        }}
                        aria-hidden="true"
                      />
                      <span
                        className="absolute bottom-0 block h-5 w-px bg-white/80"
                        style={{ left: `${metaPct}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="tabular-nums text-white/70">100</span>
                  </div>
                  {histPeak > 0 && (
                    <div className="text-[var(--text-xs)] leading-tight text-white/45">
                      Distribución de {values.length}{" "}
                      {values.length === 1 ? "provincia" : "provincias"} (barras) · meta marcada
                    </div>
                  )}
                  <div className="flex justify-between text-[var(--text-xs)] text-white/55">
                    <span>bajo meta</span>
                    <span>sobre meta</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/60">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-white/30"
                      style={{ background: COLOR_DIVERGENT_NEUTRAL }}
                      aria-hidden="true"
                    />
                    <span>
                      meta{" "}
                      <strong className="text-white/80">
                        {layer.complianceTarget.toLocaleString("es-AR")}%
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                // Theme 3: discrete CLASS swatches for density/count choropleths
                // (was a continuous gradient bar). Built from the same quantile
                // scale the map fill renders at the live edge.
                <ClassSwatchLegend scale={computeClassScale(values)} />
              )}
              <div className="mt-1 flex items-center gap-1.5 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)]"
                  style={{ background: COLOR_NO_DATA }}
                  aria-hidden="true"
                />
                Sin datos
              </div>
              {/* k-anon disclosure — copy parity with MapChoropleth. */}
              <div className="mt-0.5 text-[var(--text-xs)] leading-tight text-white/55">
                Dato protegido — menos de 5 registros (k-anonimato)
              </div>
            </div>
          );
        })}
        {/* F1 graduated-circle legend: fixed size → count-bucket mapping. */}
        {hasGraduatedLayer && graduatedScale && (
          <div className={CARD}>
            <div className="mb-1.5 font-medium text-ln-op-ink-2">
              Eventos por unidad
              {graduatedLayerLabel && (
                <span className="font-normal text-ln-op-mute"> — {graduatedLayerLabel}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {graduatedScale.bins.map((b) => (
                <div key={b.value} className="flex items-center gap-2">
                  <span
                    className="flex-none rounded-full"
                    style={{
                      width: b.r * 2,
                      height: b.r * 2,
                      background: "rgba(255,255,255,0.25)",
                      border: "1.5px solid rgba(255,255,255,0.5)",
                    }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums text-white/70">{b.label}</span>
                </div>
              ))}
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className="flex-none rounded-full"
                  style={{ width: 10, height: 10, background: COLOR_SUPPRESSED, opacity: 0.6 }}
                  aria-hidden="true"
                />
                <span className="text-white/50">Datos insuficientes (privacidad)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
