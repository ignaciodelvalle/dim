// Re-derivation harness for the `pets` dual-write cache.
//
// WHY THIS EXISTS (ARCH-I, P1):
// pet_events is the immutable spine; several `pets` columns are operational
// caches that writers DUAL-WRITE (insert the event AND update the column in the
// same tx). There is no projection/rebuild layer for most of these columns, so
// if a writer forgets the cache half — or a bug skews it — drift between the
// events and the cache is invisible forever. This module re-derives each
// derivable cache column from the authoritative source and reports drift.
//
// It is a PURE derivation library plus a thin DB-reading orchestrator:
//   - The per-column rules live in lib/projections/* (pure functions, unit-tested).
//   - rederivePetCache(petId, tx?) reads the event stream + the open custody
//     dispute, runs every projection, and returns a per-column comparison.
// The fitness test (__tests__/pet-cache-rederivation.test.ts) and the ops
// script (scripts/detect-pet-cache-drift.ts) BOTH consume this single library,
// so CI and production agree on what "drift" means.
//
// SOURCE OF TRUTH per column is documented inline. Most derive from pet_events;
// `inCustodyDispute` derives from the custody_disputes table (the authoritative
// source — a withdrawal flips the flag with no pet_event), so this is NOT a
// pure-event projection and is handled in the orchestrator.
//
// EXCLUDED COLUMNS (deliberately not checked — documented, not guessed):
//   - adoptionListedAt / adoptionListingPausedAt / adoptionStory /
//     adoptionRequirements / adoptionEnergyLevel / adoptionSizeEstimate /
//     adoptionAgeBucket / adoptionGoodWith{Kids,Dogs,Cats} / adoptionNeedsYard /
//     adoptionFeeArs → shelf-curated listing metadata; the writers emit NO event
//     (adoption-repository.ts setListingStatus / updateListingContent).
//   - potentiallyDangerousBreed → computed from breed/species via lib/breeds.ts
//     in lib/business-rules-reeval.ts, not from events.
//   - adoptionEligibilitySetByUserId → maps to event.recordedByUserId which can
//     be null for system/stub writes; adoptionEligibilitySetAt is the witness.
//   - UI-preference flags (emergencyInfoVisible, disclose*WhenLost,
//     tier2PublicEnabledUntil) → flipping them emits no event by design.
//   - PII/metadata (createdBy, updatedBy, purpose, deletedAt, retentionUntil,
//     createdAt, updatedAt).

import { and, asc, eq, inArray } from "drizzle-orm";

import { custodyDisputes, db, petEvents, petIdentifications, pets } from "@/db";
import { normalizeMicrochipLocation } from "@/lib/infra/pet-identifier-mapping";
import { replayPetAdoptionEligibility } from "@/lib/projections/pet-adoption-eligibility";
import { replayPetMicrochip } from "@/lib/projections/pet-microchip";
import { replayPetPregnancy } from "@/lib/projections/pet-pregnancy";
import { replayPetRabiesObservation } from "@/lib/projections/pet-rabies-observation";
import { replayPetStatus } from "@/lib/projections/pet-status";
import { replayPetTattoo } from "@/lib/projections/pet-tattoo";
import { replayPetWeight } from "@/lib/projections/pet-weight";
import type { ProjectionEvent } from "@/lib/projections/types";

// db.transaction callback param — accepted so callers can re-derive inside a
// per-pet advisory-locked tx (same pattern as scripts/rebuild-projections.ts).
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// How a column's stored vs derived values are compared. Some columns are
// numeric (Postgres normalizes "8.5"→"8.50"), some are date-only (DATE columns
// round-trip as YYYY-MM-DD), some are timestamp instants, the rest are strict.
// "implantSite" is a special kind for microchipLocation: both stored (canonical
// implantation_site) and derived (event payload location_on_body) are normalized
// through chipImplantSiteFromLocation before comparison because the legacy free-
// text form value and canonical enum are aliases of each other.
type CompareKind = "strict" | "numeric" | "dateOnly" | "instant" | "boolean" | "implantSite";

export type ColumnReport = {
  stored: unknown;
  derived: unknown;
  matches: boolean;
};

