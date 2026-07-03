"use client";

// PanoramaKpiStrip — the console's headline KPI tiles.
//
// Renders the use-case's KPIs as OpKpi tiles (with ⓘ info tooltips and drill
// hrefs to the matching detail dashboard). A visible cue states the numbers are
// "recalculado para este alcance / este período" so the operator understands
// the strip tracks the active filters — not a static national figure.
//
// PARITY: the values + tooltip wording come straight from getPanoramaKpis,
// which calls the same tested dashboard fetchers — so a number here always
// matches the same number on the detail dashboard it links to.
//
// map-QOL additions:
// - Period-over-period delta on the window-sensitive tiles, rendered INSIDE
//   the tile via OpKpi's deltaV2 slot: an arrow glyph PAIRED with the signed
//   percentage + sr-only text (never color-only).
// - Freshness chip ("Datos al …", from lastIngestAt) + an "Actualizar" button
//   for a SELECTIVE refresh: the parent refetches KPIs + active layers via
//   plain client fetches — no reload, the map never unmounts.

import { OpKpi } from "@/components/ui/dashboard";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";

type Props = {
  kpis: PanoramaKpis;
  /** map-QOL selective refresh — refetches KPIs + active layers, no reload. */
  onRefresh?: () => void;
  /** True while a selective refresh is in flight (disables the button). */
  refreshing?: boolean;
};

export function PanoramaKpiStrip({ kpis, onRefresh, refreshing = false }: Props) {
  return (
    <section aria-label="Indicadores del panorama" className="space-y-2">
      {/* auto-fit grid: the tiles always split the full row width evenly, so
          an odd KPI count never leaves an orphan tile next to a run of empty
          columns (QA 2026-07-03: 7 tiles in a 6-col grid wasted most of the
          second row on wide screens). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {kpis.kpis.map((kpi) => (
          <OpKpi
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            tone={kpi.tone}
            bar={kpi.bar}
            sub={kpi.sub}
            href={kpi.href}
            info={kpi.info}
            deltaV2={
              kpi.delta ? { value: kpi.delta.pct, period: "vs período anterior" } : undefined
            }
          />
        ))}
      </div>
      {/* Recalculation cue + freshness chip — the strip tracks the active
          scope + period, and says how fresh the underlying ingest is. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ln-op-mute">
        <p className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-ln-op-azul"
          />
          {kpis.recalculatedFor} Consistente con las superficies de detalle.
        </p>
        {kpis.dataAsOf && (
          <span
            suppressHydrationWarning
            className="rounded-full border border-ln-op-line bg-ln-op-card px-2 py-0.5"
          >
            Datos al{" "}
            {new Date(kpis.dataAsOf).toLocaleString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-full border border-ln-op-line bg-ln-op-card px-2 py-0.5 text-ln-op-ink-2 hover:border-ln-op-azul/40 disabled:cursor-wait disabled:opacity-60"
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        )}
      </div>
    </section>
  );
}
