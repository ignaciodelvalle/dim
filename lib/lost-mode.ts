// Query helpers for the lost-mode cockpit (pet.status === 'lost').
//
// Two pure server queries, each shaped to match the exact prop contracts
// of the cockpit components in components/pet-profile/.

import type { ScanFeedItem } from "@/components/pet-profile/LostScanFeed";
import { cases, db, petEvents } from "@/db";
import { and, desc, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LostEpisode = {
  /** DB primary key. */
  id: string;
  /** Human-readable case code, e.g. "LOS-00042". */
  publicCode: string;
  /** When the case was opened — used as lostSince. */
  openedAt: Date;
  /** Municipality / locality label for display. */
  jurisdictionLocality: string | null;
  /**
   * Best-effort place name from the status_changed event payload
   * (location_description field). Used by LostLastSeenCard.
   */
  placeName: string | null;
  /** Owner note from the status_changed event (reason field). */
  ownerNote: string | null;
  /** Number of sightings logged after the original open (approximation). */
  sightingsCount: number;
};

// ---------------------------------------------------------------------------
// fetchLostEpisodeForPet
// ---------------------------------------------------------------------------

/**
 * Returns the single OPEN lost_pet_episode case for a pet, or null.
 *
 * Also fetches the originating status_changed event to extract:
 *   - location_description → placeName for LostLastSeenCard
 *   - reason → ownerNote for LostLastSeenCard
 */
export async function fetchLostEpisodeForPet(petId: string): Promise<LostEpisode | null> {
  const [caseRow] = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      openedAt: cases.openedAt,
      jurisdictionLocality: cases.jurisdictionLocality,
    })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, petId),
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  if (!caseRow) return null;

  // Fetch the originating status_changed event for location + note.
  const [originEvent] = await db
    .select({
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "status_changed"),
        eq(petEvents.caseId, caseRow.id),
      ),
    )
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  const payload = (originEvent?.payload ?? {}) as Record<string, unknown>;
  const placeName =
    typeof payload.location_description === "string" && payload.location_description.trim()
      ? payload.location_description.trim()
      : null;
  const ownerNote =
    typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : null;

  return {
    id: caseRow.id,
    publicCode: caseRow.publicCode,
    openedAt:
      caseRow.openedAt instanceof Date ? caseRow.openedAt : new Date(caseRow.openedAt as string),
    jurisdictionLocality: caseRow.jurisdictionLocality,
    placeName,
    ownerNote,
    // Sightings count is not yet tracked in a dedicated column.
    // Approximate from add_sighting events once that event kind is wired.
    sightingsCount: 0,
  };
}

// ---------------------------------------------------------------------------
// fetchLostScanEvents
// ---------------------------------------------------------------------------

/**
 * Returns the last 50 non-self credential_scanned events for a pet since the
 * lost episode opened. Shaped to ScanFeedItem[] for LostScanFeed.
 */
export async function fetchLostScanEvents(petId: string, since?: Date): Promise<ScanFeedItem[]> {
  const rows = await db
    .select({
      id: petEvents.id,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "credential_scanned")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(50);

  // Filter self-scans and optionally scope to since the episode opened.
  const filtered = rows.filter((r) => {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (p.is_self_scan === true) return false;
    if (since) {
      const at = r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt as string);
      if (at < since) return false;
    }
    return true;
  });

  return filtered.map(
    (r): ScanFeedItem => ({
      kind: "scan",
      id: r.id,
      at: r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt as string),
      count: 1,
      localityLabel: null,
    }),
  );
}