export type RederivePetCacheReport = Record<string, ColumnReport>;

// Columns the harness checks, with their comparison strategy. The key is the
// camelCase Drizzle column name on the pets row.
//
// ARCH-Q: microchip and tattoo columns are no longer sourced from pets.* for
// the "stored" side. Instead the harness reads the canonical pet_identifications
// row and applies an inverse mapping so both sides speak the same field-name
// language as the projections (see rederivePetCache below). The CompareKind
// values here still govern how each column is compared.
const CHECKED_COLUMNS: Record<string, CompareKind> = {
  // status (events: death_recorded / status_changed)
  status: "strict",
  deceasedAt: "instant",
  // weight (events: weight_recorded)
  estimatedWeightKg: "numeric",
  // microchip (canonical pet_identifications, stored side re-mapped — ARCH-Q)
  microchipId: "strict",
  microchipCountryCode: "strict",
  microchipImplantedAt: "dateOnly",
  microchipImplantedBy: "strict",
  // implantSite: normalizes both sides through chipImplantSiteFromLocation
  // because canonical stores enum, projection outputs raw form value.
  microchipLocation: "implantSite",
  // tattoo (canonical pet_identifications, stored side re-mapped — ARCH-Q)
  tattooCode: "strict",
  tattooLocation: "strict",
  tattooDescription: "strict",
  tattooRecordedAt: "dateOnly",
  tattooRecordedBy: "strict",
  // pregnancy (events: clinical_info_logged sub_kind=pregnancy)
  pregnancyStatus: "strict",
  // rabies (events: rabies_observation_started / _ended)
  rabiesObservationStatus: "strict",
  // custody dispute (custody_disputes table — NOT events)
  inCustodyDispute: "boolean",
  // adoption eligibility (events: adoption_eligibility_set, latest-wins)
  adoptionEligible: "boolean",
  adoptionIneligibleReason: "strict",
  adoptionIneligibleReasonNotes: "strict",
  adoptionIneligibleUntil: "instant",
  adoptionEligibilitySetAt: "instant",
};

export const CHECKED_COLUMN_NAMES = Object.keys(CHECKED_COLUMNS);

/**
 * Re-derive every derivable cache column for one pet and compare against the
 * stored values. Returns a per-column report. Throws if the pet does not exist.
 *
 * Pass `executor` (a tx) to run inside a transaction — e.g. the drift script
 * takes a per-pet advisory lock so a concurrent writer cannot interleave a new
 * event between the read and the comparison.
 */
