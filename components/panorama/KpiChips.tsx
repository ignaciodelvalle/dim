"use client";

// KpiChips — the KPI CARDS over the map (task #38 item 4; READ-ONLY since #53).
//
// #53 Option A (PO 2026-07-14): the chips are INDICATORS, never controls —
// reading a number and changing the map are different acts, and the old
// click-to-rebase (a chip that LOOKED like a stat but silently swapped the
// choropleth base) was the single most confusing interaction in the panorama.
// All board changes now flow through Vista / Personalizar capas only. With the
// interactivity gone, the whole radio apparatus went with it: no radiogroup,
// no roving tabindex, no radio dot, no selected elevation, no province-only
// disable (there is nothing to disable) — a card is a card.
//
// Each card carries: the value + short label (de-dup, item 5), the
// period-over-period delta, and a mini-sparkline for the window-sensitive
// metrics that ship one. Hover reveals a one-line method note; the full
// methodology lives in the right rail's "Acerca" panel (#49 item 10).
//
// The cluster stays COMPACT — the map still dominates (the PO's "MÁS MAPA"
// ruling). Honesty states (degraded / pending / empty) unchanged.

import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import { Sparkline } from "@/components/panorama/Sparkline";
import { shortKpiLabel } from "@/components/panorama/panorama-labels";
import type {
  KpiDelta,
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
import type { PanoramaKpiId } from "@/src/modules/panorama/domain/types";

const DELTA_GLYPH: Record<KpiDelta["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "＝",
};

/** Cap so the overlay never buries the map (presets curate 2-3). */
const MAX_CHIPS = 4;

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids (display order); null = manual. */
  metricIds: readonly PanoramaKpiId[] | null;
  /** Active vista — drives the de-dup short labels. */
  presetId: PresetId | null;
  pending?: boolean;
  degraded?: boolean;
  /**
   * Cowork QA ronda 3 §5 (C2, P2.4): true while a temporal frame is active
   * (the scrubber is off the live edge, `asOf` set). STOCK KPIs (`currentState`)
   * are "estado actual" by the HYBRID design — their big number does NOT move
   * with the scrubber, while the map + label + temporal/signal KPIs do. When a
   * temporal frame is active this EMPHASIZES the "estado actual" tag on those
   * stock cards so the not-tracking reads as intentional, never as a stuck bug.
   */
  temporalFrameActive?: boolean;
};

/** The first sentence of the KPI definition — the hover method note. */
function methodNote(kpi: PanoramaKpi): string {
  const def = kpi.info.definition ?? "";
  const stop = def.indexOf(". ");
  return stop > 0 ? def.slice(0, stop + 1) : def;
}

export function KpiChips({
  kpis,
  metricIds,
  presetId,
  pending = false,
  degraded = false,
  temporalFrameActive = false,
}: Props) {
  if (degraded) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-warn">
        No pudimos cargar los indicadores en este momento.
      </p>
    );
  }
  if (pending) {
    return (
      <p
        aria-busy="true"
        className="animate-pulse rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute"
      >
        Cargando indicadores…
      </p>
    );
  }

  const shown = selectMetricKpis(kpis, metricIds).slice(0, MAX_CHIPS);
  if (shown.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
        Métricas no disponibles para esta vista.
      </p>
    );
  }

  return (
    <ul aria-label="Indicadores de esta vista" className="m-0 flex list-none flex-col gap-1.5 p-0">
      {shown.map((kpi) => (
        <li
          key={kpi.id}
          // #49 item 1: floating chrome must read over ANY basemap — opaque fill.
          // Read-only (#53 Option A): default cursor, no hover affordance; the
          // hover title carries the method note only, promising nothing.
          className="flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 text-left"
          title={`${kpi.label} — ${methodNote(kpi)}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--text-lg)] font-bold tabular-nums text-ln-op-ink">
              {kpi.value}
            </span>
            {kpi.delta && (
              <span
                className="shrink-0 text-[var(--text-xs)] tabular-nums text-ln-op-faint"
                title={kpi.delta.label}
              >
                <span aria-hidden="true">{DELTA_GLYPH[kpi.delta.direction]}</span>{" "}
                {kpi.delta.pct > 0 ? "+" : ""}
                {kpi.delta.pct.toLocaleString("es-AR")}
                {kpi.delta.unit === "pts" ? " pts" : "%"}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-[var(--text-xs)] text-ln-op-mute">
              {shortKpiLabel(presetId, kpi.id, kpi.label)}
            </span>
            {kpi.sparkline && kpi.sparkline.length > 1 && (
              <Sparkline
                points={kpi.sparkline}
                width={64}
                height={18}
                ariaLabel={`Tendencia de ${shortKpiLabel(presetId, kpi.id, kpi.label)}`}
              />
            )}
          </div>
          {/* Coherence hybrid (cowork QA H1 / P2.4): a STOCK KPI does not move with
              the scrubber — say so, emphasized while a temporal frame is active. */}
          {kpi.currentState && (
            <span
              className={`text-[var(--text-xs)] font-medium uppercase tracking-[0.06em] ${
                temporalFrameActive
                  ? "w-fit rounded-[var(--radius-sm)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-1.5 py-0.5 text-ln-op-warn"
                  : "text-ln-op-faint"
              }`}
              title="Valor de estado actual: no cambia con la línea de tiempo (la reproducción mueve el mapa y los indicadores temporales)."
            >
              {temporalFrameActive ? "estado actual · no varía con la fecha" : "estado actual"}
            </span>
          )}
          {/* Coherence hybrid (cowork QA H6): the clearly-labeled secondary figure. */}
          {kpi.secondary && (
            <span className="truncate text-[var(--text-xs)] tabular-nums text-ln-op-faint">
              {kpi.secondary}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
