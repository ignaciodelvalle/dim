// LostLastSeenCard — shows the last-known location pin + caption with a
// quick "edit" affordance, a helper note for the owner, and a button to
// copy the public credential link so they can share it with whoever spotted
// the pet.
//
// When the mark-lost event included GPS coordinates (owner dropped a pin in
// LocationFields), a STATIC-FIRST embed (components/maps/StaticFirstMap)
// replaces the placeholder gradient: the map paints as a static preview and
// only pulls the maplibre-gl chunk + live tiles after the owner explicitly
// activates it (map-QOL P3 — design rule: static-first embeds, one single
// "explorar" affordance, zero controls until activated). This is the OWNER
// surface, so the point is rendered at exact precision.
//
// Sightings are reported by finders via the public credential (/p/{token}).
// The owner-side add-sighting route was removed (P0a) — owners share the
// public link instead.

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { StaticFirstMap } from "@/components/maps/StaticFirstMap";
import { pluralizeEs } from "@/lib/utils/format";

import { CopyPublicLinkButton } from "./CopyPublicLinkButton";

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
  /** Full public credential URL — passed to the copy button. */
  publicUrl: string;
  /** Number of sightings logged after the original drop. */
  sightingsCount: number;
  /**
   * Precise latitude from the mark-lost event (numeric string from Drizzle).
   * When present together with lastSeenLng, renders a live mini-map.
   */
  lastSeenLat?: string | null;
  /**
   * Precise longitude from the mark-lost event.
   */
  lastSeenLng?: string | null;
}

export function LostLastSeenCard({
  placeName,
  localityLabel,
  at,
  note,
  editHref,
  publicUrl,
  sightingsCount,
  lastSeenLat,
  lastSeenLng,
}: Props) {
  const lat = lastSeenLat ? Number(lastSeenLat) : null;
  const lng = lastSeenLng ? Number(lastSeenLng) : null;
  const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <section
      aria-labelledby="lp-loc-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="lp-loc-h" className="text-base font-semibold text-ln-ink ">
          Última ubicación
          {sightingsCount > 0 && (
            <span className="ml-2 text-xs font-normal text-ln-mute ">
              · {sightingsCount} {pluralizeEs(sightingsCount, "avistamiento")}
            </span>
          )}
        </h2>
      </div>

      {hasCoords ? (
        <div className="relative overflow-hidden rounded-xl">
          <StaticFirstMap
            lat={lat as number}
            lng={lng as number}
            label={placeName}
            precision="exact"
            heightClassName="h-40"
          />
          <Link
            href={editHref}
            className="absolute right-2 top-2 rounded-full bg-ln-card/95 px-3 py-1 text-[11px] font-semibold text-ln-azul shadow-sm hover:bg-ln-card "
          >
            Editar
          </Link>
          <div className="mt-2 rounded-lg border border-ln-line px-3 py-2 text-xs text-ln-ink-2  ">
            <p>
              <span className="font-semibold text-ln-ink ">{placeName}</span>
              <span className="text-ln-mute "> · {localityLabel}</span>
              <span className="text-ln-mute "> · {formatWhen(at)}</span>
            </p>
            {note && <p className="mt-0.5 line-clamp-2 italic text-ln-mute ">"{note}"</p>}
          </div>
        </div>
      ) : (
        <div className="relative h-36 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-ln-ok-050)] to-ln-celeste/10  ">
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-ln-ok)] drop-shadow">
            <Icon name="ubicacion" size={36} decorative />
          </div>
          <Link
            href={editHref}
            className="absolute right-2 top-2 rounded-full bg-ln-card/95 px-3 py-1 text-[11px] font-semibold text-ln-azul shadow-sm hover:bg-ln-card "
          >
            Editar
          </Link>
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-ln-card/95 px-3 py-2 text-xs text-ln-ink-2 shadow-sm  ">
            <p>
              <span className="font-semibold text-ln-ink ">{placeName}</span>
              <span className="text-ln-mute "> · {localityLabel}</span>
              <span className="text-ln-mute "> · {formatWhen(at)}</span>
            </p>
            {note && <p className="mt-0.5 line-clamp-2 italic text-ln-mute ">"{note}"</p>}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-ln-mute">
        Si te avisaron por afuera, mandales el link de la credencial para que reporten el avistaje
        desde ahí.
      </p>
      <CopyPublicLinkButton publicUrl={publicUrl} />
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