export async function rederivePetCache(
  petId: string,
  executor: Executor = db,
): Promise<RederivePetCacheReport> {
  const [pet] = await executor.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet) {
    throw new Error(`rederivePetCache: pet ${petId} not found`);
  }

  // Fetch all three sources in parallel: events, canonical identifiers, and
  // the custody-dispute table.
  const [events, canonicalIds, openDisputeRows] = await Promise.all([
    executor
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        recordedAt: petEvents.recordedAt,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(eq(petEvents.petId, petId))
      .orderBy(asc(petEvents.occurredAt), asc(petEvents.recordedAt), asc(petEvents.id)),
    // ARCH-Q: canonical identifier rows replace pets.* as the stored source
    // for microchip and tattoo columns.
    executor
      .select({
        kind: petIdentifications.kind,
        code: petIdentifications.code,
        isoCountryCode: petIdentifications.isoCountryCode,
        recordedAt: petIdentifications.recordedAt,
        recordedByLabel: petIdentifications.recordedByLabel,
        implantationSite: petIdentifications.implantationSite,
        tattooLocation: petIdentifications.tattooLocation,
        tattooDescription: petIdentifications.tattooDescription,
      })
      .from(petIdentifications)
      .where(
        and(
          eq(petIdentifications.petId, petId),
          eq(petIdentifications.status, "active"),
          inArray(petIdentifications.kind, ["microchip_iso", "tattoo"]),
        ),
      ),
    executor
      .select({ id: custodyDisputes.id })
      .from(custodyDisputes)
      .where(and(eq(custodyDisputes.petId, petId), eq(custodyDisputes.status, "open")))
      .limit(1),
  ]);

  // Build canonical stored values for chip/tattoo in the same field shape as
  // the projections so the comparison is apples-to-apples.
  const chipRow = canonicalIds.find((r) => r.kind === "microchip_iso");
  const tattooRow = canonicalIds.find((r) => r.kind === "tattoo");

  // Sentinel labels written by migration backfills (0056, 0082) carry
  // provenance metadata that was not present in the original event payload.
  // When the canonical row's recordedByLabel is a backfill sentinel, the
  // corresponding event-projection field derives as null (no implanted_by in
  // the event). Similarly, recordedAt may be set to created_at/current_date
  // by the backfill when microchip_implanted_at was null and implant_date_known
  // was not true in the event. Treat both as null here so the harness compares
  // "no real value" vs "no real value" rather than flagging expected gaps.
  const BACKFILL_LABELS = new Set([
    "legacy_backfill_0056",
    "legacy_backfill_0082",
    "legacy_backfill_0083",
  ]);

  const chipRecordedByLabel = chipRow?.recordedByLabel ?? null;
  const chipIsBackfill = chipRecordedByLabel !== null && BACKFILL_LABELS.has(chipRecordedByLabel);

  const tattooRecordedByLabel = tattooRow?.recordedByLabel ?? null;
  const tattooIsBackfill =
    tattooRecordedByLabel !== null && BACKFILL_LABELS.has(tattooRecordedByLabel);

  // For backfill-labeled rows, microchipImplantedAt and microchipImplantedBy (and
  // their tattoo counterparts) were set from legacy column data that may not match
  // the event projection:
  //
  //   - microchipImplantedAt: backfill used COALESCE(implanted_at, created_at::date,
  //     current_date), so pets without a real implanted_at date got today's date.
  //     The projection returns null when implant_date_known=false (correct). Use the
  //     derived value as stored so backfill-approximation dates don't falsely fail.
  //   - microchipImplantedBy: backfill set recordedByLabel='legacy_backfill_0082'
  //     (sentinel provenance, not a real person). Projection returns null. Treat as
  //     null to match.
  //
  // For real (non-backfill) writes both sides come from the same event data and
  // WILL match if the writers are correct — those mismatches remain detectable.
  //
  // Sentinel logic is intentionally scoped to just these two fields per kind;
  // microchipId, microchipCountryCode, and microchipLocation are reliable even for
  // backfill rows (they are always set from real chip data, not approximated).
  const CHIP_IMPLANT_DATE_STORED = chipIsBackfill ? undefined : (chipRow?.recordedAt ?? null);
  const CHIP_IMPLANTED_BY_STORED = chipIsBackfill ? null : chipRecordedByLabel;
  const TATTOO_RECORDED_AT_STORED = tattooIsBackfill ? undefined : (tattooRow?.recordedAt ?? null);
  const TATTOO_RECORDED_BY_STORED = tattooIsBackfill ? null : tattooRecordedByLabel;
  // undefined means "use the derived value as stored" (skip comparison by matching).
  // This sentinel is resolved per-column in the report loop below.

  const canonicalStored: Record<string, unknown> = {
    // Microchip — map canonical fields to pets.* column names.
    microchipId: chipRow?.code ?? null,
    microchipCountryCode: chipRow?.isoCountryCode ?? null,
    microchipImplantedAt: CHIP_IMPLANT_DATE_STORED,
    microchipImplantedBy: CHIP_IMPLANTED_BY_STORED,
    // implantationSite stores the canonical enum; comparison uses "implantSite"
    // kind which normalizes both sides through chipImplantSiteFromLocation.
    microchipLocation: chipRow?.implantationSite ?? null,
    // Tattoo — map canonical fields to pets.* column names.
    tattooCode: tattooRow?.code ?? null,
    tattooLocation: tattooRow?.tattooLocation ?? null,
    tattooDescription: tattooRow?.tattooDescription ?? null,
    tattooRecordedAt: TATTOO_RECORDED_AT_STORED,
    tattooRecordedBy: TATTOO_RECORDED_BY_STORED,
  };

  const derived = {
    ...replayPetStatus(events),
    ...replayPetWeight(events),
    ...replayPetMicrochip(events),
    ...replayPetTattoo(events),
    ...replayPetPregnancy(events),
    ...replayPetRabiesObservation(events),
    ...replayPetAdoptionEligibility(events),
    inCustodyDispute: openDisputeRows.length > 0,
  } as Record<string, unknown>;

  const petRow = pet as Record<string, unknown>;
  const report: RederivePetCacheReport = {};

  // Identifier columns use canonical stored values (from canonicalStored above).
  // ARCH-S: the 10 legacy chip/tattoo columns have been dropped from pets (migration 0084).
  // All other columns still read from the pets row.
  const CANONICAL_COLUMNS = new Set([
    "microchipId",
    "microchipCountryCode",
    "microchipImplantedAt",
    "microchipImplantedBy",
    "microchipLocation",
    "tattooCode",
    "tattooLocation",
    "tattooDescription",
    "tattooRecordedAt",
    "tattooRecordedBy",
  ]);

  for (const [column, kind] of Object.entries(CHECKED_COLUMNS)) {
    let stored = CANONICAL_COLUMNS.has(column) ? canonicalStored[column] : petRow[column];
    const derivedValue = derived[column];
    // undefined in canonicalStored means "backfill approximation — treat as
    // derived so this column always matches and doesn't produce false positives".
    if (stored === undefined) stored = derivedValue;
    report[column] = {
      stored,
      derived: derivedValue,
      matches: valuesMatch(stored, derivedValue, kind),
    };
  }
  return report;
}

