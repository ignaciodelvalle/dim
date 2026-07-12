"use client";

// KpiChips — the v3 KPI CARDS over the map (task #38 item 4). Each metric is a
// slightly larger card carrying: the value + short label (de-dup, item 5), the
// period-over-period delta (from the KPI payload), and a mini-sparkline for the
// window-sensitive metrics that ship one (cobertura / mordeduras / zoonosis —
// same trend plumbing as /gob home). Hover reveals a one-line method note; the
// full methodology lives in the right rail's "Acerca" panel (#49 item 10).
//
// Click still RE-BASES the choropleth (unchanged): a card whose KPI id names a
// BASE-role map layer routes onRebase(layerId) → PanoramaConsole.onToggle → the
// radio-exclusive base swap. KPIs with no base layer render as read-only cards.
//
// The cluster stays COMPACT — bigger cards, but the map still dominates (the PO's
// "MÁS MAPA" ruling). Honesty states (degraded / pending / empty) unchanged.
//
// #49 item 10 (progressive disclosure): the methodology affordance is NOT a text
// link under the cards anymore — it is consolidated into the right rail's
// "Acerca" (i) icon, so the KPI cluster carries only the numbers.

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
        // #49 item 1: floating chrome must read over ANY basemap. Opaque fill +
        // shadow scrim on every card (prev bg-ln-op-card/95 and the active
        // bg-ln-op-azul/10 were translucent — they washed out over busy barrio /
        // bivariate maps). Active state now reads via the blue border + ring +
        // blue value text (CardBody), keeping the fill fully opaque.
        const cardClass = `flex w-full flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left shadow-md ${
          active
            ? "border-ln-op-azul bg-ln-op-card ring-1 ring-ln-op-azul/40"
            : "border-ln-op-line bg-ln-op-card"
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
          // H8 (cowork QA): a KPI with no BASE map layer (zoonosis, denuncias…) is
          // NOT clickable — but it used to look identical to the clickable base
          // cards. Mark it honestly: a default cursor, no hover affordance, and a
          // tooltip stating it does not repaint the map (so the operator does not
          // click expecting the choropleth to change). aria-disabled announces the
          // read-only nature to assistive tech.
          <div
            key={kpi.id}
            aria-disabled="true"
            className={`${cardClass} cursor-default`}
            title={`${title} · Indicador de referencia: no pinta el mapa.`}
          >
            <CardBody kpi={kpi} presetId={presetId} active={active} />
          </div>
        );
      })}
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
