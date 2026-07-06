// Refresh the denormalized `pets.*` cache after an amendment (Invariant #3).
//
// WHY THIS EXISTS (F4 re-audit, review 22/1d):
// An amendment inserts an append-only `event_amended` row that overrides the
// CURRENT value of an earlier event's field (via overlayAmendments at every
// read boundary). But several `pets.*` columns are DENORMALIZED caches that
// writers dual-write in the same tx as the originating event. When the earlier
// event is corrected, those caches must be re-derived from the AMENDED stream
// in the SAME transaction — otherwise a correction supersedes in every
// projection EXCEPT the cache, which drifts invisibly from the spine.
//
// This is the single "refresh affected pet cache after amendment" mechanism,
// keyed by the ROOT (amended) event's type. Adding a new amendable type whose
// value lands in a pets cache column means adding one entry to REFRESH_BY_TYPE
// here — the dispatch is centralized so a new type can't silently skip it.
//
// The three cache-bearing amendable types today:
//   - weight_recorded          → pets.estimatedWeightKg  (replayPetWeight)
//   - clinical_info_logged     → pets.pregnancyStatus    (replayPetPregnancy,
//                                 no-op unless sub_kind=pregnancy)
//   - movement_recorded        → pets.jurisdiction*       (latest jurisdiction_changed
//                                 destination, canonicalized)
// The other amendable types (vaccination, deworming, vet visit, medication,
// note, sterilization) have NO pets cache column, so they map to nothing.

import { asc, eq } from "drizzle-orm";

import { type db, petEvents, pets } from "@/db";
import { normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { overlayAmendments } from "@/lib/infra/amendment";
import { replayPetPregnancy } from "@/lib/projections/pet-pregnancy";
import { replayPetWeight } from "@/lib/projections/pet-weight";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Event stream row shape that both overlayAmendments and the pure projections
// accept (id + eventType + occurredAt + recordedAt + payload).
type StreamEvent = {
  id: string;
  eventType: string;
  occurredAt: Date | string;
  recordedAt: Date | string;
  payload: unknown;
};

type OverlaidEvent = StreamEvent & { amendedAt: Date | string | null };

type Refresher = (tx: Tx, petId: string, overlaid: OverlaidEvent[]) => Promise<void>;

// Keyed by the ROOT (amended) event's type. Types absent from this map carry no
// denormalized pets cache and are intentional no-ops.
const REFRESH_BY_TYPE: Record<string, Refresher> = {
  weight_recorded: refreshWeight,
  clinical_info_logged: refreshPregnancy,
  movement_recorded: refreshJurisdiction,
};

/**
 * Re-derive the pets cache column(s) affected by an amendment, in the SAME tx
 * as the amendment insert. `amendedEventId` is the RESOLVED root event id (the
 * chain is always flattened to the root by amend-event.ts), so this also covers
 * amendment-of-amendment: the root event's type — read from the stream itself —
 * selects the refresher.
 */
export async function refreshPetCacheAfterAmendment(
  tx: Tx,
  petId: string,
  amendedEventId: string,
): Promise<void> {
  // Fetch the full stream once (includes the just-inserted event_amended row).
  const stream: StreamEvent[] = await tx
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      recordedAt: petEvents.recordedAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(eq(petEvents.petId, petId))
    .orderBy(asc(petEvents.occurredAt), asc(petEvents.recordedAt), asc(petEvents.id));

  const root = stream.find((e) => e.id === amendedEventId);
  if (!root) return;

  const refresh = REFRESH_BY_TYPE[root.eventType];
  if (!refresh) return;

  // Project the amended payload onto its target event, then derive off that.
  const overlaid = overlayAmendments(stream) as OverlaidEvent[];
  await refresh(tx, petId, overlaid);
}

// ---------------------------------------------------------------------------
// Per-column refreshers
// ---------------------------------------------------------------------------

async function refreshWeight(tx: Tx, petId: string, overlaid: OverlaidEvent[]): Promise<void> {
  const { estimatedWeightKg } = replayPetWeight(overlaid);
  await tx.update(pets).set({ estimatedWeightKg }).where(eq(pets.id, petId));
}

async function refreshPregnancy(tx: Tx, petId: string, overlaid: OverlaidEvent[]): Promise<void> {
  const { pregnancyStatus } = replayPetPregnancy(overlaid);
  await tx.update(pets).set({ pregnancyStatus }).where(eq(pets.id, petId));
}

/**
 * Jurisdiction cache = the destination of the LATEST movement_recorded whose
 * sub_kind is jurisdiction_changed (cvi_issued / transport_recorded never touch
 * it — R6.2). When the amended event is NOT the latest jurisdiction_changed move
 * (or there is none at all), the cache correctly stays at the true latest / the
 * registration value: this derivation always reflects the current head of the
 * amended stream. The destination is canonicalized against the INDEC catalog
 * exactly as recordMovementWriter does on the write path, so an off-catalog
 * amended locality can't fork the jurisdiction-keyed read paths.
 */
async function refreshJurisdiction(
  tx: Tx,
  petId: string,
  overlaid: OverlaidEvent[],
): Promise<void> {
  let latest: Record<string, unknown> | null = null;
  for (let i = overlaid.length - 1; i >= 0; i--) {
    const e = overlaid[i];
    if (e.eventType !== "movement_recorded") continue;
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    if (payload.sub_kind !== "jurisdiction_changed") continue;
    latest = payload;
    break;
  }
  // No jurisdiction move in the stream → leave the registration jurisdiction.
  if (!latest) return;

  const toCountry = typeof latest.to_country === "string" ? latest.to_country : "AR";
  const toProvince = typeof latest.to_province === "string" ? latest.to_province : null;
  const toLocality = typeof latest.to_locality === "string" ? latest.to_locality : null;

  let province = toProvince;
  let locality = toLocality;
  // Mirror recordMovementWriter.canonicalizeMovement: only AR destinations with
  // both fields present are resolved; "soft" mode never throws (an off-catalog
  // pair falls through as-is).
  if (toCountry === "AR" && toProvince && toLocality) {
    const normalized = await normalizeLocationForWrite(
      {
        province: toProvince,
        provinceCode: null,
        locality: toLocality,
        localityIndecId: null,
        lat: null,
        lng: null,
        address: null,
      },
      { locality: "soft" },
    );
    province = normalized.province;
    locality = normalized.locality;
  }

  await tx
    .update(pets)
    .set({
      jurisdictionCountry: toCountry,
      jurisdictionProvince: province,
      jurisdictionLocality: locality,
    })
    .where(eq(pets.id, petId));
}
