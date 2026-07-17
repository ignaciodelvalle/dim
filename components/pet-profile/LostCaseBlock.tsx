// LostCaseBlock — the lost-pet case surface relocated INTO the normal pet
// profile (pet-document-redesign S2, design ADR-6/ADR-7). Replaces the old
// full-screen LostCockpit early-return: renders as the urgent (top) item of
// PetAlertStrip when an open lost_pet_episode exists, absorbing all 9
// capabilities from spec REQ-5.2 while the rest of the profile (Credencial,
// Libreta, action row, Anotar sheet) stays reachable at the same time
// (cap 8 — enforced simply by NOT early-returning; see page.tsx).
//
// Lean pass (task #43, 2026-07-04, Cursor audit #735): the owner body was a
// 5-section/9-capability grid with share buried in a 4-up button row and
// double card chrome (LnCardHead title + the child's own <section> heading).
// Now: a SHARE-FIRST strip (WhatsApp hero CTA, one-line last-seen summary)
// with everything else — the 5 disclosure toggles, the full last-seen card
// (map), the scan/sightings feed — behind a native "Más opciones" <details>.
// Native details/summary (not a client Sheet) because this stays a plain
// Server Component (see DEVIATION note below) — no client state needed to
// disclose it, and prefers-reduced-motion is handled globally already
// (app/globals.css collapses all transition-duration to 0.01ms).
//
// All 9 capabilities (unchanged, just regrouped):
//   1. Urgent-treatment header — publicCode + /casos/[publicCode] link +
//      public /p/{token} link.
//   2. Marcar encontrada — owner-only. PO 2026-07-05: surfaced as a PROMINENT
//      primary CTA leading the owner body ("¡Apareció! Marcar como
//      encontrada", ?sheet=marcar-encontrada). This is now the SINGLE found
//      affordance — PetActionRow dropped its found slot for lost pets, so
//      there is no duplication.
//   3. Last-seen + update — owner: a one-line summary (place · locality ·
//      date) with a single "actualizar" link in the primary strip; the full
//      LostLastSeenCard (map, sightings count, its own copy-link) moved
//      into "Más opciones". Org: plain read-only summary, no edit
//      affordance (LostLastSeenCard always renders an edit link, so org gets
//      a simpler custom summary instead of that component — the component
//      itself stays byte-for-byte unchanged per design).
//   4. Scans/sightings/finder feed — LostScanFeed, visible to both roles;
//      owner: inside "Más opciones"; org: always visible (no toggle to hide
//      behind for a role that has no share/toggle content anyway).
//   5. 5 disclosure toggles + public preview — LostDisclosureCard, owner-only,
//      inside "Más opciones".
//   6. Share + poster — LostShareCard (WhatsApp hero + copy-link + Afiche),
//      owner-only, in the primary strip. Rendered directly — no LnCard
//      wrapper — since LostShareCard already renders its own <section>.
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
// Component, not "use client". Originally this was ALSO because
// LostDisclosureCard's toggle rows were inline
// `<form action={async () => { "use server"; ... }}>` closures — Next.js
// forbids declaring an inline server action inside a Client Component's
// subtree (it must be a Server Component, or the action must be pre-bound
// and passed down as a prop). wave-3 D2 moved LostDisclosureCard to
// LnToggleGroup (now "use client" itself, calling the pre-bound
// `toggleAction` prop directly — the "pre-bound and passed as a prop"
// alternative this comment already named) — that reason is gone, but
// LostScanFeed still transitively imports lib/infra/lost-mode → @/db,
// which is guarded by `import "server-only"` and errors if pulled into a
// client bundle. A Server Component here still matches how the original
// LostCockpit was architected (async RSC composing "use client"
// subcomponents is fine). No behavior change: this component still never
// uses hooks/state itself, so staying a Server Component costs nothing.

import Image from "next/image";
import Link from "next/link";

