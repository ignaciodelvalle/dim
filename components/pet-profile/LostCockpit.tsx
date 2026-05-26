// LostCockpit — owner-side cockpit when pet.status === 'lost'.
//
// Replaces the regular profile sections (libreta, achievements, reminders
// etc.) with four focused cards: the lost-mode banner, the last-seen
// location card, the disclosure toggles, and the scan/finder feed.
//
// LostShareCard is intentionally NOT wired in this iteration; it stays
// available in components/pet-profile/ for a later round.
//
// Per page.tsx TODO(K) (2026-05-26): fold this into the conditional branch
// at the top of PetDetailPage when pet.status === 'lost'.

import { setPetFoundAction } from "@/app/actions/events";
import {
  type DisclosurePrefKey,
  togglePetDisclosurePrefAction,
} from "@/app/actions/lost-disclosure";
import type { LostFinderNotification, LostScanRow } from "@/lib/lost-cockpit";
import { LostDisclosureCard } from "./LostDisclosureCard";
import { LostLastSeenCard } from "./LostLastSeenCard";
import { LostModeBanner } from "./LostModeBanner";
import { LostScanFeed, type ScanFeedItem } from "./LostScanFeed";

interface Props {
  publicToken: string;
  petName: string;
  petPhotoUrl: string | null;
  ownerFirstName: string;
  // Lost case + last-seen snapshot
  caseId: string;
  casePublicCode: string;
  lostSince: Date;
  jurisdictionLabel: string;
  lastSeenPlaceName: string;
  lastSeenLocalityLabel: string;
  lastSeenNote: string | null;
  // Disclosure flags (current values from the pets row)
  prefs: Record<DisclosurePrefKey, boolean>;
  // Feed data
  scans: LostScanRow[];
  finders: LostFinderNotification[];
}

export function LostCockpit({
  publicToken,
  petName,
  petPhotoUrl,
  ownerFirstName,
  caseId: _caseId,
  casePublicCode,
  lostSince,
  jurisdictionLabel,
  lastSeenPlaceName,
  lastSeenLocalityLabel,
  lastSeenNote,
  prefs,
  scans,
  finders,
}: Props) {
  const markFoundAction = async (): Promise<void> => {
    "use server";
    await setPetFoundAction(publicToken);
  };

  const toggleAction = async (key: DisclosurePrefKey, next: boolean): Promise<void> => {
    "use server";
    await togglePetDisclosurePrefAction(publicToken, key, next);
  };

  // Merge scans + finder messages into a single time-sorted feed. v1 does
  // no burst grouping — each scan becomes its own row.
  const feedItems: ScanFeedItem[] = [
    ...scans.map(
      (s): ScanFeedItem => ({
        kind: "scan",
        id: s.id,
        at: s.occurredAt instanceof Date ? s.occurredAt : new Date(s.occurredAt),
        count: 1,
        localityLabel: null,
      }),
    ),
    ...finders.map(
      (f): ScanFeedItem => ({
        kind: "finder",
        id: f.id,
        at: f.createdAt instanceof Date ? f.createdAt : new Date(f.createdAt),
        finderName: extractFinderName(f.body ?? ""),
        snippet: f.body ?? "",
        href: `/mis-mascotas/${publicToken}`,
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const editHref = `/mis-mascotas/${publicToken}/perdida`;

  return (
    <div className="space-y-4">
      <LostModeBanner
        petName={petName}
        petPhotoUrl={petPhotoUrl}
        lostSince={lostSince}
        casePublicCode={casePublicCode}
        jurisdictionLabel={jurisdictionLabel}
        markFoundAction={markFoundAction}
      />

      <LostLastSeenCard
        placeName={lastSeenPlaceName}
        localityLabel={lastSeenLocalityLabel}
        at={lostSince}
        note={lastSeenNote}
        editHref={editHref}
        addSightingHref={editHref}
        sightingsCount={0}
      />

      <LostDisclosureCard
        prefs={prefs}
        toggleAction={toggleAction}
        publicHref={`/p/${publicToken}`}
        ownerFirstName={ownerFirstName}
      />

      <LostScanFeed
        items={feedItems}
        totalScans={scans.length}
        totalFinderMessages={finders.length}
        caseHref={`/casos/${casePublicCode}`}
      />
    </div>
  );
}

// Notification bodies look like `${name} dejó un mensaje: "${msg}". Te podés
// contactar al ${contact}.` — pluck the leading name token for display.
function extractFinderName(body: string): string {
  const trimmed = body.trim();
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace <= 0) return "Anónimo";
  return trimmed.slice(0, firstSpace);
}
