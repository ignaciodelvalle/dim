/**
 * Projection-rebuild script.
 *
 * Replays the pet_events log for one or every pet and compares the derived
 * projection state against what the `pets` row currently holds. Reports drift.
 * With --dry-run=false, applies the update to bring the cache in line with
 * the events. This operationalizes AGENTS.md's "cache is always re-derivable
 * in principle" promise — if this script reports zero drift on a healthy DB,
 * the dual-write discipline is intact.
 *
 * Usage:
 *   pnpm rebuild:projections                     # dry-run, all pets
 *   pnpm rebuild:projections --pet DIM-XXXX-YY   # dry-run, one pet
 *   pnpm rebuild:projections --apply             # write fixes, all pets
 *   pnpm rebuild:projections --pet DIM-XXXX-YY --apply
 *
 * Output is grep-friendly: one pet per line, status code in the first column:
 *   OK     {publicToken}
 *   DRIFT  {publicToken}  status=... weight=... microchip=...
 *   FIXED  {publicToken}
 *
 * Note on preference-managed columns: `pets.emergencyInfoVisible` is a UI
 * preference (NO event emitted on flip — see v1 closure item 3) and is NOT
 * projection-managed. This script does not touch it.
 */

import { asc, eq } from "drizzle-orm";

import { db, petEvents, pets } from "../db";
import { replayPetMicrochip } from "../lib/projections/pet-microchip";
import { replayPetStatus } from "../lib/projections/pet-status";
import { replayPetWeight } from "../lib/projections/pet-weight";

type Args = {
  publicToken: string | null;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  let publicToken: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pet") {
      publicToken = argv[i + 1] ?? null;
      i++;
    } else if (a === "--apply") {
      apply = true;
    } else if (a === "--dry-run") {
      apply = false;
    }
  }
  return { publicToken, apply };
}

type Drift = {
  column: string;
  current: unknown;
  expected: unknown;
};

function diffPet(
  current: {
    status: string;
    deceasedAt: Date | string | null;
    estimatedWeightKg: string | null;
    microchipId: string | null;
    microchipCountryCode: string | null;
    microchipImplantedAt: Date | string | null;
    microchipImplantedBy: string | null;
    microchipLocation: string | null;
  },
  expected: {
    status: string;
    deceasedAt: Date | null;
    estimatedWeightKg: string | null;
    microchipId: string | null;
    microchipCountryCode: string | null;
    microchipImplantedAt: string | null;
    microchipImplantedBy: string | null;
    microchipLocation: string | null;
  },
): Drift[] {
  const drifts: Drift[] = [];
  if (current.status !== expected.status) {
    drifts.push({ column: "status", current: current.status, expected: expected.status });
  }
  const currentDeceasedAt = normalizeDate(current.deceasedAt);
  const expectedDeceasedAt = normalizeDate(expected.deceasedAt);
  if (currentDeceasedAt !== expectedDeceasedAt) {
    drifts.push({
      column: "deceasedAt",
      current: currentDeceasedAt,
      expected: expectedDeceasedAt,
    });
  }
  // Compare weights as numbers — Postgres `numeric` normalizes the stored
  // string ("8.5" → "8.50") so a raw string compare would false-positive drift.
  if (!sameNumeric(current.estimatedWeightKg, expected.estimatedWeightKg)) {
    drifts.push({
      column: "estimatedWeightKg",
      current: current.estimatedWeightKg,
      expected: expected.estimatedWeightKg,
    });
  }
  for (const key of [
    "microchipId",
    "microchipCountryCode",
    "microchipImplantedBy",
    "microchipLocation",
  ] as const) {
    if (current[key] !== expected[key]) {
      drifts.push({ column: key, current: current[key], expected: expected[key] });
    }
  }
  const currentImplantedAt = normalizeDate(current.microchipImplantedAt);
  if (currentImplantedAt !== expected.microchipImplantedAt) {
    drifts.push({
      column: "microchipImplantedAt",
      current: currentImplantedAt,
      expected: expected.microchipImplantedAt,
    });
  }
  return drifts;
}

function normalizeDate(value: Date | string | null): string | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function sameNumeric(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a === b;
  return na === nb;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const targetPets = args.publicToken
    ? await db.select().from(pets).where(eq(pets.publicToken, args.publicToken))
    : await db.select().from(pets);

  if (targetPets.length === 0) {
    console.error(
      args.publicToken ? `No pet with publicToken=${args.publicToken}` : "No pets in the database.",
    );
    process.exit(args.publicToken ? 1 : 0);
  }

  let driftCount = 0;
  let fixedCount = 0;

  for (const pet of targetPets) {
    const events = await db
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        recordedAt: petEvents.recordedAt,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(eq(petEvents.petId, pet.id))
      .orderBy(asc(petEvents.occurredAt), asc(petEvents.recordedAt), asc(petEvents.id));

    const statusProj = replayPetStatus(events);
    const weightProj = replayPetWeight(events);
    const microchipProj = replayPetMicrochip(events);

    const expected = { ...statusProj, ...weightProj, ...microchipProj };
    const drifts = diffPet(pet, expected);

    if (drifts.length === 0) {
      console.log(`OK     ${pet.publicToken}`);
      continue;
    }

    driftCount++;
    const summary = drifts
      .map((d) => `${d.column}: ${JSON.stringify(d.current)} → ${JSON.stringify(d.expected)}`)
      .join("; ");

    if (!args.apply) {
      console.log(`DRIFT  ${pet.publicToken}  ${summary}`);
      continue;
    }

    await db
      .update(pets)
      .set({
        status: expected.status,
        deceasedAt: expected.deceasedAt,
        estimatedWeightKg: expected.estimatedWeightKg,
        microchipId: expected.microchipId,
        microchipCountryCode: expected.microchipCountryCode,
        microchipImplantedAt: expected.microchipImplantedAt,
        microchipImplantedBy: expected.microchipImplantedBy,
        microchipLocation: expected.microchipLocation,
        updatedAt: new Date(),
      })
      .where(eq(pets.id, pet.id));
    fixedCount++;
    console.log(`FIXED  ${pet.publicToken}  ${summary}`);
  }

  console.log("");
  console.log(
    `Summary: ${targetPets.length} pet(s) scanned, ${driftCount} with drift${
      args.apply ? `, ${fixedCount} fixed` : " (dry-run, no writes)"
    }.`,
  );
  process.exit(driftCount > 0 && !args.apply ? 1 : 0);
}

main().catch((err) => {
  console.error("rebuild-projections crashed:", err);
  process.exit(2);
});
