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

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import { Sparkline } from "@/components/panorama/Sparkline";
import { shortKpiLabel } from "@/components/panorama/panorama-labels";
import type {
  KpiDelta,
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { partitionKpiIdsByRelevance } from "@/src/modules/panorama/domain/metric-relevance";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
import type { LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

// Delta direction glyph — up/down route through the Icon registry (no bare
// triangle glyphs); "flat" has no lucide equivalent worth a registry entry
// for a single fullwidth "＝" (not a banned symbol-as-icon character).
function DeltaGlyph({ direction }: { direction: KpiDelta["direction"] }) {
  if (direction === "flat") return <span aria-hidden="true">＝</span>;
  return <Icon name={direction === "up" ? "chevron-up" : "chevron-down"} size="sm" decorative />;
}

/** Cap so the overlay never buries the map (presets curate 2-3). */
const MAX_CHIPS = 4;

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids (display order); null = manual. */
  metricIds: readonly PanoramaKpiId[] | null;
  /** Active vista — drives the de-dup short labels. */
  presetId: PresetId | null;
  /**
   * C2a — the ids of the layers currently painted on the map. In MANUAL mode
   * (`metricIds` null) the overlay shows only the KPIs whose subject is among
   * these layers up-front; the rest hide behind a "Ver todos los indicadores"
   * toggle so an indicator never reads as if it described a layer that is not
   * on the map. Undefined (or in preset mode) keeps the pre-C2a behavior.
   */
  activeLayerIds?: readonly LayerId[];
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

/** One KPI card. `dimmed` (C2a) renders the honest "no corresponde a las capas
 *  activas" treatment for a manual-mode indicator whose subject is off the map. */
function KpiCard({
  kpi,
  presetId,
  temporalFrameActive,
  dimmed = false,
}: {
  kpi: PanoramaKpi;
  presetId: PresetId | null;
  temporalFrameActive: boolean;
  dimmed?: boolean;
}) {
  return (
    <li
      // #49 item 1: floating chrome must read over ANY basemap — opaque fill.
      // Read-only (#53 Option A): default cursor, no hover affordance; the
      // hover title carries the method note only, promising nothing.
      className={`flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 text-left ${
        dimmed ? "opacity-60" : ""
      }`}
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
            <DeltaGlyph direction={kpi.delta.direction} /> {kpi.delta.pct > 0 ? "+" : ""}
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
      {/* C2a: an indicator whose subject layer is NOT painted — say so plainly so
          the number never reads as if it described the current map. */}
      {dimmed && (
        <span className="text-[var(--text-xs)] italic text-ln-op-faint">
          no corresponde a las capas activas
        </span>
      )}
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
  );
}

export function KpiChips({
  kpis,
  metricIds,
  presetId,
  activeLayerIds,
  pending = false,
  degraded = false,
  temporalFrameActive = false,
}: Props) {
  // C2a: in manual mode, irrelevant indicators start hidden behind a toggle.
  const [showAll, setShowAll] = useState(false);

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

  const selected = selectMetricKpis(kpis, metricIds);
  if (selected.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-sm)] text-ln-op-mute">
        Métricas no disponibles para esta vista.
      </p>
    );
  }

  // Preset mode (metricIds set) OR no layer context: unchanged — show the curated
  // (or full) set capped at MAX_CHIPS, no relevance partition.
  const manualMode = metricIds === null && activeLayerIds !== undefined;
  if (!manualMode) {
    const shown = selected.slice(0, MAX_CHIPS);
    return (
      <ul
        aria-label="Indicadores de esta vista"
        className="m-0 flex list-none flex-col gap-1.5 p-0"
      >
        {shown.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            presetId={presetId}
            temporalFrameActive={temporalFrameActive}
          />
        ))}
      </ul>
    );
  }

  // C2a manual mode: partition by whether the KPI's subject layer is on the map.
  const { relevant, irrelevant } = partitionKpiIdsByRelevance(selected, activeLayerIds);
  const shownRelevant = relevant.slice(0, MAX_CHIPS);

  return (
    <div className="flex flex-col gap-1.5">
      <ul
        aria-label="Indicadores de esta vista"
        className="m-0 flex list-none flex-col gap-1.5 p-0"
      >
        {shownRelevant.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            presetId={presetId}
            temporalFrameActive={temporalFrameActive}
          />
        ))}
      </ul>
      {shownRelevant.length === 0 && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-ln-op-line bg-ln-op-card px-3 py-2 text-center text-[var(--text-xs)] text-ln-op-mute">
          Ningún indicador corresponde directamente a las capas activas.
        </p>
      )}
      {irrelevant.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls="kpi-irrelevant-list"
            onClick={() => setShowAll((v) => !v)}
            className="w-fit text-[var(--text-xs)] font-medium text-ln-op-azul hover:underline"
          >
            {showAll
              ? "Ocultar indicadores de otras capas"
              : `Ver todos los indicadores (${irrelevant.length})`}
          </button>
          {showAll && (
            <ul
              id="kpi-irrelevant-list"
              aria-label="Indicadores de otras capas"
              className="m-0 flex list-none flex-col gap-1.5 p-0"
            >
              {irrelevant.map((kpi) => (
                <KpiCard
                  key={kpi.id}
                  kpi={kpi}
                  presetId={presetId}
                  temporalFrameActive={temporalFrameActive}
                  dimmed
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
