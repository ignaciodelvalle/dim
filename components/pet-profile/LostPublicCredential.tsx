// LostPublicCredential — the layout shown at /p/[publicToken] when the
// pet is in lost mode. Drop-in replacement for the public credential's
// "lost" branch.
//
// What strangers need in five seconds:
//   1) The pet is lost. (red banner, big "Soy {name} — estoy perdida")
//   2) The owner is real. (first name if disclosed)
//   3) How to help fast. (call button OR finder form)
//   4) Where it was last seen. (one map preview if disclosed)
//
// Everything else (vaccines, weight, full libreta) is hidden in lost
// mode by default. The owner can opt-in later via a future toggle.
//
// All props are server-resolved AFTER applying the disclosure prefs on
// `pets`. The component itself never decides what to show — the page
// passes only what's actually disclosable.

import { BRANDING } from "@/lib/branding";
import { lostBannerHeadline, lostFirstPersonLine, normalizePhoneForTel } from "@/lib/format";
import { tattooLocationLabel } from "@/lib/reference/lookups";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

// Live mini-map of the last-seen point. Loaded via next/dynamic (maplibre-gl must
// not run on the server) — same pattern as LostLastSeenCard (owner side).
const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-xl border border-ln-line bg-ln-stripe" />
  ),
});

interface Props {
  petName: string;
  petPhotoUrl: string | null;
  /** Pet sex ('male' | 'female' | 'unknown') — genders the lost-mode copy. */
  petSex: string | null;
  /** "Canino · marrón · collar rojo" — short identifying line. */
  identityLine: string;
  /** Owner first name, or null if hidden by prefs. */
  ownerFirstName: string | null;
  /** E.164 phone for tel:, or null if hidden by prefs. */
  ownerPhoneE164: string | null;
  /** Last seen place label or null if hidden. */
  lastSeenPlaceName: string | null;
  /** Last seen locality. */
  lastSeenLocality: string | null;
  /** Distinguishing features (free text from pet record), or null. */
  distinguishingFeatures: string | null;
  /** Finder form URL. Pass null to hide the CTA. */
  finderFormHref: string | null;
  /** Sighting form URL ("La vi cerca de acá"). Independent of finderFormHref —
   * surfaces a lower-commitment way to help (drop a pin, no custody claim). */
  sightingFormHref?: string | null;
  /** Date the pet was marked lost. */
  lostSince: Date;
  /** Tattoo code — gated by lost status (D3). Null if pet has no tattoo. */
  tattooCode?: string | null;
  /** Tattoo body location enum value — used to look up the human label. */
  tattooLocation?: string | null;
  /** Free-form origin / description (FCA, criadero, campaign, etc.). */
  tattooDescription?: string | null;
  /** Resolved public URL of the tattoo photo, or null if unavailable. */
  tattooPhotoUrl?: string | null;
  /** Last seen lat/lng — when present, renders an inline MapLibre mini-map of
   * the point plus an "Abrir en Google Maps" link so a finder can navigate from
   * where the pet was lost. Sprint 5 PR-041 / doc 10 §3 punto 1. */
  lastSeenLat?: number | null;
  lastSeenLng?: number | null;
  /** Free-form lost description fields from the mark-lost event payload (spec §8.4).
   * Always shown when present — no disclosure pref gates animal identity details. */
  lostDescription?: {
    accessoriesWhenLost: string | null;
    behaviorNotes: string | null;
    lastSeenContext: string | null;
  } | null;
}

