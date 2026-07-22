/**
 * loading.tsx — full-segment navigation skeleton for /gob (govt operator).
 *
 * Shown by Next.js during segment-level navigation while the page's async
 * component is streaming. The shell (AppShell variant="operator") renders
 * immediately outside this boundary.
 *
 * C6b (2026-07-22, plan-maestro-integridad.md §C6): mirrors the home page's
 * new 4-block briefing shape instead of the old flat KPI-wall skeleton:
 *   1. Alertas priorizadas — 2 card-shaped placeholders (max 5, but the
 *      skeleton only needs to suggest "a short ranked list", not the cap).
 *   2. Brechas vs meta — the same KPI-tile placeholder row as before (the
 *      tiles didn't disappear, they just moved under the alerts).
 *   3. Cola operativa condensada — one compact row placeholder.
 *   4. Actividad reciente (collapsed) — one card placeholder.
 */

import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";
import { OpKpiSkeleton } from "@/components/ui/dashboard/OpKpiSkeleton";

const ALERT_KEYS = ["a", "b"] as const;
const KPI_KEYS = ["a", "b", "c", "d"] as const;

export default function GobLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-5xl px-8 py-7 pb-12 block"
    >
      <span className="sr-only">Cargando…</span>

      {/* Block 1 — Alertas priorizadas placeholder */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
        {ALERT_KEYS.map((k) => (
          <OpCardSkeleton key={`alert-${k}`} rows={2} />
        ))}
      </div>

      {/* Brechas vs meta — KPI grid placeholder (unchanged shape/count) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
        {KPI_KEYS.map((k) => (
          <OpKpiSkeleton key={`kpi-${k}`} />
        ))}
      </div>

      {/* Block 2 — Cola operativa condensada placeholder */}
      <div className="mb-6">
        <OpCardSkeleton rows={1} />
      </div>

      {/* Block 4 — Actividad reciente (collapsed) placeholder */}
      <OpCardSkeleton rows={3} />
    </output>
  );
}
