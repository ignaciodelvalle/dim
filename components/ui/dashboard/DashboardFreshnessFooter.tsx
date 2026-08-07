// DashboardFreshnessFooter — async server component.
//
// Renders a muted one-line footer on every dashboard indicating:
//   "Calculado al {server-render timestamp, es-AR} · último evento {maxOccurredAt, es-AR}"
//
// "Calculado al" anchors when the page was rendered (i.e. when the DB query
// ran), giving operators a staleness signal even before they check the data.
// "Último evento" shows the most recent pet_events row in scope so they can
// tell at a glance whether the system has new data or is quiet.
//
// DESIGN NOTES
// ------------
//   - Async RSC: awaits lastIngestAt so no client-side fetch is needed.
//   - Uses new Date() for "now" (server render time), NOT Date.now() stored
//     in state — this is intentionally a server-time snapshot.
//   - Token classes: text-[11px] text-ln-op-mute — matches the OpKpi sub/
//     hint row style used across the dashboard component set.
//   - No border, no padding — caller controls vertical spacing.

import { FreshnessStaleBand } from "@/components/ui/dashboard/FreshnessStaleBand";
import type { ProjectionContext } from "@/lib/metrics/context";
import { lastIngestAt } from "@/lib/metrics/freshness";
import { formatDateTimeNumericAr } from "@/lib/utils/format";

type Props = {
  ctx: ProjectionContext;
};

/**
 * Async server component that renders a muted freshness footer line.
 *
 * Example output:
 *   "Calculado al 21/06/2026 14:32 · último evento 20/06/2026 22:15"
 *   "Calculado al 21/06/2026 14:32 · último evento sin eventos"
 *
 * @param ctx - The active ProjectionContext (passed from the page boundary).
 */
export async function DashboardFreshnessFooter({ ctx }: Props) {
  const [maxAt] = await Promise.all([lastIngestAt(ctx)]);

  const nowLabel = formatDateTimeNumericAr(new Date());
  const eventLabel = maxAt != null ? formatDateTimeNumericAr(maxAt) : "sin eventos";

  return (
    <>
      {/* degraded-states: amber band once the SHOWN data crosses the staleness
          threshold (STALE_BAND_AFTER_MS). Mounted here, in the shared footer,
          so every call site gains it with zero edits. `refreshSignal` is an
          opaque per-render token: a live data refresh re-renders this RSC,
          serializes a new value, and resets the band's elapsed clock — it is
          never compared against the client clock (skew-immune). */}
      <FreshnessStaleBand refreshSignal={`${Date.now()}`} />
      <p className="text-[11px] text-ln-op-mute">
        Calculado al {nowLabel} · último evento {eventLabel}
      </p>
    </>
  );
}
