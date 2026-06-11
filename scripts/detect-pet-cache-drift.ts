#!/usr/bin/env tsx
/**
 * Production drift detector for the `pets` dual-write cache (ARCH-I, P1).
 *
 * Several `pets` columns are operational caches that writers dual-write
 * alongside the authoritative source (pet_events for most; the custody_disputes
 * table for in_custody_dispute). If a writer forgets the cache half — or a bug
 * skews it — the cache silently disagrees with the events. This script
 * re-derives every derivable cache column (via lib/rederive-pet-cache.ts, the
 * SAME library the CI fitness test uses) and reports any pet whose stored cache
 * disagrees with the re-derived value.
 *
 * READ-ONLY BY DESIGN — this script NEVER writes. It does NOT auto-repair.
 * Repairing drift is a HUMAN decision: a mismatch can mean either the cache is
 * wrong (safe to recompute) OR the event stream is incomplete (recomputing
 * would destroy the only correct value). An operator must inspect each case and
 * choose the fix. For the status/weight/microchip subset there is an existing
 * apply path (scripts/rebuild-projections.ts --apply); for the rest, repair is
 * manual until a dedicated remediation is built.
 *
 * Output: one JSON line per drifted pet (grep/jq-friendly), then a summary line
 * on stderr. Exit code:
 *   0 → no drift (or no pets)
 *   1 → drift found
 *   2 → crashed
 *
 * Usage:
 *   pnpm exec tsx scripts/detect-pet-cache-drift.ts                 # scan all pets
 *   pnpm exec tsx scripts/detect-pet-cache-drift.ts --pet DIM-XXXX  # one pet by token
 *   pnpm exec tsx scripts/detect-pet-cache-drift.ts --batch 200     # batch size (default 100)
 *   pnpm exec tsx scripts/detect-pet-cache-drift.ts --json-only     # suppress progress logs
 */

// Env bootstrap MUST be first — see scripts/_load-env.ts.
import "./_load-env";

import { asc, eq, gt, sql } from "drizzle-orm";

import { db, pets } from "@/db";
import { driftedColumns, rederivePetCache } from "@/lib/rederive-pet-cache";

type Args = {
  publicToken: string | null;
  batchSize: number;
  jsonOnly: boolean;
};

function parseArgs(argv: string[]): Args {
  let publicToken: string | null = null;
  let batchSize = 100;
  let jsonOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pet") {
      publicToken = argv[i + 1] ?? null;
      i++;
    } else if (a === "--batch") {
      const n = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) batchSize = n;
      i++;
    } else if (a === "--json-only") {
      jsonOnly = true;
    }
  }
  return { publicToken, batchSize, jsonOnly };
}

type PetRef = { id: string; publicToken: string };

/**
 * Re-derive one pet under a per-pet advisory lock so a concurrent writer cannot
 * interleave a new pet_event between the read and the comparison (mirrors the
 * locking discipline in scripts/rebuild-projections.ts). Read-only — the tx
 * takes a lock and SELECTs only; it never writes.
 */
async function checkPet(
  pet: PetRef,
): Promise<Record<string, { stored: unknown; derived: unknown }>> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);
    const report = await rederivePetCache(pet.id, tx);
    const drifted = driftedColumns(report);
    const out: Record<string, { stored: unknown; derived: unknown }> = {};
    for (const [col, r] of Object.entries(drifted)) {
      out[col] = { stored: r.stored, derived: r.derived };
    }
    return out;
  });
}

async function* iterateAllPets(batchSize: number): AsyncGenerator<PetRef> {
  // Keyset pagination over the primary key — stable under concurrent inserts
  // and cheap (no OFFSET scan). Read-only.
  let cursor: string | null = null;
  for (;;) {
    const base = db.select({ id: pets.id, publicToken: pets.publicToken }).from(pets).$dynamic();
    const query = cursor ? base.where(gt(pets.id, cursor)) : base;
    const batch: PetRef[] = await query.orderBy(asc(pets.id)).limit(batchSize);
    if (batch.length === 0) return;
    for (const p of batch) yield p;
    cursor = batch[batch.length - 1].id;
    if (batch.length < batchSize) return;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string) => {
    if (!args.jsonOnly) console.error(msg);
  };

  log(
    `[detect-pet-cache-drift] starting — ${args.publicToken ? `pet=${args.publicToken}` : "all pets"} batch=${args.batchSize}`,
  );

  let scanned = 0;
  let driftedPets = 0;

  const emit = (pet: PetRef, drift: Record<string, { stored: unknown; derived: unknown }>) => {
    driftedPets++;
    // One JSON line per drifted pet — grep/jq-friendly. stdout only.
    console.log(
      JSON.stringify({
        kind: "pet_cache_drift",
        petId: pet.id,
        publicToken: pet.publicToken,
        columns: drift,
      }),
    );
  };

  if (args.publicToken) {
    const [pet] = await db
      .select({ id: pets.id, publicToken: pets.publicToken })
      .from(pets)
      .where(eq(pets.publicToken, args.publicToken))
      .limit(1);
    if (!pet) {
      console.error(`[detect-pet-cache-drift] no pet with publicToken=${args.publicToken}`);
      process.exit(1);
    }
    scanned = 1;
    const drift = await checkPet(pet);
    if (Object.keys(drift).length > 0) emit(pet, drift);
  } else {
    for await (const pet of iterateAllPets(args.batchSize)) {
      scanned++;
      const drift = await checkPet(pet);
      if (Object.keys(drift).length > 0) emit(pet, drift);
      if (!args.jsonOnly && scanned % 500 === 0) {
        log(`[detect-pet-cache-drift]   …scanned ${scanned} pets so far`);
      }
    }
  }

  const verdict =
    driftedPets > 0 ? " — DRIFT DETECTED (read-only; repair is a human decision)" : " — clean";
  log(`[detect-pet-cache-drift] done — scanned=${scanned} drifted=${driftedPets}${verdict}`);

  process.exit(driftedPets > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[detect-pet-cache-drift] fatal error:", err);
  process.exit(2);
});
