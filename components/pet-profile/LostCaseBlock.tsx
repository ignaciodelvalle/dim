// LostCaseBlock — the lost-pet case surface relocated INTO the normal pet
// profile (pet-document-redesign S2, design ADR-6/ADR-7). Replaces the old
// full-screen LostCockpit early-return: renders as the urgent (top) item of
// PetAlertStrip when an open lost_pet_episode exists, absorbing all 9
// capabilities from spec REQ-5.2 while the rest of the profile (Credencial,
// Libreta, action row, Anotar sheet) stays reachable at the same time
// (cap 8 — enforced simply by NOT early-returning; see page.tsx).
//
// All 9 capabilities:
//   1. Urgent-treatment header — publicCode + /casos/[publicCode] link +
//      public /p/{token} link.
//   2. Marcar encontrada — owner-only, via MarkFoundButton.
//   3. Last-seen card + update — owner: LostLastSeenCard with "actualizar"
//      (→ /perdida → MarkLostWizard); org: plain read-only summary, no edit
//      affordance (LostLastSeenCard always renders an edit link, so org gets
//      a simpler custom summary instead of that component — the component
//      itself stays byte-for-byte unchanged per design).
//   4. Scans/sightings/finder feed — LostScanFeed, visible to both roles.
//   5. 5 disclosure toggles + public preview — LostDisclosureCard, owner-only.
//   6. Share + poster — LostShareCard + /cartel link, owner-only.
//   7. MarkLostWizard capture (update) — reachable via cap 3's "actualizar"
//      link; unchanged wizard.
//   8. Rest of profile usable simultaneously — satisfied structurally (no
//      early return anywhere in the tree that renders this block).
//   9. Single rendering path — lost_pet_episode is excluded from the generic
//      PetOpenCasesSection query (REQ-1.4 / ADR-8, lib/infra/case-queries.ts).
//
// Org viewers (REQ-5.3): informational only — header (no Marcar encontrada),
// last-seen summary (no edit), scans/sightings feed. No toggles, no share/
// poster, no MarkLostWizard entry point.
//
// DEVIATION from design.md's file-map ("(client)"): this is a plain Server
// Component, not "use client". LostDisclosureCard's toggle rows are inline
// `<form action={async () => { "use server"; ... }}>` closures — Next.js
// forbids declaring an inline server action inside a Client Component's
// subtree (it must be a Server Component, or the action must be pre-bound
// and passed down as a prop). LostScanFeed also transitively imports
// lib/infra/lost-mode → @/db, which is guarded by `import "server-only"`
// and errors if pulled into a client bundle. Both failures showed up at
// `pnpm build` time. A Server Component here matches how the original
// LostCockpit was architected (async RSC composing "use client"
// subcomponents is fine; the reverse — a client component importing a
// server-action-bearing child — is not). No behavior change: this
// component still never uses hooks/state, so dropping "use client" costs
// nothing.

import Image from "next/image";
import Link from "next/link";

import { setPetDisclosurePrefsAction } from "@/app/actions/lost-mode";
import { reactivateLostSearchAction } from "@/app/actions/reactivate-lost-search";
import {
  type DisclosurePrefs,
  LostDisclosureCard,
} from "@/components/pet-profile/LostDisclosureCard";
import { LostLastSeenCard } from "@/components/pet-profile/LostLastSeenCard";
import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { LostShareCard } from "@/components/pet-profile/LostShareCard";
import { MarkFoundButton } from "@/components/pet-profile/MarkFoundButton";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type { LostEpisode } from "@/lib/infra/lost-mode";
import { foundParticiple, lostThirdPersonPhrase } from "@/lib/utils/format";
import { setPetFoundAction } from "@/src/modules/events/actions";

export type LostCaseBlockPet = {
  id: string;
  name: string;
  publicToken: string;
  sex: string | null;
  discloseFirstNameWhenLost: boolean;
  disclosePhoneWhenLost: boolean;
  discloseEmailWhenLost: boolean;
  discloseLastLocationWhenLost: boolean;
  allowFinderFormWhenLost: boolean;
};

