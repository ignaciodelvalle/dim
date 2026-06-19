/**
 * loading.tsx — skeleton for /gob/analytics (analytics dashboard).
 */

import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";
import { OpKpiSkeleton } from "@/components/ui/dashboard/OpKpiSkeleton";

const KPI_KEYS = ["a", "b", "c", "d"] as const;

export default function AnalyticsLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-5xl px-[32px] py-[28px] pb-[48px] block"
    >
      <span className="sr-only">Cargando…</span>

      <div className="grid grid-cols-2 gap-[16px] md:grid-cols-4 mb-[24px]">
        {KPI_KEYS.map((k) => (
          <OpKpiSkeleton key={k} />
        ))}
      </div>

      <div className="grid gap-[24px] md:grid-cols-2">
        <OpCardSkeleton rows={6} />
        <OpCardSkeleton rows={5} />
      </div>
    </output>
  );
}
