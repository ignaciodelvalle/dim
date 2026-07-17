// PublicLostSections — the lost-mode BODY of the public credential
// (pet-state-header R3.1/R3.4). The full-page LostPublicCredential takeover is
// retired: a lost pet renders the SAME structural card as an active pet, with
// the masthead in the lost treatment (page.tsx stamps `data-situation`) and
// these sections between the name bar and the identity grid.
//
// What strangers need in five seconds:
//   1) The pet is lost. (masthead chip + the urgent strip here, with recency)
//   2) The owner is real. (first name if disclosed)
//   3) How to help fast. (call / email / finder form / sighting)
//   4) Where it was last seen. (one map preview if disclosed)
//
// All props are server-resolved AFTER applying the disclosure prefs on
// `pets`. The component itself never decides what to show — the page
// passes only what's actually disclosable.

import { Icon } from "@/components/Icon";
import { tattooLocationLabel } from "@/lib/reference/lookups";
import {
  foundPossessivePhrase,
  lostBannerHeadline,
  lostFirstPersonLine,
  normalizePhoneForTel,
  sightingPhrase,
} from "@/lib/utils/format";
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
  /** Pet sex ('male' | 'female' | 'unknown') — genders the lost-mode copy. */
  petSex: string | null;
  /** "Canino · marrón · collar rojo" — short identifying line. */
  identityLine: string;
  /** Owner first name, or null if hidden by prefs. */
  ownerFirstName: string | null;
  /** E.164 phone for tel:, or null if hidden by prefs. */
  ownerPhoneE164: string | null;
  /** Owner email for mailto:, or null if hidden by prefs (R3.4.12 gap fix —
   * discloseEmailWhenLost previously fetched the email but never rendered it). */
  ownerEmail?: string | null;
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
  /** Permanent conditions (e.g. blind, deaf) disclosed for the LOST credential —
   * welfare-safety info a finder needs. Server-resolved: null unless the owner
   * opted into `discloseConditionsPublicly` AND the pet has at least one
   * condition. See lib/reference/permanent-conditions.ts `resolveLostSpecialConditions`. */
  specialConditions?: { labels: string[]; other: string | null } | null;
}

