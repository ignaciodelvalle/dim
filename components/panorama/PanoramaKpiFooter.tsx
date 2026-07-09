"use client";

// PanoramaKpiFooter — the metrics column's recalculation cue + freshness chip
// + "Actualizar" button (extracted from PanoramaKpiStrip, panorama-vista-
// redesign Phase 3). Purely presentational; the parent owns the refresh fetch.

import { AR_TIME_ZONE } from "@/lib/utils/format";
import type { PanoramaKpis } from "@/src/modules/panorama/application/get-panorama-kpis";

type Props = {
  kpis: PanoramaKpis;
  /** map-QOL selective refresh — refetches KPIs + active layers, no reload. */
  onRefresh?: () => void;
  /** True while a selective refresh is in flight (disables the button). */
  refreshing?: boolean;
};

export function PanoramaKpiFooter({ kpis, onRefresh, refreshing = false }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-sm)] text-ln-op-mute">
      <p className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ln-op-azul" />
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
            timeZone: AR_TIME_ZONE,
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
  );
}