type Props = {
  pet: LostCaseBlockPet;
  photoUrl: string | null;
  episode: LostEpisode | null;
  scans: ScanFeedItem[];
  ownerFirstName: string;
  /** Owner-gate — org/vet viewers get the read-only variant (REQ-5.3). */
  isOwner: boolean;
};

export function LostCaseBlock({ pet, photoUrl, episode, scans, ownerFirstName, isOwner }: Props) {
  // No open episode while status is still 'lost' — the auto-close cron
  // (ADR-18) never resets pets.status, so this is the STALE state, not the
  // absence of a lost pet. The caller (page.tsx) only mounts this block when
  // `pet.status === 'lost'`, so a null episode here unambiguously means the
  // episode auto-closed for inactivity and the search needs a decision.
  if (!episode) {
    return (
      <StaleLostCaseBanner petPublicToken={pet.publicToken} petSex={pet.sex} isOwner={isOwner} />
    );
  }

  const markFoundAction = setPetFoundAction.bind(null, pet.publicToken);
  const toggleAction = setPetDisclosurePrefsAction.bind(null, pet.publicToken);

  const prefs: DisclosurePrefs = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.ar"}/p/${pet.publicToken}`;
  const shareText = `🚨 ${pet.name} ${lostThirdPersonPhrase(pet.sex)}. Si la ves, por favor escanea su QR o contactanos.`;
  const posterHref = `/mis-mascotas/${pet.publicToken}/cartel`;
  const publicHref = `/p/${pet.publicToken}`;
  const editLastSeenHref = `/mis-mascotas/${pet.publicToken}/perdida`;
  const caseHref = `/casos/${episode.publicCode}`;

  const sightingsCount = episode.sightingsCount;
  const scanCount = scans.filter((s) => s.kind === "scan").length;

  return (
    <div
      data-section="lost-case-block"
      className="overflow-hidden rounded-md border border-[var(--color-ln-line-strong)]"
    >
      {/* Urgent header — capability 1 + 2 */}
      <div
        className="relative overflow-hidden px-4 py-3.5"
        style={{
          background: "linear-gradient(135deg, var(--color-ln-seal), var(--color-ln-err))",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(0,0,0,.14) 0 14px, transparent 14px 28px)",
          }}
        />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-white/20">
            {photoUrl ? (
              <Image src={photoUrl} alt={pet.name} fill sizes="40px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-[var(--font-ln-serif)] text-[var(--text-lg)] font-bold text-white">
                {pet.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="m-0 font-[var(--font-ln-serif)] text-[var(--text-lg)] font-semibold leading-tight text-white">
              {pet.name} {lostThirdPersonPhrase(pet.sex)}
            </p>
            <p className="mt-0.5 text-[var(--text-sm)] text-white/85">
              <Link href={caseHref} className="text-white no-underline hover:underline">
                {episode.publicCode}
              </Link>
              {" · "}
              <Link href={publicHref} className="text-white no-underline hover:underline">
                Credencial pública
              </Link>
              {scanCount > 0 && ` · ${scanCount} escaneos`}
              {sightingsCount > 0 && ` · ${sightingsCount} avistamientos`}
            </p>
          </div>

          {isOwner && (
            <MarkFoundButton
              action={markFoundAction}
              label={`Marcar ${foundParticiple(pet.sex)}`}
            />
          )}
        </div>
      </div>

      {/* Body — owner gets the full grid; org gets an informational-only read. */}
      <div className="grid gap-4 p-4 lg:grid-cols-2" style={{ background: "var(--color-ln-card)" }}>
        {/* Última vez visto — capability 3 (+7 via editLastSeenHref) */}
        {isOwner ? (
          <LnCard>
            <LnCardHead
              title="Última vez visto"
              label={
                <Link
                  href={editLastSeenHref}
                  className="text-[var(--color-ln-azul)] no-underline hover:underline"
                >
                  actualizar
                </Link>
              }
            />
            <LostLastSeenCard
              placeName={episode.placeName ?? "Ubicación no especificada"}
              localityLabel={episode.jurisdictionLocality ?? "—"}
              at={episode.openedAt}
              note={episode.ownerNote}
              editHref={editLastSeenHref}
              publicUrl={publicUrl}
              sightingsCount={episode.sightingsCount}
              lastSeenLat={episode.lastSeenLat}
              lastSeenLng={episode.lastSeenLng}
            />
          </LnCard>
        ) : (
          <LnCard>
            <LnCardHead title="Última vez visto" />
            <LnCardBody>
              <p className="text-[var(--text-md)]" style={{ color: "var(--color-ln-ink-2)" }}>
                <span className="font-semibold">
                  {episode.placeName ?? "Ubicación no especificada"}
                </span>
                <span style={{ color: "var(--color-ln-mute)" }}>
                  {" "}
                  · {episode.jurisdictionLocality ?? "—"} ·{" "}
                  {episode.openedAt.toLocaleDateString("es-AR")}
                </span>
              </p>
              {episode.ownerNote && (
                <p
                  className="mt-1.5 text-[var(--text-md)] italic"
                  style={{ color: "var(--color-ln-mute)" }}
                >
                  "{episode.ownerNote}"
                </p>
              )}
            </LnCardBody>
          </LnCard>
        )}

        {/* Avistamientos y escaneos — capability 4, visible to both roles */}
        <LnCard>
          <LnCardHead
            title="Avistamientos y escaneos"
            label={
              <span style={{ color: "var(--color-ln-seal)" }}>
                {sightingsCount + scanCount} total
              </span>
            }
          />
          <LnCardBody>
            <LostScanFeed
              items={scans}
              totalScans={scanCount}
              totalSightings={sightingsCount}
              caseHref={caseHref}
            />
          </LnCardBody>
        </LnCard>

        {/* Owner-only: share/poster (capability 6) + disclosure toggles (capability 5) */}
        {isOwner && (
          <>
            <LnCard>
              <LnCardHead title="Compartir credencial" />
              <LnCardBody>
                <LostShareCard
                  publicUrl={publicUrl}
                  shareText={shareText}
                  posterHref={posterHref}
                />
              </LnCardBody>
            </LnCard>

            <LnCard>
              <LnCardHead title="Datos visibles" />
              <LnCardBody>
                <LostDisclosureCard
                  prefs={prefs}
                  toggleAction={toggleAction}
                  publicHref={publicHref}
                  ownerFirstName={ownerFirstName}
                />
              </LnCardBody>
            </LnCard>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaleLostCaseBanner — the case auto-closed for inactivity (ADR-18) but
// pets.status is still 'lost'. Two CTAs for the owner: reopen a fresh
// episode, or confirm the pet was found. Org viewers get an informational
// read-only banner (same parity model as the main block).
// ---------------------------------------------------------------------------

function StaleLostCaseBanner({
  petPublicToken,
  petSex,
  isOwner,
}: {
  petPublicToken: string;
  petSex: string | null;
  isOwner: boolean;
}) {
  const reactivateAction = reactivateLostSearchAction.bind(null, petPublicToken);
  const markFoundAction = setPetFoundAction.bind(null, petPublicToken);

  return (
    <div
      data-section="lost-case-block"
      data-lost-case-variant="stale"
      className="overflow-hidden rounded-md border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3.5"
    >
      <p className="m-0 font-[var(--font-ln-serif)] text-[var(--text-md)] font-semibold text-[var(--color-ln-warn)]">
        Búsqueda cerrada por inactividad
      </p>
      <p className="mt-1 text-[var(--text-sm)] text-[var(--color-ln-warn)]">
        No hubo actividad en más de un año, así que el caso se cerró automáticamente. La mascota
        sigue marcada como perdida.
      </p>
      {isOwner && (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={reactivateAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full border-[3px] border-[var(--color-ln-warn-100)] bg-[var(--color-ln-card)] px-4 text-[var(--text-sm)] font-semibold text-[var(--color-ln-warn)] transition-colors hover:bg-white"
            >
              Reactivar búsqueda
            </button>
          </form>
          <form action={markFoundAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ln-ok px-4 text-[var(--text-sm)] font-semibold text-white transition-colors hover:opacity-90"
            >
              Apareció · marcar {foundParticiple(petSex)}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