import { setPetDisclosurePrefsAction } from "@/app/actions/lost-mode";
import { reactivateLostSearchAction } from "@/app/actions/reactivate-lost-search";
import { Icon } from "@/components/Icon";
import {
  type DisclosurePrefs,
  LostDisclosureCard,
} from "@/components/pet-profile/LostDisclosureCard";
import { LostLastSeenCard } from "@/components/pet-profile/LostLastSeenCard";
import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { LostShareCard } from "@/components/pet-profile/LostShareCard";
import { MarkFoundInlineForm } from "@/components/pet-profile/MarkFoundInlineForm";
import { SheetTriggerLink } from "@/components/pet-profile/SheetTriggerLink";
import { LnAlert } from "@/components/ui/Alert";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type { LostEpisode } from "@/lib/infra/lost-mode";
import { formatDateShort, foundParticiple, lostThirdPersonPhrase } from "@/lib/utils/format";

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

  const toggleAction = setPetDisclosurePrefsAction.bind(null, pet.publicToken);

  const prefs: DisclosurePrefs = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  // Single source of truth for the public origin (task #43 audit #735: this
  // used to hardcode "https://mimar.ar", diverging from other pages' guesses
  // like "https://www.mimar.gob.ar" — see app/layout.tsx's metadataBase for
  // the same NEXT_PUBLIC_SITE_URL resolution). Localhost fallback is for
  // local dev only; do not invent a production domain here.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const publicUrl = `${siteUrl}/p/${pet.publicToken}`;
  // Disclosure-aware (fixes audit #735: the prior text claimed to honour
  // disclosure prefs but never actually varied on them) — only names the
  // owner when discloseFirstNameWhenLost is on.
  const shareText = pet.discloseFirstNameWhenLost
    ? `${pet.name} ${lostThirdPersonPhrase(pet.sex)}. Lo busca ${ownerFirstName}. Si la ves, escaneá el QR o avisanos.`
    : `${pet.name} ${lostThirdPersonPhrase(pet.sex)}. Si la ves, escaneá el QR o avisanos.`;
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
      {/* Quiet card head — capability 1 + 2. DEMOTED from the seal→err
          gradient banner (pet-state-header R7.2): the credential masthead band
          now owns the perdida red on BOTH faces, so a second full-red header
          in the body duplicated the signal. Same content, tinted-strip
          treatment. Flagged for PO in the demo — reversible one-file change. */}
      <div
        data-section="lost-case-head"
        className="border-b border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] px-4 py-3.5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-ln-err-100)] bg-[var(--color-ln-card)]">
            {photoUrl ? (
              <Image src={photoUrl} alt={pet.name} fill sizes="40px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-[var(--font-ln-serif)] text-[var(--text-lg)] font-bold text-[var(--color-ln-err)]">
                {pet.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="m-0 font-[var(--font-ln-serif)] text-[var(--text-lg)] font-semibold leading-tight text-[var(--color-ln-err)]">
              {pet.name} {lostThirdPersonPhrase(pet.sex)}
            </p>
            <p className="mt-0.5 text-[var(--text-sm)] text-[var(--color-ln-ink-2)]">
              <Link
                href={caseHref}
                className="text-[var(--color-ln-ink-2)] underline-offset-2 hover:underline"
              >
                {episode.publicCode}
              </Link>
              {" · "}
              <Link
                href={publicHref}
                className="text-[var(--color-ln-ink-2)] underline-offset-2 hover:underline"
              >
                Credencial pública
              </Link>
              {scanCount > 0 && ` · ${scanCount} ${scanCount === 1 ? "escaneo" : "escaneos"}`}
              {sightingsCount > 0 &&
                ` · ${sightingsCount} ${sightingsCount === 1 ? "avistamiento" : "avistamientos"}`}
            </p>
          </div>
          {/* "Marcar como encontrada" lives in the owner body below as a
              prominent primary CTA (PO 2026-07-05) — no longer duplicated in
              PetActionRow (which dropped the found slot for lost pets). */}
        </div>
      </div>

      {/* Body — owner gets the lean share-first strip; org gets the
          unchanged informational-only read (REQ-5.3). */}
      {isOwner ? (
        <div className="p-4" style={{ background: "var(--color-ln-card)" }}>
          {/* Prominent happy-path CTA — capability 2 (PO 2026-07-05: the found
              action was "hard to find" as a small icon). A worried owner looks
              here first, so the "Apareció" primary button leads the block
              (opens ?sheet=marcar-encontrada). This is now the ONLY found
              affordance — PetActionRow no longer carries it. */}
          <SheetTriggerLink
            href={`/mis-mascotas/${pet.publicToken}?sheet=marcar-encontrada`}
            className="ln-found-cta mb-4"
          >
            <Icon name="check" size="sm" decorative />
            Apareció — marcar como {foundParticiple(pet.sex)}
          </SheetTriggerLink>

          {/* Share-first hero — capability 6. Rendered directly (no LnCard
              wrapper): LostShareCard already renders its own <section>, so
              wrapping it in LnCardHead too was the double-chrome the lean
              pass targeted (two headings for one card). */}
          <LostShareCard publicUrl={publicUrl} shareText={shareText} posterHref={posterHref} />

          {/* One-line last-seen summary — capability 3. The rich
              LostLastSeenCard (map, its own copy-link, sightings count)
              moved into "Más opciones" below; this keeps the primary strip
              to a single glanceable line + one edit affordance. */}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-ln-line)] pt-3">
            <p
              className="m-0 min-w-0 truncate text-[var(--text-sm)]"
              style={{ color: "var(--color-ln-ink-2)" }}
            >
              <span className="font-semibold">
                {episode.placeName ?? "Ubicación no especificada"}
              </span>
              <span style={{ color: "var(--color-ln-mute)" }}>
                {" "}
                · {episode.jurisdictionLocality ?? "—"} · {formatDateShort(episode.openedAt)}
              </span>
            </p>
            <Link
              href={editLastSeenHref}
              className="flex-shrink-0 text-[var(--text-sm)] font-medium text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              actualizar
            </Link>
          </div>

          {/* "Más opciones" — capabilities 4 (full scan/sightings feed), 5
              (disclosure toggles), and the rich last-seen card (map).
              Native <details>, not a client Sheet: this component stays a
              Server Component (see DEVIATION note above), and a disclosure
              widget needs no client state to open/close. Reduced-motion is
              handled globally (app/globals.css collapses all
              transition-duration to 0.01ms), so the arrow rotation is safe
              as-is. */}
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[var(--text-sm)] font-medium text-[var(--color-ln-azul)]">
              <span
                aria-hidden="true"
                className="inline-block transition-transform group-open:rotate-90"
              >
                ›
              </span>
              Más opciones
            </summary>

            <div className="mt-3 flex flex-col gap-4">
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

              {/* LostDisclosureCard already renders its own <section> —
                  same no-nested-chrome treatment as LostShareCard above. */}
              <LostDisclosureCard
                prefs={prefs}
                toggleAction={toggleAction}
                publicHref={publicHref}
                ownerFirstName={ownerFirstName}
              />
            </div>
          </details>
        </div>
      ) : (
        <div
          className="grid gap-4 p-4 lg:grid-cols-2"
          style={{ background: "var(--color-ln-card)" }}
        >
          <LnCard>
            <LnCardHead title="Última vez visto" />
            <LnCardBody>
              <p className="text-[var(--text-md)]" style={{ color: "var(--color-ln-ink-2)" }}>
                <span className="font-semibold">
                  {episode.placeName ?? "Ubicación no especificada"}
                </span>
                <span style={{ color: "var(--color-ln-mute)" }}>
                  {" "}
                  · {episode.jurisdictionLocality ?? "—"} · {formatDateShort(episode.openedAt)}
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
        </div>
      )}
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

  return (
    <div data-section="lost-case-block" data-lost-case-variant="stale">
      <LnAlert variant="warning" title="Búsqueda cerrada por inactividad">
        <p className="m-0">
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
            <MarkFoundInlineForm
              petPublicToken={petPublicToken}
              label={`Apareció · marcar ${foundParticiple(petSex)}`}
            />
          </div>
        )}
      </LnAlert>
    </div>
  );
}
