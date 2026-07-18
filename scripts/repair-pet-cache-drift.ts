#!/usr/bin/env tsx
/**
 * Targeted repair for pets.status/deceased_at cache drift.
 *
 * WHY THIS EXISTS (vs scripts/rebuild-projections.ts)
 * ---------------------------------------------------
 * rebuild-projections replays EVERY pet, which is correct but impractical
 * against a remote database: 66k pets x 4 round-trips at WAN latency is
 * hours. This tool narrows the sweep with a single SQL CANDIDATE pre-filter
 * (pets whose latest status_changed.to_status disagrees with the cache — a
 * SUPERSET of real status drift, cheap to compute server-side) and then runs
 * the SAME canonical per-pet check rebuild-projections uses: advisory lock,
 * full event replay via replayPetStatus, diff, and only-then update. The
 * deriver re-verifies every candidate, so a false-positive candidate (e.g. a
 * deceased pet whose last status_changed predates death_recorded) is simply
 * reported OK and left untouched — the pre-filter can over-select, never
 * mis-repair.
 *
 * The status projection is the ONLY column family repaired here (status +
 * deceasedAt), mirroring what the reconcile-pet-status cron detects. Weight
 * and identifier drift stay in rebuild-projections' full-scan territory.
 *
 * USAGE
 *   tsx scripts/repair-pet-cache-drift.ts             # dry-run: list drift
 *   tsx scripts/repair-pet-cache-drift.ts --apply     # repair, per-pet tx
 *   tsx scripts/repair-pet-cache-drift.ts --concurrency 8
 *
 * ENV: DATABASE_URL (point it at the SESSION pooler for remote runs — the
 * per-pet transaction + advisory lock pattern needs session semantics).
 */

import { asc, eq, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import { replayPetStatus } from "@/lib/projections/pet-status";

type Args = { apply: boolean; concurrency: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, concurrency: 6 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--concurrency") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 16) {
        throw new Error("--concurrency must be an integer 1..16");
      }
      args.concurrency = n;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

/** Candidate pre-filter: latest status_changed disagrees with the cache. */
async function findCandidateIds(): Promise<string[]> {
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (pet_id) pet_id, payload->>'to_status' AS log_status
      FROM pet_events
      WHERE event_type = 'status_changed'
      ORDER BY pet_id, recorded_at DESC, id DESC
    )
    SELECT p.id
    FROM pets p
    JOIN latest l ON l.pet_id = p.id
    WHERE l.log_status IS NOT NULL
      AND l.log_status <> p.status::text
    ORDER BY p.id
  `)) as { id: string }[];
  return rows.map((r) => r.id);
}

type Outcome = "ok" | "drift" | "fixed" | "error";

/** Same atomic pattern as rebuild-projections: lock → replay → diff → update. */
async function checkOne(
  petId: string,
  apply: boolean,
): Promise<{ outcome: Outcome; summary?: string }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${petId}))`);

      const [pet] = await tx.select().from(pets).where(eq(pets.id, petId)).limit(1);
      if (!pet) return { outcome: "error" as const, summary: "pet vanished" };

      const events = await tx
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

      const expected = replayPetStatus(events);
      const statusDrift = pet.status !== expected.status;
      const deceasedDrift =
        (pet.deceasedAt?.getTime() ?? null) !== (expected.deceasedAt?.getTime() ?? null);

      if (!statusDrift && !deceasedDrift) return { outcome: "ok" as const };

      const summary = `status: ${pet.status} → ${expected.status}${
        deceasedDrift
          ? `; deceasedAt: ${pet.deceasedAt?.toISOString() ?? "null"} → ${expected.deceasedAt?.toISOString() ?? "null"}`
          : ""
      }`;

      if (!apply) return { outcome: "drift" as const, summary };

      await tx
        .update(pets)
        .set({ status: expected.status, deceasedAt: expected.deceasedAt, updatedAt: new Date() })
        .where(eq(pets.id, petId));

      return { outcome: "fixed" as const, summary };
    });
  } catch (err) {
    return { outcome: "error", summary: (err as Error).message };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const candidates = await findCandidateIds();
  console.log(
    `${candidates.length} candidate(s) from the pre-filter${args.apply ? " — APPLY mode" : " — dry-run"}.`,
  );
  if (candidates.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  const counts: Record<Outcome, number> = { ok: 0, drift: 0, fixed: 0, error: 0 };
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const id = candidates[idx];
      const res = await checkOne(id, args.apply);
      counts[res.outcome]++;
      if (res.outcome !== "ok" && res.summary) {
        console.log(`${res.outcome.toUpperCase().padEnd(5)} ${id}  ${res.summary}`);
      }
      const done = counts.ok + counts.drift + counts.fixed + counts.error;
      if (done % 500 === 0) console.log(`… ${done}/${candidates.length}`);
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, () => worker()));

  console.log("");
  console.log(
    `Summary: ${candidates.length} candidate(s) — ${counts.ok} ok (false-positive pre-filter), ` +
      `${counts.drift} drift${args.apply ? `, ${counts.fixed} fixed` : " (dry-run)"}, ${counts.error} error(s).`,
  );
  process.exit(counts.error > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("repair-pet-cache-drift crashed:", err);
  process.exit(2);
});