/** Returns the subset of a report whose columns drifted. */
export function driftedColumns(report: RederivePetCacheReport): RederivePetCacheReport {
  const out: RederivePetCacheReport = {};
  for (const [column, r] of Object.entries(report)) {
    if (!r.matches) out[column] = r;
  }
  return out;
}

export function hasDrift(report: RederivePetCacheReport): boolean {
  return Object.values(report).some((r) => !r.matches);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function valuesMatch(stored: unknown, derived: unknown, kind: CompareKind): boolean {
  switch (kind) {
    case "numeric":
      return sameNumeric(stored, derived);
    case "dateOnly":
      return sameDateOnly(stored, derived);
    case "instant":
      return sameInstant(stored, derived);
    case "boolean":
      return normalizeBool(stored) === normalizeBool(derived);
    case "implantSite":
      // Both sides may be in different alias forms (e.g. "interscapular_left"
      // from event payload vs "interescapular" from canonical enum). Normalize
      // both through chipImplantSiteFromLocation before comparing.
      return sameImplantSite(stored, derived);
    default:
      return normalizeStrict(stored) === normalizeStrict(derived);
  }
}

function normalizeStrict(v: unknown): unknown {
  // Treat undefined as null so a missing column reads as null, not a mismatch.
  return v === undefined ? null : v;
}

function normalizeBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "t") return true;
  if (v === "false" || v === "f") return false;
  return null;
}

function sameNumeric(a: unknown, b: unknown): boolean {
  const na = toNumberOrNull(a);
  const nb = toNumberOrNull(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  return na === nb;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function sameDateOnly(a: unknown, b: unknown): boolean {
  const da = toDateOnly(a);
  const db_ = toDateOnly(b);
  return da === db_;
}

function toDateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    // Already a YYYY-MM-DD (DATE column) — take the date portion verbatim.
    const m = v.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function sameImplantSite(a: unknown, b: unknown): boolean {
  const na =
    a === null || a === undefined || a === ""
      ? null
      : normalizeMicrochipLocation(typeof a === "string" ? a : String(a));
  const nb =
    b === null || b === undefined || b === ""
      ? null
      : normalizeMicrochipLocation(typeof b === "string" ? b : String(b));
  return na === nb;
}

function sameInstant(a: unknown, b: unknown): boolean {
  const ta = toInstant(a);
  const tb = toInstant(b);
  if (ta === null && tb === null) return true;
  if (ta === null || tb === null) return false;
  return ta === tb;
}

function toInstant(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
