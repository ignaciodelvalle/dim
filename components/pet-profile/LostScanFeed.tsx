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
      /** Display name from the finder-in-possession form (or "Alguien"). */
      finderName: string;
      /** Finder contact string (phone and/or email). */
      finderContact: string | null;
      /** Reported pet condition: bien | herida | asustada | necesita_vet_urgente. */
      petCondition: string | null;
      /** Locality/place where the finder has the pet. */
      localityLabel: string | null;
      /** Free-text message left by the finder (truncated). */
      message: string | null;
      /** How long the finder can keep the pet: a date label, or "indefinido". */
      availabilityLabel: string | null;
      /** P0g: storage path set when the finder attached a photo. */
      photoStoragePath?: string | null;
      /** Pre-resolved signed URL for the finder photo (set by the server page). */
      photoUrl?: string | null;
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
      /** P0d: storage path set when the finder attached a photo. */
      photoStoragePath?: string | null;
      /** P0d: finder contact (phone or email) if they left one. */
      finderContact?: string | null;
      /** P0g: pre-resolved signed URL for the photo (set by the server page). */
      photoUrl?: string | null;
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
  const possessionCount = items.filter((it) => it.kind === "finder").length;
  return (
    <section
      aria-labelledby="lp-feed-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      {/* Possession callout — the most important signal in the feed: someone
          reported they physically HAVE the pet. Surfaced above everything. */}
      {possessionCount > 0 && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-ln-ok bg-[var(--color-ln-ok-050)] px-4 py-2.5"
        >
          <p className="text-sm font-bold text-ln-ok">🏠 ¡Alguien tiene a tu mascota!</p>
          <p className="mt-0.5 text-xs text-ln-ink-2">
            {possessionCount === 1
              ? "Una persona reportó que la tiene con ella. Contactala para coordinar el reencuentro."
              : `${possessionCount} personas reportaron tenerla. Contactalas para coordinar el reencuentro.`}
          </p>
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="lp-feed-h" className="text-base font-semibold text-ln-ink ">
          Actividad
        </h2>
        <Link href={caseHref} className="text-xs font-medium text-ln-azul hover:underline">
          Ver caso →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <CountBox value={totalScans} label="escaneos" />
        <CountBox value={totalSightings} label="avistajes" />
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ln-line-strong p-6 text-center text-sm text-ln-mute ">
          Cuando alguien escanee la chapita o reporte un avistaje, vas a verlo acá.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-ln-line ">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`}>
                <FeedRow item={it} />
              </li>
            ))}
          </ul>
          {items.length >= LOST_SCAN_FEED_CAP && (
            <p className="mt-2 text-xs text-ln-mute">
              Mostrando los {LOST_SCAN_FEED_CAP} más recientes.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const CONDITION_LABELS: Record<string, string> = {
  bien: "Está bien",
  herida: "Está herida",
  asustada: "Está asustada",
  necesita_vet_urgente: "Necesita veterinario urgente",
};

function FeedRow({ item }: { item: ScanFeedItem }) {
  if (item.kind === "finder") {
    // The handoff crux: a finder physically HAS the pet. Render it as a
    // highlighted, high-contrast row so the owner can contact them immediately.
    const urgent = item.petCondition === "necesita_vet_urgente";
    const conditionLabel = item.petCondition
      ? (CONDITION_LABELS[item.petCondition] ?? item.petCondition)
      : null;
    return (
      <div
        className={`my-2 flex items-start gap-3 rounded-xl border p-3 ${
          urgent
            ? "border-ln-err bg-[var(--color-ln-err-050)]"
            : "border-ln-ok bg-[var(--color-ln-ok-050)]"
        }`}
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
            urgent ? "bg-ln-err text-white" : "bg-ln-ok text-white"
          }`}
        >
          🏠
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ln-ink">{item.finderName} tiene a tu mascota</p>
          {conditionLabel && (
            <p className={`mt-0.5 text-xs font-medium ${urgent ? "text-ln-err" : "text-ln-ink-2"}`}>
              {conditionLabel}
              {item.localityLabel && <span className="text-ln-mute"> · {item.localityLabel}</span>}
            </p>
          )}
          {!conditionLabel && item.localityLabel && (
            <p className="mt-0.5 text-xs text-ln-mute">{item.localityLabel}</p>
          )}
          {item.finderContact && (
            <p className="mt-1 text-sm font-semibold text-ln-azul">
              📞{" "}
              <a href={`tel:${item.finderContact}`} className="hover:underline">
                {item.finderContact}
              </a>
            </p>
          )}
          {item.availabilityLabel && (
            <p className="mt-0.5 text-[11px] text-ln-mute">
              {item.availabilityLabel === "indefinido"
                ? "Puede cuidarla indefinidamente"
                : `Puede cuidarla hasta ${item.availabilityLabel}`}
            </p>
          )}
          {item.message && (
            <p className="mt-1 line-clamp-3 text-xs italic text-ln-ink-2">"{item.message}"</p>
          )}
          {item.photoUrl && (
            <div className="mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photoUrl}
                alt="Foto enviada por quien encontró a la mascota"
                loading="lazy"
                className="h-20 w-20 rounded-lg object-cover"
              />
            </div>
          )}
        </div>
        <p className="shrink-0 text-[11px] text-ln-mute">{relativeShort(item.at)}</p>
      </div>
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
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ln-ok-050)] text-ln-ok  "
        >
          👀
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ln-ink ">Avistaje reportado</p>
          <p className="mt-0.5 text-xs text-ln-mute ">
            {item.localityLabel ?? item.description ?? "Sin descripción"}
            {item.localityLabel && item.description && <span> · {item.description}</span>}
            {osmHref && (
              <a
                href={osmHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-ln-azul hover:underline"
              >
                Ver en mapa
              </a>
            )}
          </p>
          {/* P0g: photo thumbnail when a signed URL is available; falls back to
              text indicator when only the storage path is known; omitted when no photo. */}
          {item.photoUrl ? (
            <div className="mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photoUrl}
                alt="Foto adjunta al avistaje"
                loading="lazy"
                className="h-20 w-20 rounded-lg object-cover"
              />
            </div>
          ) : item.photoStoragePath ? (
            <p className="mt-1 text-xs text-ln-mute">
              <span>📷 foto adjunta</span>
            </p>
          ) : null}
          {item.finderContact && (
            <p className="mt-1 text-xs text-ln-mute">
              <span>📞 {item.finderContact}</span>
            </p>
          )}
        </div>
        <p className="shrink-0 text-[11px] text-ln-mute ">{relativeShort(item.at)}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ln-celeste/10 text-ln-azul  "
      >
        📱
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ln-ink ">
          {item.count > 1 ? `QR escaneado · ${item.count} veces` : "QR escaneado"}
        </p>
        <p className="mt-0.5 text-xs text-ln-mute ">
          {item.localityLabel ?? "Ubicación desconocida"}
        </p>
      </div>
      <p className="shrink-0 text-[11px] text-ln-mute ">{relativeShort(item.at)}</p>
    </div>
  );
}

function CountBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-ln-stripe px-3 py-2 text-center ">
      <p className="text-xl font-semibold text-ln-ink ">{value}</p>
      <p className="text-[11px] text-ln-mute ">{label}</p>
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
