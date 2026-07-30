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

import type {
  ActiveLayer,
  DivisionLegendDescriptor,
  ProvinceSeqLegend,
} from "@/components/panorama/SituationalMap";
import { BIVARIATE_LEGEND_GRID } from "@/components/panorama/bivariate-fill";
import {
  type ClassScale,
  type ClassSwatch,
  classSwatches,
  computeClassScale,
} from "@/components/panorama/class-scale";
import type { GraduatedScale } from "@/components/panorama/graduated-scale";
import { HATCH_SWATCH_CSS } from "@/components/panorama/hatch-pattern";
import { NO_DATA_SWATCH_CSS, NO_DATA_SWATCH_SIZE } from "@/components/panorama/no-data-pattern";
import {
  type ScaleBounds,
  hasSuppressedProvince,
  provinceValueBounds,
} from "@/components/panorama/province-choropleth-style";
import { COLOR_NO_DATA, COLOR_SUPPRESSED } from "@/lib/analytics/viz-scales";
import { isMetaLayer } from "@/src/modules/panorama/domain/capabilities";

type Props = {
  /** The currently-active layers — the render-derived legends read from these. */
  layers: ActiveLayer[];
  /** Lifted division-fill legend descriptor (null when no division fill is active). */
  divisionLegend: DivisionLegendDescriptor | null;
  /** Lifted graduated-symbol scale (null until it resolves with real data). */
  graduatedScale: GraduatedScale | null;
  /**
   * Lifted sequential province choropleth classed scale(s), keyed by layer id and
   * computed WITH the scrub-locked domain — so the swatch ranges describe the
   * PAINTED colors even mid-scrub. Absent key → fall back to a live-edge recompute.
   */
  provinceSeqLegend: ProvinceSeqLegend;
};

// Shared skin for one legend sub-card in the rail (was `bg-black/55` on canvas).
const CARD = "rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-stripe px-3 py-2";

/** Round a class break to a readable precision for the legend label. */
function formatBound(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded.toLocaleString("es-AR");
}

/** The value-range label for one class swatch (open-below / range / open-above).
 *  `unit` is appended to the numbers (e.g. "%" for rate layers); `meta` tags the
 *  open-above class as the compliance-target class ("≥ 80% (meta)").
 *
 *  Half-open disambiguation (QA fix): classing is [lo, hi) — a value exactly
 *  AT a break belongs to the UPPER class (pinned by class-scale.test.ts). A
 *  plain "lo – hi" label for two adjacent classes (e.g. "40 – 60" / "60 – 80")
 *  never said which side 60 falls on. The interior range now reads
 *  "lo – <hi" so the exclusive upper bound is explicit; the open-below/
 *  open-above labels already used "<"/"≥" and were never ambiguous. */
function swatchLabel(s: ClassSwatch, opts?: { unit?: string; meta?: boolean }): string {
  const u = opts?.unit ?? "";
  if (s.lo === null && s.hi === null) return "Todos";
  if (s.lo === null) return `< ${formatBound(s.hi as number)}${u}`;
  if (s.hi === null) return `≥ ${formatBound(s.lo)}${u}${opts?.meta ? " (meta)" : ""}`;
  return `${formatBound(s.lo)} – <${formatBound(s.hi)}${u}`;
}

/**
 * Discrete CLASS-swatch legend for a threshold-classed choropleth (Theme 3):
 * one colored chip per class with its value range, replacing the old continuous
 * gradient bar that hid where the data actually fell. The swatches are built from
 * the SAME ClassScale the map fill renders, so legend and map never disagree.
 *
 * `unit` suffixes the numeric labels (e.g. "%" for META'd rate layers) and `meta`
 * tags the top (open-above) class as the compliance-target class — the PO-ratified
 * discrete legend for cobertura / esterilización / microchip / ppp (was the
 * continuous divergent gradient bar).
 */
