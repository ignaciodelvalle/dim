/**
 * loading.tsx — full-segment navigation skeleton for /gob (govt operator).
 *
 * Shown by Next.js during segment-level navigation while the page's async
 * component is streaming. The shell (AppShell variant="operator") renders
 * immediately outside this boundary.
 */

import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";
import { OpKpiSkeleton } from "@/components/ui/dashboard/OpKpiSkeleton";

const KPI_KEYS = ["a", "b", "c", "d"] as const;

export default function GobLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-5xl px-[32px] py-[28px] pb-[48px] block"
    >
      <span className="sr-only">Cargando…</span>

      {/* KPI grid placeholder */}
      <div className="grid grid-cols-2 gap-[16px] md:grid-cols-4 mb-[24px]">
        {KPI_KEYS.map((k) => (
          <OpKpiSkeleton key={k} />
        ))}
      </div>

      {/* Cards grid placeholder */}
      <div className="grid gap-[24px] md:grid-cols-2">
        <OpCardSkeleton rows={5} />
        <OpCardSkeleton rows={4} />
      </div>
    </output>
  );
}