export function LostPublicCredential({
  petName,
  petPhotoUrl,
  petSex,
  identityLine,
  ownerFirstName,
  ownerPhoneE164,
  lastSeenPlaceName,
  lastSeenLocality,
  distinguishingFeatures,
  finderFormHref,
  sightingFormHref = null,
  lostSince,
  tattooCode = null,
  tattooLocation = null,
  tattooDescription = null,
  tattooPhotoUrl = null,
  lastSeenLat = null,
  lastSeenLng = null,
  lostDescription = null,
}: Props) {
  const tattooLocLabel = tattooLocationLabel(tattooLocation);
  const hasLastSeenCoords =
    lastSeenLat != null &&
    lastSeenLng != null &&
    Number.isFinite(lastSeenLat) &&
    Number.isFinite(lastSeenLng);
  const mapHref = hasLastSeenCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lastSeenLat},${lastSeenLng}`
    : null;
  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="min-h-screen bg-[var(--color-ln-err-050)] px-4 py-6 ">
      <div className="mx-auto max-w-md space-y-4">
        {/* Urgent banner (sprint 5 PR-041 / doc 10 §3 punto 1) — surfaces the
            "perdida" state + how recent, in the lostUrgentBanner spec voice. */}
        <div
          className="rounded-2xl bg-ln-err px-4 py-3 text-center text-white"
          role="alert"
          data-section="lost-urgent-banner"
        >
          <p className="text-base font-bold tracking-wide">⚠ {lostBannerHeadline(petSex)}</p>
          <p className="mt-0.5 text-xs opacity-90">{formatLostSince(lostSince)}</p>
        </div>

        <section className="rounded-2xl bg-ln-card p-5 text-center shadow-sm ">
          <div className="mx-auto inline-block">
            <span className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ln-warn-050)] ring-[5px] ring-ln-err">
              {petPhotoUrl ? (
                <Image
                  src={petPhotoUrl}
                  alt={petName}
                  fill
                  sizes="128px"
                  className="object-cover"
                  priority
                />
              ) : (
                <span className="text-5xl font-bold text-ln-warn">
                  {petName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ln-err ">
            ¡Hola! Soy {petName} — {lostFirstPersonLine(petSex)}
          </h1>
          <p className="mt-1 text-sm text-ln-ink-2 ">{identityLine}</p>
          {distinguishingFeatures && (
            <p className="mt-2 text-sm italic text-ln-ink-2 ">"{distinguishingFeatures}"</p>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ownerPhoneE164 && (
              <a
                href={`tel:${normalizePhoneForTel(ownerPhoneE164) ?? ownerPhoneE164}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-ok px-5 text-sm font-semibold text-white hover:bg-ln-ok/90"
              >
                📞 Llamar{ownerFirstName ? ` a ${ownerFirstName}` : ""}
              </a>
            )}
            {finderFormHref && (
              <Link
                href={finderFormHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-azul px-5 text-sm font-semibold text-white hover:bg-ln-azul-700"
              >
                📍 La tengo conmigo
              </Link>
            )}
            {sightingFormHref && (
              <Link
                href={sightingFormHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-card border border-ln-line px-5 text-sm font-semibold text-ln-ink hover:bg-ln-stripe   "
              >
                👀 La vi cerca de acá
              </Link>
            )}
          </div>

          {!ownerPhoneE164 && !finderFormHref && (
            <p className="mt-3 rounded-lg bg-[var(--color-ln-warn-050)] px-3 py-2 text-xs text-ln-warn  ">
              Esta mascota no tiene canales de contacto habilitados.
            </p>
          )}
        </section>

        {(lastSeenPlaceName || lastSeenLocality || hasLastSeenCoords) && (
          <section className="rounded-2xl bg-ln-card p-4 shadow-sm ">
            <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute ">
              Última vez vista
            </p>
            {(lastSeenPlaceName || lastSeenLocality) && (
              <p className="mt-1 text-sm font-medium text-ln-ink ">
                {[lastSeenPlaceName, lastSeenLocality].filter(Boolean).join(" · ")}
              </p>
            )}
            {hasLastSeenCoords ? (
              <div className="mt-3 h-40 w-full overflow-hidden rounded-xl border border-ln-line">
                <LocationMap lat={lastSeenLat as number} lng={lastSeenLng as number} />
              </div>
            ) : (
              <div className="mt-3 flex h-32 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-[var(--color-ln-ok-050)] to-ln-celeste/10  ">
                <span aria-hidden="true" className="text-3xl">
                  📍
                </span>
                <span className="text-xs text-[var(--color-ln-mute)]">
                  Sin punto exacto en el mapa
                </span>
              </div>
            )}
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block text-xs font-medium text-ln-ok  underline underline-offset-2 hover:text-ln-ok/80"
              >
                Abrir en Google Maps ↗
              </a>
            )}
          </section>
        )}

        {tattooCode && (
          <section className="rounded-2xl bg-ln-card p-4 shadow-sm ">
            <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute ">Tatuaje</p>
            <p className="mt-1 font-mono text-sm font-medium text-ln-ink ">
              {tattooCode}
              {tattooLocLabel && (
                <span className="ml-2 font-sans text-xs text-ln-mute ">· {tattooLocLabel}</span>
              )}
            </p>
            {tattooDescription && (
              <p className="mt-1 text-xs italic text-ln-ink-2 ">{tattooDescription}</p>
            )}
            {tattooPhotoUrl && (
              <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl">
                <Image
                  src={tattooPhotoUrl}
                  alt={`Tatuaje de ${petName}`}
                  fill
                  sizes="(max-width: 480px) 100vw, 480px"
                  className="object-cover"
                />
              </div>
            )}
            <p className="mt-2 text-[11px] text-ln-mute ">
              Compará el código y la foto con el animal que tenés en frente antes de confirmar la
              coincidencia.
            </p>
          </section>
        )}

        {/* Lost description — accessories, behaviour, last-seen context.
            Animal identity details per spec §8.4 — not gated by disclosure prefs. */}
        {lostDescription &&
          (lostDescription.accessoriesWhenLost ||
            lostDescription.behaviorNotes ||
            lostDescription.lastSeenContext) && (
            <section className="rounded-2xl bg-ln-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
                Detalles cuando se perdió
              </p>
              {lostDescription.accessoriesWhenLost && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
                    Accesorios
                  </p>
                  <p className="mt-0.5 text-sm text-ln-ink">
                    {lostDescription.accessoriesWhenLost}
                  </p>
                </div>
              )}
              {lostDescription.behaviorNotes && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
                    Comportamiento
                  </p>
                  <p className="mt-0.5 text-sm text-ln-ink">{lostDescription.behaviorNotes}</p>
                </div>
              )}
              {lostDescription.lastSeenContext && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
                    Contexto
                  </p>
                  <p className="mt-0.5 text-sm text-ln-ink">{lostDescription.lastSeenContext}</p>
                </div>
              )}
            </section>
          )}

        <p className="text-center text-[11px] text-ln-mute ">
          Esta credencial pertenece a {BRANDING.appName} — {BRANDING.appNameLong}.
        </p>
      </div>
    </div>
  );
}

function formatLostSince(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
