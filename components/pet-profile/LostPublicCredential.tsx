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

import { tattooLocationLabel } from "@/lib/lookups";
import Link from "next/link";

interface Props {
  petName: string;
  petPhotoUrl: string | null;
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
}

export function LostPublicCredential({
  petName,
  petPhotoUrl,
  identityLine,
  ownerFirstName,
  ownerPhoneE164,
  lastSeenPlaceName,
  lastSeenLocality,
  distinguishingFeatures,
  finderFormHref,
  lostSince,
  tattooCode = null,
  tattooLocation = null,
  tattooDescription = null,
  tattooPhotoUrl = null,
}: Props) {
  const tattooLocLabel = tattooLocationLabel(tattooLocation);
  return (
    <main className="min-h-screen bg-red-50 px-4 py-6 dark:bg-red-950/30">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl bg-red-700 px-4 py-3 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-90">
            Mascota perdida
          </p>
          <p className="mt-0.5 text-xs opacity-90">desde {formatLostSince(lostSince)}</p>
        </div>

        <section className="rounded-2xl bg-white p-5 text-center shadow-sm dark:bg-neutral-900">
          <div className="mx-auto inline-block">
            <span className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-amber-100 ring-[5px] ring-red-600">
              {petPhotoUrl ? (
                <img src={petPhotoUrl} alt={petName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl font-bold text-amber-700">
                  {petName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-red-800 dark:text-red-200">
            ¡Hola! Soy {petName} — Estoy perdida
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{identityLine}</p>
          {distinguishingFeatures && (
            <p className="mt-2 text-sm italic text-neutral-700 dark:text-neutral-300">
              "{distinguishingFeatures}"
            </p>
          )}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ownerPhoneE164 && (
              <a
                href={`tel:${ownerPhoneE164}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                📞 Llamar{ownerFirstName ? ` a ${ownerFirstName}` : ""}
              </a>
            )}
            {finderFormHref && (
              <Link
                href={finderFormHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gob-primary px-5 text-sm font-semibold text-white hover:bg-gob-primary-hover"
              >
                📍 La encontré
              </Link>
            )}
          </div>

          {!ownerPhoneE164 && !finderFormHref && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Esta mascota no tiene canales de contacto habilitados.
            </p>
          )}
        </section>

        {(lastSeenPlaceName || lastSeenLocality) && (
          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Última vez vista
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {[lastSeenPlaceName, lastSeenLocality].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-blue-100 text-3xl dark:from-emerald-950/30 dark:to-blue-950/30">
              📍
            </div>
          </section>
        )}

        {tattooCode && (
          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Tatuaje
            </p>
            <p className="mt-1 font-mono text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {tattooCode}
              {tattooLocLabel && (
                <span className="ml-2 font-sans text-xs text-neutral-500 dark:text-neutral-400">
                  · {tattooLocLabel}
                </span>
              )}
            </p>
            {tattooDescription && (
              <p className="mt-1 text-xs italic text-neutral-600 dark:text-neutral-400">
                {tattooDescription}
              </p>
            )}
            {tattooPhotoUrl && (
              <img
                src={tattooPhotoUrl}
                alt={`Tatuaje de ${petName}`}
                className="mt-3 w-full rounded-xl object-cover"
              />
            )}
            <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              Compará el código y la foto con el animal que tenés en frente antes de confirmar la
              coincidencia.
            </p>
          </section>
        )}

        <p className="text-center text-[11px] text-neutral-500 dark:text-neutral-400">
          Esta credencial pertenece a MiMAR — Mi Mascota Argentina.
        </p>
      </div>
    </main>
  );
}

function formatLostSince(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
