// NovedadesCard — session-start "Novedades" orientation feed, shared by the
// /gob and /admin operator HOMEs (viz-suite Wave 1, plan docs/plans/viz-suite.md).
//
// Pure server component: the page fetches the feed (fetchNovedadesFeed) and
// passes it in, so this stays render-only and inherits the page's data-load
// budget. Ledger-style rows — es-AR event label + jurisdiction + relative time +
// a per-item "Ver en su cola →" link to the queue that handles that event type.
//
// The watermark advances ONLY via the explicit "Marcar como visto" button (a
// form posting markNovedadesSeenAction) — never on render, so a refresh cannot
// clear the feed. The button lives here (components/operator/, outside the
// operator raw-<button> ratchet glob) and is a pure text-link control, matching
// the documented text-link exception to the OpButton chrome primitive.

import Link from "next/link";

import { markNovedadesSeenAction } from "@/app/actions/novedades";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { type NovedadesFeed, feedQueueHref } from "@/lib/metrics/novedades-feed";
import { eventTypeLabel, relativeTime } from "@/lib/utils/format";

function formatJurisdiction(province: string | null, locality: string | null): string {
  if (province && locality) return `${locality}, ${province}`;
  if (province) return province;
  return "Sin localidad";
}

export function NovedadesCard({ feed }: { feed: NovedadesFeed }) {
  const { rows, sinceWatermark } = feed;

  // First visit (no watermark) shows the last 7 days and says so; otherwise the
  // window is "desde tu última visita".
  const subtitle = sinceWatermark ? "desde tu última visita" : "Últimos 7 días";
  const emptyCopy = sinceWatermark
    ? "Sin novedades desde tu última visita."
    : "Sin novedades en los últimos 7 días.";

  return (
    <OpCard>
      <OpCardHead
        title={
          <>
            Novedades{" "}
            <span className="text-[var(--text-sm)] font-normal text-ln-op-mute">{subtitle}</span>
          </>
        }
        actions={
          rows.length > 0 ? (
            <form action={markNovedadesSeenAction}>
              <button type="submit" className="text-sm text-ln-op-azul hover:underline">
                Marcar como visto
              </button>
            </form>
          ) : null
        }
      />
      <OpCardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-[var(--text-md)] text-ln-op-mute">{emptyCopy}</p>
        ) : (
          <ul className="divide-y divide-ln-op-line-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 odd:bg-ln-op-stripe"
              >
                <div className="min-w-0">
                  <p className="text-[var(--text-md)] text-ln-op-ink">
                    {eventTypeLabel(row.eventType)}
                  </p>
                  <p className="truncate text-sm text-ln-op-mute">
                    {formatJurisdiction(row.province, row.locality)} ·{" "}
                    {relativeTime(row.recordedAt)}
                  </p>
                </div>
                <Link
                  href={feedQueueHref(row.eventType)}
                  className="shrink-0 text-sm text-ln-op-azul hover:underline no-underline"
                >
                  Ver en su cola →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </OpCardBody>
    </OpCard>
  );
}
