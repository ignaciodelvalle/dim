import Link from "next/link";

import { LOST_SCAN_FEED_CAP } from "@/lib/lost-mode";

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
    }
  | {
      kind: "sighting";
      id: string;
      at: Date;
      /** Truncated (~80 chars) description from the note_added payload.text. */
      description: string | null;
      /** Best-effort locality label (future: reverse-geocode). */
      localityLabel: string | null;
      /** Decimal lat from pet_events.location_lat (string in DB). */
      lat: string | null;
      /** Decimal lng from pet_events.location_lng (string in DB). */
      lng: string | null;
    };

interface Props {
  items: ScanFeedItem[];
  /** Total scan count for the header strip (since case opened). */
  totalScans: number;
  /** Total sightings count (since case opened). */
  totalSightings: number;
  /** Link to the case audit. */
  caseHref: string;
}

export function LostScanFeed({ items, totalScans, totalSightings, caseHref }: Props) {
  return (
    <section
      aria-labelledby="lp-feed-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="lp-feed-h" className="text-base font-semibold text-gob-text ">
          Actividad
        </h2>
        <Link href={caseHref} className="text-xs font-medium text-gob-azul-link hover:underline">
          Ver caso →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <CountBox value={totalScans} label="escaneos" />
        <CountBox value={totalSightings} label="avistajes" />
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gob-border-strong p-6 text-center text-sm text-gob-text-muted ">
          Cuando alguien escanee la chapita o reporte un avistaje, vas a verlo acá.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gob-border ">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`}>
                <FeedRow item={it} />
              </li>
            ))}
          </ul>
          {items.length >= LOST_SCAN_FEED_CAP && (
            <p className="mt-2 text-xs text-gob-text-muted">
              Mostrando los {LOST_SCAN_FEED_CAP} más recientes.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FeedRow({ item }: { item: ScanFeedItem }) {
  if (item.kind === "finder") {
    return (
      <Link
        href={item.href}
        className="flex items-start gap-3 py-2.5 transition-colors hover:bg-gob-surface-alt "
      >
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gob-warning/10 text-gob-warning-text  "
        >
          ✉
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gob-text ">Mensaje de {item.finderName}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-gob-text-muted ">
            {item.snippet}
            {item.distanceLabel && <span> · {item.distanceLabel} del último punto</span>}
          </p>
        </div>
        <p className="shrink-0 text-[11px] text-gob-text-muted ">{relativeShort(item.at)}</p>
      </Link>
    );
  }

  if (item.kind === "sighting") {
    const osmHref =
      item.lat && item.lng
        ? `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}&zoom=16`
        : null;
    return (
      <div className="flex items-start gap-3 py-2.5">
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gob-success/10 text-gob-success  "
        >
          👀
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gob-text ">Avistaje reportado</p>
          <p className="mt-0.5 text-xs text-gob-text-muted ">
            {item.localityLabel ?? item.description ?? "Sin descripción"}
            {item.localityLabel && item.description && <span> · {item.description}</span>}
            {osmHref && (
              <a
                href={osmHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-gob-azul-link hover:underline"
              >
                Ver en mapa
              </a>
            )}
          </p>
        </div>
        <p className="shrink-0 text-[11px] text-gob-text-muted ">{relativeShort(item.at)}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gob-info/10 text-gob-azul-link  "
      >
        📱
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gob-text ">
          {item.count > 1 ? `QR escaneado · ${item.count} veces` : "QR escaneado"}
        </p>
        <p className="mt-0.5 text-xs text-gob-text-muted ">
          {item.localityLabel ?? "Ubicación desconocida"}
        </p>
      </div>
      <p className="shrink-0 text-[11px] text-gob-text-muted ">{relativeShort(item.at)}</p>
    </div>
  );
}

function CountBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-gob-surface-alt px-3 py-2 text-center ">
      <p className="text-xl font-semibold text-gob-text ">{value}</p>
      <p className="text-[11px] text-gob-text-muted ">{label}</p>
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
