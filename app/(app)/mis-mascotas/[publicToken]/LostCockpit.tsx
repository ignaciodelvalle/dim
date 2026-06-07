// LostCockpit — server component rendered when pet.status === 'lost'.
//
// Composes the five lost-mode cards from components/pet-profile/ into a
// single layout. Called via an early-return branch in PetDetailPage; the
// heavy queries that power the normal owner view are skipped.

import { setPetDisclosurePrefsAction } from "@/app/actions/lost-mode";
import {
  type DisclosurePrefs,
  LostDisclosureCard,
} from "@/components/pet-profile/LostDisclosureCard";
import { LostLastSeenCard } from "@/components/pet-profile/LostLastSeenCard";
import { LostModeBanner } from "@/components/pet-profile/LostModeBanner";
import { LostScanFeed, type ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { LostShareCard } from "@/components/pet-profile/LostShareCard";
import { type PetHeroPet, PetProfileHero } from "@/components/pet-profile/PetProfileHero";
import type { LostEpisode } from "@/lib/lost-mode";
import { setPetFoundAction } from "@/src/modules/events/actions";
import Link from "next/link";

type Props = {
  pet: {
    id: string;
    name: string;
    publicToken: string;
    // Disclosure prefs — live source of truth on the pets row.
    discloseFirstNameWhenLost: boolean;
    disclosePhoneWhenLost: boolean;
    discloseEmailWhenLost: boolean;
    discloseLastLocationWhenLost: boolean;
    allowFinderFormWhenLost: boolean;
  };
  /** Adapted hero data — same shape as the normal page builds. */
  petHeroProps: PetHeroPet;
  /** Photo URL passed separately so the banner can render its own avatar. */
  photoUrl: string | null;
  /** Open lost_pet_episode case, or null for legacy rows without a case. */
  episode: LostEpisode | null;
  /** Recent non-self QR scans since the episode opened. */
  scans: ScanFeedItem[];
  /** Owner's display name — used by LostDisclosureCard preview text. */
  ownerFirstName: string;
};

export async function LostCockpit({
  pet,
  petHeroProps,
  photoUrl,
  episode,
  scans,
  ownerFirstName,
}: Props) {
  // Bind server actions to this pet.
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
  const shareText = `🚨 ${pet.name} está perdid${pet.name.toLowerCase().endsWith("a") ? "a" : "o"}. Si la ves, por favor escanea su QR o contactanos.`;
  const posterHref = `/mis-mascotas/${pet.publicToken}/cartel`;
  const publicHref = `/p/${pet.publicToken}`;
  const editLastSeenHref = `/mis-mascotas/${pet.publicToken}/perdida`;
  const caseHref = episode ? `/casos/${episode.publicCode}` : `/mis-mascotas/${pet.publicToken}`;

  return (
    <main className="min-h-screen bg-white p-5 ">
      <div className="mx-auto max-w-2xl space-y-4 pb-12">
        {/* Back link */}
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Mis mascotas
        </Link>

        {/* (1) Lost mode banner — most prominent element */}
        {episode ? (
          <LostModeBanner
            petName={pet.name}
            petPhotoUrl={photoUrl}
            lostSince={episode.openedAt}
            casePublicCode={episode.publicCode}
            jurisdictionLabel={episode.jurisdictionLocality ?? "—"}
            markFoundAction={markFoundAction}
          />
        ) : (
          // Legacy row without a case — still show a minimal banner.
          <section role="alert" className="rounded-2xl bg-gob-danger p-4 text-white">
            <p className="font-semibold">{pet.name} está perdida</p>
          </section>
        )}

        {/* (2) Hero — identity, state ring set to urgent */}
        <PetProfileHero pet={petHeroProps} />

        {/* (3) Share alert */}
        <LostShareCard publicUrl={publicUrl} shareText={shareText} posterHref={posterHref} />

        {/* (4) Last-seen location */}
        {episode && (
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
        )}

        {/* (5) Unified activity feed — QR scans + sightings */}
        <LostScanFeed
          items={scans}
          totalScans={scans.filter((s) => s.kind === "scan").length}
          totalSightings={episode?.sightingsCount ?? 0}
          caseHref={caseHref}
        />

        {/* (6) Disclosure prefs — what finders see on the public credential */}
        <LostDisclosureCard
          prefs={prefs}
          toggleAction={toggleAction}
          publicHref={publicHref}
          ownerFirstName={ownerFirstName}
        />
      </div>
    </main>
  );
}