function ClassSwatchLegend({
  scale,
  unit,
  meta,
}: {
  scale: ClassScale;
  unit?: string;
  meta?: boolean;
}) {
  const swatches = classSwatches(scale);
  return (
    <div className="flex flex-col gap-0.5">
      {swatches.map((s, i) => (
        <div key={`${s.color}-${i}`} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-4 flex-none rounded-[var(--radius-xs)] border border-ln-op-line"
            style={{ background: s.color }}
            aria-hidden="true"
          />
          <span className="tabular-nums text-ln-op-ink-2">
            {swatchLabel(s, { unit, meta: meta && i === swatches.length - 1 })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MapLegends({ layers, divisionLegend, graduatedScale, provinceSeqLegend }: Props) {
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
      // META'd rate layers (a `complianceTarget`) now render the discrete classed
      // scale anchored on the target — same discrete swatch legend as the
      // meta-less sequential layers, only with a "%" unit + a "(meta)" top class.
      // P2: reads the ONE shared registry helper (the gate's encoding.kind source).
      isMeta: isMetaLayer(l),
    }))
    .filter(
      (x): x is { layer: ActiveLayer; bounds: ScaleBounds; isMeta: boolean } => x.bounds !== null,
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

  // UX audit 2026-07-26 (finding 5): this used to `return null`, and since the
  // dock renders the pane slot verbatim, "Referencias" became a NAMED TAB THAT
  // OPENS ONTO NOTHING — measured live on the Síntomas vista, where every active
  // layer is a graduated point layer whose values all sit under k=5, so no ramp,
  // no division fill and no resolved graduated scale exist. A blank panel reads
  // as broken software; the honest answer is that there is nothing to decode
  // because the map is not encoding anything by color or size right now.
  const anyLegend =
    provinceLegends.length > 0 ||
    hasGraduatedLayer ||
    divisionLegend !== null ||
    bivariateLayer !== null;

  return (
    <section
      aria-label="Referencias del mapa"
      className="space-y-2 rounded-[var(--radius-lg)] border border-ln-op-line bg-ln-op-card px-3 py-2.5"
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Referencias</h3>
      {/* PO ask (dock redesign): a one-line top-level framing — the per-legend
          titles below already name WHICH capa each block decodes; this states
          WHAT the section is for, so a first-time operator does not have to
          infer it from the blocks alone. */}
      <p className="text-[var(--text-xs)] leading-snug text-ln-op-mute">
        Cómo leer los colores y símbolos del mapa.
      </p>
      {!anyLegend && (
        <p className="text-[var(--text-xs)] leading-snug text-ln-op-ink-2">
          Por ahora no hay escalas que decodificar: las capas activas no están pintando ningún valor
          por color ni por tamaño en este alcance (por ejemplo, cuando todos los valores quedan
          protegidos por k&lt;5). Activá otra capa o ampliá el alcance para ver las referencias.
        </p>
      )}
      <div className="space-y-2 text-ln-op-ink-2">
        {/* task #63: the bivariate legend IS the 3×3 matrix — coverage terciles
            (x, "Cobertura →") × signal terciles (y, "Señales ↑"). The risk corner
            (low coverage · high signal) is marked. A hatch swatch names the
            k-anon-protected state (color withheld, never inferred). */}
        {bivariateLayer !== null && (
          <div className={CARD}>
            <div className="mb-1.5 font-medium text-ln-op-ink-2">
              {bivariateLayer.bivariatePair?.legendTitle ?? "Intensidad de reporte"}
              <span className="font-normal text-ln-op-mute"> — {bivariateLayer.label}</span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <div className="flex flex-col items-center justify-center">
                <span className="whitespace-nowrap text-[var(--text-xs)] text-ln-op-mute [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                  {bivariateLayer.bivariatePair?.signalAxis ?? "Señales ↑"}
                </span>
              </div>
              <div>
                {/* 3 rows × 3 cols; grid is row-major, top row = high signal. */}
                <div className="grid grid-cols-3 gap-0.5">
                  {BIVARIATE_LEGEND_GRID.map((sw) => (
                    <span
                      key={`biv-${sw.cov}-${sw.sig}`}
                      className={`h-4 w-4 rounded-[var(--radius-xs)] ${
                        sw.risk ? "ring-1 ring-ln-op-danger" : "border border-ln-op-line-2"
                      }`}
                      style={{ background: sw.color }}
                      title={
                        sw.risk
                          ? (bivariateLayer.bivariatePair?.riskCornerNote ??
                            "Intensidad alta: cobertura baja · señales altas")
                          : undefined
                      }
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="mt-0.5 text-center text-[var(--text-xs)] text-ln-op-mute">
                  {bivariateLayer.bivariatePair?.coverageAxis ?? "Cobertura →"}
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-ln-op-mute">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-ln-op-line"
                // Shared hatch color (hatch-pattern.ts) so the legend key matches
                // the on-map mark exactly — no light-skin drift.
                style={{ backgroundImage: HATCH_SWATCH_CSS }}
                aria-hidden="true"
              />
              Protegido por privacidad (k&lt;5)
            </div>
          </div>
        )}
        {/* Division-fill legend: sequential ramp for the active locality choropleth
            over the barrio/departamento polygons. Names the unit and states that an
            unfilled division is genuine no-data (or k-anon protected).

            MAP-3 honesty fix (QA 2026-07-11): the drilled division fill encodes raw
            COUNTS (the v1 count-density locality rollup — repository.ts locality
            choropleth loaders return per-unit counts), even when the SAME layer's
            province-level fill encodes a RATE against a meta (e.g. cobertura:
            province = "<40%…≥80% (meta)", drilled = counts 48/89/131/172) and the
            KPI headline stays a rate. That v1 difference is deliberate; the legend
            must therefore SAY the unit — "conteos por departamento" — so the
            drilled map is never misread as % coverage. If a rate-encoded division
            fill ever ships, thread an encoding field through
            DivisionLegendDescriptor instead of editing this string. */}
        {divisionLegend !== null && (
          <div className={CARD}>
            <div className="mb-1 font-medium text-ln-op-ink-2">
              {divisionLegend.label}{" "}
              <span className="font-normal text-ln-op-mute">
                · conteos por {divisionLegend.unitNoun}
              </span>
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
              <div className="mt-1 flex items-center gap-1.5 text-ln-op-mute">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-ln-op-line"
                  // Shared hatch color (hatch-pattern.ts): legend key == on-map mark.
                  style={{ backgroundImage: HATCH_SWATCH_CSS }}
                  aria-hidden="true"
                />
                Protegido por privacidad (k&lt;5)
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-ln-op-mute">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-ln-op-line"
                aria-hidden="true"
              />
              Sin datos (solo contorno)
            </div>
          </div>
        )}
        {provinceLegends.map(({ layer, isMeta }) => {
          const values = layer.features.features
            // #40: `value` is now nullable (k-anon suppressed). The typeof guard
            // already excluded null, but the declared type said it could not
            // happen — a lie the compiler was happy to keep.
            .map((f) => (f.properties as { value?: number | null } | null)?.value)
            .filter((v): v is number => typeof v === "number");
          const target =
            isMeta && typeof layer.complianceTarget === "number" ? layer.complianceTarget : null;
          // Prefer the scale LIFTED from the map (built from the same values +
          // locked domain / meta target the fill renders, so the swatch ranges
          // describe the PAINTED colors even mid-scrub); fall back to a live-edge
          // recompute only when the lift is not yet present. A META'd layer's
          // fallback uses the target (fixed [0.5T, 0.75T, T] breaks) so it still
          // matches the classed-step META fill.
          const lifted = provinceSeqLegend[layer.id];
          const scale: ClassScale = lifted
            ? {
                breaks: lifted.breaks,
                colors: lifted.colors,
                method: isMeta ? "meta" : "interval",
              }
            : computeClassScale(values, { target });
          return (
            <div key={layer.id} className={CARD}>
              <div className="mb-1 font-medium text-ln-op-ink-2">{layer.label}</div>
              {/* Theme 3 + PO decision: discrete CLASS swatches for every province
                  choropleth. META'd rate layers (cobertura / esterilización /
                  microchip / ppp) show a "%" unit and mark the top class as the
                  compliance target ("≥ 80% (meta)"), replacing the old continuous
                  divergent gradient bar. */}
              <ClassSwatchLegend scale={scale} unit={isMeta ? "%" : undefined} meta={isMeta} />
              <div className="mt-1 flex items-center gap-1.5 text-ln-op-mute">
                {/* The swatch carries the SAME stipple the map paints (D.5(b)).
                    A key that shows a flat colour for a textured fill teaches
                    the reader the wrong mark, and the texture is the whole
                    reason "sin datos" is now separable from bare land — they
                    are only ΔE00 1.48 apart as colours. Pattern values come
                    from no-data-pattern.ts so key and map cannot drift. */}
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)]"
                  style={{
                    background: COLOR_NO_DATA,
                    backgroundImage: NO_DATA_SWATCH_CSS,
                    backgroundSize: NO_DATA_SWATCH_SIZE,
                  }}
                  aria-hidden="true"
                />
                Sin datos
              </div>
              {/* k-anon disclosure at PROVINCE grain (#40). This block used to be
                  a comment explaining its own ABSENCE: "provinces are never
                  suppressed". That premise died with #40 — a province cell is now
                  suppressed when its DENOMINATOR is sub-k (Santa Cruz publishing
                  100% over 11 dogs), and the map hatches it. The key must name the
                  mark: an unexplained texture on a province is worse than none,
                  because the reader's only available guess is "sin datos".
                  Rendered ONLY when this layer actually has a suppressed province,
                  so the row never announces a state the current frame lacks — the
                  same conditional discipline as divisionLegend.suppressed above. */}
              {hasSuppressedProvince(layer.features) && (
                <div className="mt-1 flex items-center gap-1.5 text-ln-op-mute">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[var(--radius-xs)] border border-ln-op-line"
                    // Shared hatch color (hatch-pattern.ts): legend key == on-map mark.
                    style={{ backgroundImage: HATCH_SWATCH_CSS }}
                    aria-hidden="true"
                  />
                  Protegido por privacidad (k&lt;5)
                </div>
              )}
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
              {/* Light-flip fix (dataviz review 2026-07-23): the retired dark
                  "situation-room" skin left these bubbles white-on-white
                  (rgba(255,255,255,…) inside the light bg-ln-op-stripe card —
                  invisible, defeating the size→count key). The encoding is
                  SIZE, so a neutral ink outline reads on the light card and
                  stays honest about not being a color key. */}
              {graduatedScale.bins.map((b) => (
                <div key={b.value} className="flex items-center gap-2">
                  <span
                    className="flex-none rounded-full border-[1.5px] border-ln-op-ink-2/70 bg-transparent"
                    style={{ width: b.r * 2, height: b.r * 2 }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums text-ln-op-ink-2">{b.label}</span>
                </div>
              ))}
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className="flex-none rounded-full border border-ln-op-ink-2/40"
                  style={{ width: 10, height: 10, background: COLOR_SUPPRESSED }}
                  aria-hidden="true"
                />
                <span className="text-ln-op-mute">Datos insuficientes (privacidad)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
