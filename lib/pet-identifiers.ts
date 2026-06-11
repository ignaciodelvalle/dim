// Canonical pet-identifier helpers.
//
// All readers that need chip/tattoo values MUST use these helpers instead of
// querying pets.microchip_* / pets.tattoo_* legacy columns directly.
// The legacy columns are kept only for double-write compatibility until the
// next PR drops them.
//
// Single-pet fetch:  fetchActiveIdentifications(petId)
// Batch fetch:       batchFetchActiveIdentifications(petIds)
//
// Both return the same { microchip?, tattoo? } shape. Callers that only need
// one kind can destructure what they need.

import { and, eq, inArray } from "drizzle-orm";

import { db, petIdentifications } from "@/db";

// ---------------------------------------------------------------------------
// Return shapes
// ---------------------------------------------------------------------------

export type ActiveMicrochip = {
  code: string;
  isoCountryCode: string | null;
  recordedAt: string | null; // YYYY-MM-DD (maps to legacy microchipImplantedAt)
  recordedByLabel: string | null; // maps to legacy microchipImplantedBy
  implantationSite: string | null; // canonical enum; maps to legacy microchipLocation
};

export type ActiveTattoo = {
  code: string | null;
  tattooLocation: string | null;
  tattooDescription: string | null;
  recordedAt: string | null; // YYYY-MM-DD (maps to legacy tattooRecordedAt)
  recordedByLabel: string | null; // maps to legacy tattooRecordedBy
  photoId: string | null;
};

export type ActiveIdentifications = {
  microchip: ActiveMicrochip | null;
  tattoo: ActiveTattoo | null;
};

// ---------------------------------------------------------------------------
// Single-pet fetch
// ---------------------------------------------------------------------------

/**
 * Return the active chip and/or tattoo rows for one pet.
 * Fires a single query (two rows max — one per kind).
 */
export async function fetchActiveIdentifications(petId: string): Promise<ActiveIdentifications> {
  const rows = await db
    .select({
      kind: petIdentifications.kind,
      code: petIdentifications.code,
      isoCountryCode: petIdentifications.isoCountryCode,
      recordedAt: petIdentifications.recordedAt,
      recordedByLabel: petIdentifications.recordedByLabel,
      implantationSite: petIdentifications.implantationSite,
      tattooLocation: petIdentifications.tattooLocation,
      tattooDescription: petIdentifications.tattooDescription,
      photoId: petIdentifications.photoId,
    })
    .from(petIdentifications)
    .where(
      and(
        eq(petIdentifications.petId, petId),
        eq(petIdentifications.status, "active"),
        inArray(petIdentifications.kind, ["microchip_iso", "tattoo"]),
      ),
    );

  return rowsToIdentifications(rows)[petId] ?? { microchip: null, tattoo: null };
}

// ---------------------------------------------------------------------------
// Batch fetch
// ---------------------------------------------------------------------------

/**
 * Return active chip/tattoo rows for many pets in a single query.
 * Returns a Map keyed by petId. Missing pets are absent from the map (callers
 * should default to { microchip: null, tattoo: null }).
 */
export async function batchFetchActiveIdentifications(
  petIds: string[],
): Promise<Map<string, ActiveIdentifications>> {
  if (petIds.length === 0) return new Map();

  const rows = await db
    .select({
      petId: petIdentifications.petId,
      kind: petIdentifications.kind,
      code: petIdentifications.code,
      isoCountryCode: petIdentifications.isoCountryCode,
      recordedAt: petIdentifications.recordedAt,
      recordedByLabel: petIdentifications.recordedByLabel,
      implantationSite: petIdentifications.implantationSite,
      tattooLocation: petIdentifications.tattooLocation,
      tattooDescription: petIdentifications.tattooDescription,
      photoId: petIdentifications.photoId,
    })
    .from(petIdentifications)
    .where(
      and(
        inArray(petIdentifications.petId, petIds),
        eq(petIdentifications.status, "active"),
        inArray(petIdentifications.kind, ["microchip_iso", "tattoo"]),
      ),
    );

  const byPet = rowsToIdentifications(rows);
  return new Map(Object.entries(byPet));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

type IdentificationRow = {
  petId?: string;
  kind: string;
  code: string | null;
  isoCountryCode: string | null;
  recordedAt: string | null;
  recordedByLabel: string | null;
  implantationSite: string | null;
  tattooLocation: string | null;
  tattooDescription: string | null;
  photoId: string | null;
};

// Accepts rows with or without a `petId` column (single vs. batch). For the
// single-pet case we accept the petId as the Map key via the caller's petId arg;
// we use a sentinel key here.
const SINGLE_PET_KEY = "__single__";

function rowsToIdentifications(rows: IdentificationRow[]): Record<string, ActiveIdentifications> {
  const out: Record<string, ActiveIdentifications> = {};

  for (const row of rows) {
    const key = row.petId ?? SINGLE_PET_KEY;
    if (!out[key]) out[key] = { microchip: null, tattoo: null };

    if (row.kind === "microchip_iso" && row.code) {
      out[key].microchip = {
        code: row.code,
        isoCountryCode: row.isoCountryCode,
        recordedAt: row.recordedAt,
        recordedByLabel: row.recordedByLabel,
        implantationSite: row.implantationSite,
      };
    } else if (row.kind === "tattoo") {
      out[key].tattoo = {
        code: row.code,
        tattooLocation: row.tattooLocation,
        tattooDescription: row.tattooDescription,
        recordedAt: row.recordedAt,
        recordedByLabel: row.recordedByLabel,
        photoId: row.photoId,
      };
    }
  }

  return out;
}
