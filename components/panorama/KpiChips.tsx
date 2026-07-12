"use client";

// KpiChips — the v3 KPI CARDS over the map (task #38 item 4). Each metric is a
// slightly larger card carrying: the value + short label (de-dup, item 5), the
// period-over-period delta (from the KPI payload), and a mini-sparkline for the
// window-sensitive metrics that ship one (cobertura / mordeduras / zoonosis —
// same trend plumbing as /gob home). Hover reveals a one-line method note; a
// single "Ver metodología" link opens the Acerca rail panel (onOpenAbout).
//
// Click still RE-BASES the choropleth (unchanged): a card whose KPI id names a
// BASE-role map layer routes onRebase(layerId) → PanoramaConsole.onToggle → the
// radio-exclusive base swap. KPIs with no base layer render as read-only cards.
//
// The cluster stays COMPACT — bigger cards, but the map still dominates (the PO's
// "MÁS MAPA" ruling). Honesty states (degraded / pending / empty) unchanged.

import { selectMetricKpis } from "@/components/panorama/PanoramaMetricsColumn";
import { Sparkline } from "@/components/panorama/Sparkline";
import { shortKpiLabel } from "@/components/panorama/panorama-labels";
import type {
  KpiDelta,
  PanoramaKpi,
  PanoramaKpis,
} from "@/src/modules/panorama/application/get-panorama-kpis";
import { roleOf } from "@/src/modules/panorama/domain/compatibility";
import { PANORAMA_LAYERS } from "@/src/modules/panorama/domain/layers";
import type { PresetId } from "@/src/modules/panorama/domain/presets";
import type { LayerId, PanoramaKpiId } from "@/src/modules/panorama/domain/types";

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
  /** The layer currently painting the choropleth (caption/base layer). */
  activeBaseLayerId: LayerId | null;
  /** Re-base the map on this layer (routes to the console's onToggle). */
  onRebase: (layerId: LayerId) => void;
  /** Open the Acerca rail panel (methodology). */
  onOpenAbout?: () => void;
  pending?: boolean;
  degraded?: boolean;
};

/** The BASE-role map layer a KPI id can paint, or null (signal/no layer). */
function baseLayerFor(kpiId: PanoramaKpiId): LayerId | null {
  const layer = PANORAMA_LAYERS.find((l) => l.id === kpiId);
  return layer !== undefined && roleOf(layer) === "base" ? layer.id : null;
}

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
  activeBaseLayerId,
  onRebase,
  onOpenAbout,
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
        const cardClass = `flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left ${
          active ? "border-ln-op-azul bg-ln-op-azul/10" : "border-ln-op-line bg-ln-op-card/95"
        }`;
        const title = `${kpi.label} — ${methodNote(kpi)}`;
        return baseId !== null ? (
          <button
            key={kpi.id}
            type="button"
            aria-pressed={active}
            title={`${title} · Click para pintar el mapa por esta métrica.`}
            onClick={() => {
              if (!active) onRebase(baseId);
            }}
            className={`${cardClass} transition-colors hover:border-ln-op-celeste`}
          >
            <CardBody kpi={kpi} presetId={presetId} active={active} />
          </button>
        ) : (
          <div key={kpi.id} className={cardClass} title={title}>
            <CardBody kpi={kpi} presetId={presetId} active={active} />
          </div>
        );
      })}
      {onOpenAbout && (
        <button
          type="button"
          onClick={onOpenAbout}
          className="self-start text-[var(--text-xs)] font-medium text-ln-op-azul hover:underline"
        >
          Ver metodología
        </button>
      )}
    </fieldset>
  );
}

/** The card's inner content (value + delta + short label + sparkline). */
function CardBody({
  kpi,
  presetId,
  active,
}: {
  kpi: PanoramaKpi;
  presetId: PresetId | null;
  active: boolean;
}) {
  const label = shortKpiLabel(presetId, kpi.id, kpi.label);
  const spark = kpi.sparkline;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-[var(--text-lg)] font-bold tabular-nums ${
            active ? "text-ln-op-azul" : "text-ln-op-ink"
          }`}
        >
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
          {label}
        </span>
        {spark && spark.length > 1 && (
          <Sparkline points={spark} width={64} height={18} ariaLabel={`Tendencia de ${label}`} />
        )}
      </div>
      {/* Coherence hybrid (cowork QA H1): a STOCK KPI does not move with the
          scrubber — say so, so the operator reads the scrubber's non-effect as
          intentional (the map + temporal KPIs move; this snapshot does not). */}
      {kpi.currentState && (
        <span
          className="text-[var(--text-xs)] font-medium uppercase tracking-[0.06em] text-ln-op-faint"
          title="Valor de estado actual: no cambia con la línea de tiempo (la reproducción mueve el mapa y los indicadores temporales)."
        >
          estado actual
        </span>
      )}
      {/* Coherence hybrid (cowork QA H6): the clearly-labeled secondary figure
          (e.g. denuncias backlog) — visible without masquerading as the primary. */}
      {kpi.secondary && (
        <span className="truncate text-[var(--text-xs)] tabular-nums text-ln-op-faint">
          {kpi.secondary}
        </span>
      )}
    </>
  );
}