export function PublicLostSections({
  petName,
  petSex,
  identityLine,
  ownerFirstName,
  ownerPhoneE164,
  ownerEmail = null,
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
  specialConditions = null,
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
    <div data-section="lost-sections">
      {/* Urgent strip — the state + recency (first body strip; the masthead
          chip above already carries role="alert", so this strip stays a plain
          visual reinforcement rather than a second SR announcement). */}
      <div
        data-section="lost-urgent-strip"
        className="border-t border-ln-err-100 bg-ln-err-050 px-4 py-3"
      >
        <p className="m-0 flex items-center gap-1.5 text-sm font-bold tracking-wide text-ln-err">
          <Icon name="alert-triangle" size="sm" decorative />
          {lostBannerHeadline(petSex)}
          <span className="font-medium opacity-80">· {formatLostSince(lostSince)}</span>
        </p>
        {/* First-person headline + identity line (R3.4.10). */}
        <p className="mt-1.5 text-md font-semibold text-ln-ink">
          ¡Hola! Soy {petName} — {lostFirstPersonLine(petSex)}
        </p>
        <p className="mt-0.5 text-sm text-ln-ink-2">{identityLine}</p>
        {distinguishingFeatures && (
          <p className="mt-1 text-sm italic text-ln-ink-2">"{distinguishingFeatures}"</p>
        )}

        {/* CTA row — every enabled contact channel, right under the name bar. */}
        <div data-section="lost-cta-row" className="mt-3 flex flex-wrap gap-2">
          {ownerPhoneE164 && (
            <a
              href={`tel:${normalizePhoneForTel(ownerPhoneE164) ?? ownerPhoneE164}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-ok px-5 text-sm font-semibold text-white hover:bg-ln-ok/90"
            >
              <Icon name="telefono" size="sm" decorative /> Llamar
              {ownerFirstName ? ` a ${ownerFirstName}` : ""}
            </a>
          )}
          {ownerEmail && (
            <a
              href={`mailto:${ownerEmail}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-card border border-ln-line px-5 text-sm font-semibold text-ln-ink hover:bg-ln-stripe"
            >
              <Icon name="mail" size="sm" decorative /> Escribir por email
            </a>
          )}
          {finderFormHref && (
            <Link
              href={finderFormHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-azul px-5 text-sm font-semibold text-white hover:bg-ln-azul-700"
            >
              <Icon name="ubicacion" size="sm" decorative /> {foundPossessivePhrase(petSex)}
            </Link>
          )}
          {sightingFormHref && (
            <Link
              href={sightingFormHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ln-card border border-ln-line px-5 text-sm font-semibold text-ln-ink hover:bg-ln-stripe"
            >
              <Icon name="ojo" size="sm" decorative /> {sightingPhrase(petSex)}
            </Link>
          )}
        </div>

        {/* Honest warning — email included in the check: telling a finder there
            are "no contact channels" next to a working mailto would lie. */}
        {!ownerPhoneE164 && !finderFormHref && !ownerEmail && (
          <p className="mt-3 rounded-lg bg-[var(--color-ln-warn-050)] px-3 py-2 text-xs text-ln-warn">
            Esta mascota no tiene canales de contacto habilitados.
          </p>
        )}
      </div>

      {/* Special-conditions disclosure (welfare safety) — a finder handling a
          blind, deaf, or medicated pet needs to know before they act. Only
          rendered when the owner opted in (discloseConditionsPublicly) AND
          there's at least one disclosable condition. Placed right after the
          identity/CTA strip so it's one of the first things a finder sees. */}
      {specialConditions && (specialConditions.labels.length > 0 || specialConditions.other) && (
        <section
          role="note"
          aria-label="Necesita cuidados especiales"
          data-section="special-conditions"
          className="border-t border-l-4 border-t-ln-line-2 border-l-ln-warn bg-[var(--color-ln-warn-050)] px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-ln-warn">
            <Icon name="alert-triangle" size="sm" decorative />
            Necesita cuidados especiales
          </p>
          {specialConditions.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {specialConditions.labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex rounded-full bg-ln-warn px-3 py-1 text-xs font-semibold text-white"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          {specialConditions.other && (
            <p className="mt-2 text-sm text-ln-ink-2">{specialConditions.other}</p>
          )}
        </section>
      )}

      {!(lastSeenPlaceName || lastSeenLocality || hasLastSeenCoords) ? (
        // Honest empty-state: on a lost pet's public credential an absent
        // sighting location is decision-relevant — say so instead of hiding
        // the whole section (consistency with the /perdidas board).
        <section className="border-t border-ln-line-2 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
            Última vez vista
          </p>
          <p className="mt-1 text-sm italic text-ln-mute">Sin ubicación de avistaje registrada</p>
        </section>
      ) : (
        <section className="border-t border-ln-line-2 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
            Última vez vista
          </p>
          {(lastSeenPlaceName || lastSeenLocality) && (
            <p className="mt-1 text-sm font-medium text-ln-ink">
              {[lastSeenPlaceName, lastSeenLocality].filter(Boolean).join(" · ")}
            </p>
          )}
          {hasLastSeenCoords ? (
            <div className="mt-3 h-40 w-full overflow-hidden rounded-xl border border-ln-line">
              <LocationMap lat={lastSeenLat as number} lng={lastSeenLng as number} />
            </div>
          ) : (
            <div className="mt-3 flex h-32 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-[var(--color-ln-ok-050)] to-ln-celeste/10 text-[var(--color-ln-mute)]">
              <Icon name="ubicacion" size={28} decorative />
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
              className="mt-3 inline-block text-xs font-medium text-ln-ok underline underline-offset-2 hover:text-ln-ok/80"
            >
              Abrir en Google Maps ↗
            </a>
          )}
        </section>
      )}

      {tattooCode && (
        <section className="border-t border-ln-line-2 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">Tatuaje</p>
          <p className="mt-1 font-mono text-sm font-medium text-ln-ink">
            {tattooCode}
            {tattooLocLabel && (
              <span className="ml-2 font-sans text-xs text-ln-mute">· {tattooLocLabel}</span>
            )}
          </p>
          {tattooDescription && (
            <p className="mt-1 text-xs italic text-ln-ink-2">{tattooDescription}</p>
          )}
          {tattooPhotoUrl && (
            /* `relative` is load-bearing: <Image fill> renders position:absolute,
               so without a positioned ancestor its containing block is the
               VIEWPORT — a full-bleed photo painted on top of every finder CTA
               and swallowed all taps (QA round 2, finding #0).
               pointer-events-none is defense-in-depth: the photo is decorative
               and must never intercept a click. */
            <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl">
              <Image
                src={tattooPhotoUrl}
                alt={`Tatuaje de ${petName}`}
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="pointer-events-none object-cover"
              />
            </div>
          )}
          <p className="mt-2 text-xs text-ln-mute">
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
          <section className="border-t border-ln-line-2 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
              Detalles cuando se perdió
            </p>
            {lostDescription.accessoriesWhenLost && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ln-mute">
                  Accesorios
                </p>
                <p className="mt-0.5 text-sm text-ln-ink">{lostDescription.accessoriesWhenLost}</p>
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
    </div>
  );
}

// `now` is a parameter (default = call time) so the label is a pure function
// of (d, now) and unit-testable for determinism. This renders inside a Server
// Component today (single server evaluation, no hydration re-run), but keeping
// it pure guards the relative-`now` class against a future SSR-eager refactor.
export function formatLostSince(d: Date, now: number = Date.now()): string {
  const ms = now - d.getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
