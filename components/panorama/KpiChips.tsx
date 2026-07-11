"use client";

// KpiChips — the v2C top-left cluster's stacked KPI chips (spec: value mono +
// label + delta; the ACTIVE chip — the metric painting the map — is outlined;
// click → that metric becomes the choropleth base).
//
// Reads the SAME getPanoramaKpis() result the retired PanoramaMetricsColumn
// showed (selectMetricKpis subset: the active preset's curated metrics, or
// every KPI in manual mode — capped for the overlay so the chips never bury
// the map). "Re-base" maps onto the console's EXISTING base-swap machinery:
// a chip whose KPI id names a BASE-role map layer calls onRebase(layerId) →
// PanoramaConsole.onToggle → the radio-exclusive base swap + compatibility
// model, untouched. KPIs with no base layer (signals like zoonosis /
// mordeduras) render as read-only chips — they inform, they don't paint.
//
// Honesty states mirror the metrics column verbatim (same copy, same
// trust/safety contract): degraded → "No pudimos cargar los indicadores…",
// pending → "Cargando indicadores…", empty subset → "Métricas no
// disponibles…". English identifiers, es-AR copy (invariant #4).

import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import type {
  KpiDelta,
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

const DELTA_GLYPH: Record<KpiDelta["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "＝",
};

/** Cap for manual mode (no curated preset subset) — the overlay must not bury
 * the map under 8 stacked chips; presets curate 2-3. */
const MAX_CHIPS = 4;

type Props = {
  kpis: PanoramaKpis;
  /** The active preset's curated metric ids (display order); null = manual. */
  metricIds: readonly PanoramaKpiId[] | null;
  /** The layer currently painting the choropleth (caption/base layer). */
  activeBaseLayerId: LayerId | null;
  /** Re-base the map on this layer (routes to the console's onToggle). */
  onRebase: (layerId: LayerId) => void;
  pending?: boolean;
  degraded?: boolean;
};

/** The BASE-role map layer a KPI id can paint, or null (signal/no layer). */
function baseLayerFor(kpiId: PanoramaKpiId): LayerId | null {
  const layer = PANORAMA_LAYERS.find((l) => l.id === kpiId);
  return layer !== undefined && roleOf(layer) === "base" ? layer.id : null;
}

export function KpiChips({
  kpis,
  metricIds,
  activeBaseLayerId,
  onRebase,
  pending = false,
  degraded = false,
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
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="sr-only">Indicadores de esta vista</legend>
      {shown.map((kpi) => {
        const baseId = baseLayerFor(kpi.id);
        const active = baseId !== null && baseId === activeBaseLayerId;
        const chipClass = `flex w-full items-baseline gap-2 rounded-[var(--radius-md)] border px-3 py-1 ${
          active ? "border-ln-op-azul bg-ln-op-azul/10" : "border-ln-op-line bg-ln-op-card"
        }`;
        return baseId !== null ? (
          <button
            key={kpi.id}
            type="button"
            aria-pressed={active}
            title={`Pintar el mapa por ${kpi.label.toLowerCase()}`}
            onClick={() => {
              if (!active) onRebase(baseId);
            }}
            className={`${chipClass} transition-colors hover:border-ln-op-celeste`}
          >
            <ChipBody kpi={kpi} active={active} />
          </button>
        ) : (
          // Signal/derived KPI — no base layer to paint; read-only chip.
          <div key={kpi.id} className={chipClass}>
            <ChipBody kpi={kpi} active={active} />
          </div>
        );
      })}
    </fieldset>
  );
}

/** The chip's shared inner content (value + label + delta). */
function ChipBody({ kpi, active }: { kpi: PanoramaKpi; active: boolean }) {
  return (
    <>
      <span
        className={`text-md font-bold tabular-nums ${active ? "text-ln-op-azul" : "text-ln-op-ink"}`}
      >
        {kpi.value}
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-[var(--text-xs)] text-ln-op-mute">
        {kpi.label}
      </span>
      {kpi.delta && (
        <span className="text-[var(--text-xs)] tabular-nums text-ln-op-faint">
          <span aria-hidden="true">{DELTA_GLYPH[kpi.delta.direction]}</span> {kpi.delta.label}
        </span>
      )}
    </>
  );
}
