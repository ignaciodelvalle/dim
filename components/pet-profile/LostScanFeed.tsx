import Link from "next/link";

// LostScanFeed — unified feed of QR scans and finder messages for an
// active lost_pet_episode case.
//
// Sources, merged by `at` desc:
//   - `petEvents` where `event_type = 'credential_scanned'`, scoped to
//     this pet, since the case opened (case.openedAt). Group bursts
//     from the same approximate location/time-window into a single row.
//   - Finder-form submissions. Modeled today via the FoundPetForm at
//     /p/{token}; the server route logs them into petEvents (kind TBD)
//     or a sibling table. The plan calls this `finder_message`; data
//     wiring is open — see the plan's open decisions.
//
// Both rows link to a detail surface (case event detail or the
// finder-message detail page).

export type ScanFeedItem =
  | {
      kind: "scan";
      id: string;
      /** When the QR was scanned. Bursts are pre-grouped. */
      at: Date;
      /** Number of scans grouped into this row (1 if single). */
      count: number;
      /** Best-effort locality label, e.g. "La Plata centro" or "Berisso". */
      localityLabel: string | null;
    }
  | {
      kind: "finder";
      id: string;
      at: Date;
      /** Display name from finder form (or "Anónimo"). */
      finderName: string;
      /** Snippet — first line of the message. */
      snippet: string;
      /** Optional distance from last-known location, e.g. "5 cuadras". */
      distanceLabel?: string;
      /** Where to open the finder message. */
      href: string;
    };

interface Props {
  items: ScanFeedItem[];
  /** Total scan count for the header strip (since case opened). */
  totalScans: number;
  /** Total unread finder messages count. */
  totalFinderMessages: number;
  /** Link to the case audit. */
  caseHref: string;
}

export function LostScanFeed({ items, totalScans, totalFinderMessages, caseHref }: Props) {
  return (
    <section
      aria-labelledby="lp-feed-h"
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          id="lp-feed-h"
          className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Actividad del QR
        </h2>
        <Link href={caseHref} className="text-xs font-medium text-gob-azul-link hover:underline">
          Ver caso →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <CountBox value={totalScans} label="escaneos" />
        <CountBox value={totalFinderMessages} label="mensajes de finder" />
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Aún no hay actividad. Compartí la alerta para que más personas escaneen el QR.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <FeedRow item={it} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedRow({ item }: { item: ScanFeedItem }) {
  if (item.kind === "finder") {
    return (
      <Link
        href={item.href}
        className="flex items-start gap-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          ✉
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Mensaje de {item.finderName}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
            {item.snippet}
            {item.distanceLabel && <span> · {item.distanceLabel} del último punto</span>}
          </p>
        </div>
        <p className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
          {relativeShort(item.at)}
        </p>
      </Link>
    );
  }
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
      >
        📱
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {item.count > 1 ? `QR escaneado · ${item.count} veces` : "QR escaneado"}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {item.localityLabel ?? "Ubicación desconocida"}
        </p>
      </div>
      <p className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
        {relativeShort(item.at)}
      </p>
    </div>
  );
}

function CountBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2 text-center dark:bg-neutral-900">
      <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
    </div>
  );
}

function relativeShort(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} d.`;
}
