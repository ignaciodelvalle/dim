import Link from "next/link";

// LostLastSeenCard — shows the last-known location pin + caption with a
// quick "edit" affordance and a CTA to add a fresh sighting.
//
// In v1 the map is a static preview (gradient + pin). When MapLibre is
// wired into this surface, swap the gradient div for a `<StaticMap>`
// component centered on lat/lng with a single marker. The Last-known
// location lives on the `cases` row as `primary_location_lat/lng` and
// the caption text comes from the case's opening event payload.
//
// Adding a sighting opens an `add-sighting` event on the case — which
// updates the pin but does NOT mutate the case row (events are
// append-only). The latest sighting wins for display.

interface Props {
  /** Pretty address line. e.g. "Plaza Italia" */
  placeName: string;
  /** Municipality. e.g. "La Plata" */
  localityLabel: string;
  /** When the location was reported. */
  at: Date;
  /** Optional owner note: "Salió por la puerta del frente, llevaba collar rojo" */
  note?: string | null;
  /** Page to edit the last-seen location (LocationFields). */
  editHref: string;
  /** Page to log a sighting (separate from edit — events are append-only). */
  addSightingHref: string;
  /** Number of sightings logged after the original drop. */
  sightingsCount: number;
}

export function LostLastSeenCard({
  placeName,
  localityLabel,
  at,
  note,
  editHref,
  addSightingHref,
  sightingsCount,
}: Props) {
  return (
    <section
      aria-labelledby="lp-loc-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="lp-loc-h" className="text-base font-semibold text-gob-text ">
          Última ubicación
          {sightingsCount > 0 && (
            <span className="ml-2 text-xs font-normal text-gob-text-muted ">
              · {sightingsCount} avistamiento{sightingsCount === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <Link
          href={addSightingHref}
          className="text-xs font-medium text-gob-azul-link hover:underline"
        >
          + Agregar avistamiento
        </Link>
      </div>

      <div className="relative h-36 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 to-blue-100  ">
        <div className="absolute inset-0 flex items-center justify-center">
          <span aria-hidden className="text-4xl drop-shadow">
            📍
          </span>
        </div>
        <Link
          href={editHref}
          className="absolute right-2 top-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-gob-azul-link shadow-sm hover:bg-white "
        >
          Editar
        </Link>
        <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-gob-text-gray shadow-sm  ">
          <p>
            <span className="font-semibold text-gob-text ">{placeName}</span>
            <span className="text-gob-text-muted "> · {localityLabel}</span>
            <span className="text-gob-text-muted "> · {formatWhen(at)}</span>
          </p>
          {note && <p className="mt-0.5 line-clamp-2 italic text-gob-text-muted ">"{note}"</p>}
        </div>
      </div>
    </section>
  );
}

function formatWhen(d: Date): string {
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
