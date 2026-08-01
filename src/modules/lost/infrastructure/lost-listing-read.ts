// Lost-pet listing DB query — split from `lib/lost-listing.ts` so the
// shared module (types, codecs, label helpers) stays free of `db` imports
// and can be consumed by client components without dragging the postgres
// driver into the client bundle.
//
// Server callers (page.tsx, sitemap.ts) import from here; everything else
// imports from `@/lib/lost-listing`.

import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import { attachments, db, petEvents, pets } from "@/db";

import type {
  LostListingCursor,
  LostListingFilters,
  LostListingItem,
} from "@/lib/infra/lost-listing";

const DEFAULT_PAGE_SIZE = 24;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

export async function queryLostListing(
  filters: LostListingFilters,
  cursor: LostListingCursor | null,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ items: LostListingItem[]; nextCursor: LostListingCursor | null }> {
  // Stage 1 — pull the pet rows in status='lost' that match the structural
  // filters. We overshoot by pageSize+1 to detect "more pages", same
  // pagination trick as queryAdoptionListing.
  //
  // Filters that depend on the latest status_changed event (visto bucket,
  // criticality, cursor) are applied AFTER we resolve the event lookup,
  // in JS, because the latest event has to be picked per pet first.
  const baseConditions = [eq(pets.status, "lost")];

  if (filters.species) baseConditions.push(eq(pets.species, filters.species));
  if (filters.province) baseConditions.push(eq(pets.jurisdictionProvince, filters.province));
  if (filters.locality) baseConditions.push(eq(pets.jurisdictionLocality, filters.locality));
  if (filters.color) baseConditions.push(ilike(pets.color, `%${filters.color}%`));
  // hasMicrochip filter: EXISTS against canonical pet_identifications
  // (same ARCH-M idiom used by queryAdoptionListing).
  if (filters.hasMicrochip === true) {
    baseConditions.push(
      sql`EXISTS (
        SELECT 1 FROM pet_identifications pi
        WHERE pi.pet_id = ${pets.id}
          AND pi.kind = 'microchip_iso'
          AND pi.status = 'active'
      )`,
    );
  }

  // Sterilized: derive via EXISTS subquery on pet_events. Same pattern as
  // queryAdoptionListing's isSterilized SELECT-side computation, but here
  // we filter rather than select-only.
  if (filters.isSterilized === true) {
    baseConditions.push(
      sql`EXISTS (
        SELECT 1 FROM pet_events e
        WHERE e.pet_id = ${pets.id}
          AND e.event_type = 'sterilization_performed'
      )`,
    );
  }

  // We don't yet know which pets pass the time-bucket filter; fetch a
  // generous superset and trim after joining the latest event.
  // 500 is the same cap fetchLostPets uses in govt-dashboards.
  const fetchCap = Math.max(500, pageSize * 5);

  const baseRows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      breed: pets.breed,
      sex: pets.sex,
      color: pets.color,
      primaryPhotoId: pets.primaryPhotoId,
      primaryPhotoStoragePath: attachments.storagePath,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
      // hasMicrochip: EXISTS, never the code. The card renders a "Con chip"
      // badge — a boolean — and /perdidas is unauthenticated. Selecting the
      // 15-digit canonical value for every lost pet in the country put it one
      // `"use client"` away from the public RSC payload. Same standard as the
      // Item-27 location split below: don't fetch PII you only need to test for
      // presence, rather than fetch it and redact in JS.
      hasMicrochip: sql<boolean>`EXISTS (
        SELECT 1 FROM pet_identifications pi
        WHERE pi.pet_id = ${pets.id}
          AND pi.kind = 'microchip_iso'
          AND pi.status = 'active'
      )`,
      discloseLastLocationWhenLost: pets.discloseLastLocationWhenLost,
      isSterilized: sql<boolean>`EXISTS (
        SELECT 1 FROM pet_events e
        WHERE e.pet_id = ${pets.id}
          AND e.event_type = 'sterilization_performed'
      )`,
    })
    .from(pets)
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(and(...baseConditions))
    .limit(fetchCap);

  if (baseRows.length === 0) return { items: [], nextCursor: null };

  // Stage 2 — for every candidate pet, pull the latest status_changed event
  // where to_status='lost'. That row carries markedLostAt + (for pets that
  // consent to location disclosure) the location snapshot from the payload.
  //
  // PII fix (Item 27): we split the query into two sets:
  //   - disclosing pets  → fetch timestamp + location payload (owner opted in)
  //   - non-disclosing pets → fetch timestamp ONLY, no payload columns
  // This ensures pets with discloseLastLocationWhenLost=false never have their
  // location data retrieved from Postgres at all, not merely redacted in JS.
  //
  // Prefer the canonical `location_description` key; fall back to the legacy
  // `last_known_location` for events written before the key rename (same
  // pattern as the public credential page at app/p/[publicToken]/page.tsx).
  const petIds = baseRows.map((r) => r.petId);
  const disclosingIds = baseRows.filter((r) => r.discloseLastLocationWhenLost).map((r) => r.petId);
  const nonDisclosingIds = petIds.filter((id) => !disclosingIds.includes(id));

  // Fetch location-carrying events only for disclosing pets.
  const disclosingEventRows =
    disclosingIds.length > 0
      ? await db
          .select({
            petId: petEvents.petId,
            occurredAt: petEvents.occurredAt,
            payload: petEvents.payload,
          })
          .from(petEvents)
          .where(
            and(
              inArray(petEvents.petId, disclosingIds),
              eq(petEvents.eventType, "status_changed"),
              sql`(${petEvents.payload}->>'to_status') = 'lost'`,
            ),
          )
          .orderBy(desc(petEvents.occurredAt))
      : [];

  // Fetch timestamp-only events for non-disclosing pets (no payload column).
  const nonDisclosingEventRows =
    nonDisclosingIds.length > 0
      ? await db
          .select({
            petId: petEvents.petId,
            occurredAt: petEvents.occurredAt,
          })
          .from(petEvents)
          .where(
            and(
              inArray(petEvents.petId, nonDisclosingIds),
              eq(petEvents.eventType, "status_changed"),
              sql`(${petEvents.payload}->>'to_status') = 'lost'`,
            ),
          )
          .orderBy(desc(petEvents.occurredAt))
      : [];

  // Merge into a unified map: disclosing pets get their location payload,
  // non-disclosing pets get a null payload so location is never present.
  const latestLostByPet = new Map<
    string,
    { occurredAt: Date; payload: Record<string, unknown> | null }
  >();
  for (const e of disclosingEventRows) {
    if (!latestLostByPet.has(e.petId)) {
      latestLostByPet.set(e.petId, {
        occurredAt: e.occurredAt,
        payload: (e.payload ?? {}) as Record<string, unknown>,
      });
    }
  }
  for (const e of nonDisclosingEventRows) {
    if (!latestLostByPet.has(e.petId)) {
      // payload is intentionally null — location was never fetched (Item 27).
      latestLostByPet.set(e.petId, { occurredAt: e.occurredAt, payload: null });
    }
  }

  // Stage 3 — build items, apply time/criticality filters, apply privacy
  // gate, sort by markedLostAt desc, then paginate.
  const now = Date.now();
  const sinceMs = (() => {
    if (filters.criticality === "critical") return now - ONE_DAY_MS;
    if (filters.visto === "today") return now - ONE_DAY_MS;
    if (filters.visto === "week") return now - SEVEN_DAYS_MS;
    if (filters.visto === "month") return now - THIRTY_DAYS_MS;
    return null;
  })();

  let allItems: LostListingItem[] = [];
  for (const row of baseRows) {
    const meta = latestLostByPet.get(row.petId);
    if (!meta) continue; // pet flagged lost but no status_changed event — skip

    const occurredAt =
      meta.occurredAt instanceof Date ? meta.occurredAt : new Date(meta.occurredAt as string);
    if (sinceMs !== null && occurredAt.getTime() < sinceMs) continue;

    // location_description is the canonical key; last_known_location is
    // the legacy fallback (see public credential page for the same logic).
    // For non-disclosing pets meta.payload is null (never fetched) so
    // rawDescription evaluates to null without needing an explicit check.
    const rawDescription =
      meta.payload !== null &&
      typeof meta.payload.location_description === "string" &&
      meta.payload.location_description.trim()
        ? meta.payload.location_description.trim()
        : meta.payload !== null &&
            typeof meta.payload.last_known_location === "string" &&
            meta.payload.last_known_location.trim()
          ? meta.payload.last_known_location.trim()
          : null;
    // lastSeenDescription is null for non-disclosing pets because their
    // payload was never fetched — rawDescription is already null.
    const lastSeenDescription = row.discloseLastLocationWhenLost ? rawDescription : null;

    allItems.push({
      petId: row.petId,
      petPublicToken: row.petPublicToken,
      name: row.name,
      species: row.species,
      breed: row.breed,
      sex: row.sex,
      color: row.color,
      primaryPhotoId: row.primaryPhotoId,
      primaryPhotoStoragePath: row.primaryPhotoStoragePath,
      jurisdictionProvince: row.jurisdictionProvince,
      jurisdictionLocality: row.jurisdictionLocality,
      hasMicrochip: row.hasMicrochip,
      markedLostAt: occurredAt,
      lastSeenDescription,
      isSterilized: row.isSterilized,
      discloseLastLocationWhenLost: row.discloseLastLocationWhenLost,
    });
  }

  // Sort newest first, deterministic tie-break by petId.
  allItems.sort((a, b) => {
    const diff = b.markedLostAt.getTime() - a.markedLostAt.getTime();
    if (diff !== 0) return diff;
    return a.petId < b.petId ? 1 : a.petId > b.petId ? -1 : 0;
  });

  // Cursor — apply post-sort by skipping any rows newer than the cursor.
  // Tie-break: when timestamps match exactly, only rows with petId < cursor.id
  // come AFTER the cursor row, since the secondary sort is petId desc.
  if (cursor) {
    const cursorMs = new Date(cursor.markedLostAt).getTime();
    allItems = allItems.filter((it) => {
      const t = it.markedLostAt.getTime();
      if (t < cursorMs) return true;
      if (t === cursorMs) return it.petId < cursor.id;
      return false;
    });
  }

  const hasMore = allItems.length > pageSize;
  const items = hasMore ? allItems.slice(0, pageSize) : allItems;
  const last = items.at(-1);
  const nextCursor: LostListingCursor | null =
    hasMore && last ? { markedLostAt: last.markedLostAt.toISOString(), id: last.petId } : null;

  return { items, nextCursor };
}

// Lightweight count helpers for the KPI strip on the page header. Each
// returns just the integer — the DOM strip requests these in parallel
// along with the listing query.
export async function countLostInWindow(sinceMs: number): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  // status='lost' AND latest status_changed→lost event >= since.
  // Use a subquery so we don't double-count repeat episodes.
  const rows = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${pets.id})::int`,
    })
    .from(pets)
    .innerJoin(petEvents, eq(petEvents.petId, pets.id))
    .where(
      and(
        eq(pets.status, "lost"),
        eq(petEvents.eventType, "status_changed"),
        sql`(${petEvents.payload}->>'to_status') = 'lost'`,
        sql`${petEvents.occurredAt} >= ${since.toISOString()}::timestamptz`,
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function countAllLost(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pets)
    .where(eq(pets.status, "lost"));
  return rows[0]?.count ?? 0;
}
