// One command to clear test residue that blocks `pnpm verify`.
//
// THE PAIN THIS REMOVES
// ---------------------------------------------------------------------------
// `lint:spine` enforces invariant #3 — every pet has its pet_registered event in
// the append-only spine. It works, and it caught three leaks in a single day
// (TRNS-TEST-0001, DDXTEST-RABIES-…, and the E2EPet-… pile). But every time, the
// fence stated the problem and left the operator to work out the fix, which is
// NOT obvious: `pet_events` has a BEFORE DELETE trigger, so a plain
// `DELETE FROM pets` fails with "pet_events is append-only", and the sanctioned
// escape hatch is a GUC pair that has to be set LOCAL inside a transaction.
//
// Writing that by hand under a blocked commit is where the time goes. It is also
// where mistakes go: on 2026-07-29 I edited a cache column directly to unblock a
// test and manufactured exactly the cache-vs-spine drift the fence exists to
// detect. A blunt tool used in a hurry is worse than no tool.
//
// WHAT IT DOES NOT DO
// ---------------------------------------------------------------------------
// It does not touch real data. It removes pets matching KNOWN TEST PREFIXES
// only, refuses to run against a non-local database, and prints what it will
// delete before deleting it. It is not a general "clean the database" script —
// that would be a way to lose work.
//
// Run:  pnpm tsx scripts/clean-test-orphans.ts            (dry run — lists only)
//       pnpm tsx scripts/clean-test-orphans.ts --apply    (deletes)

import postgres from "postgres";

const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:54322/postgres";

/**
 * Name / token prefixes that only ever come from a test or a manual probe.
 * Deliberately explicit — a pattern like "%TEST%" would eventually match a real
 * pet called "Testa" and delete somebody's animal.
 */
export const TEST_PET_PREFIXES = {
  byName: ["E2EPet-", "ProbeAlta-", "DdxPet", "Transit Compliance Test"],
  // MC-DUP- added 2026-07-30: `__tests__/microchip-replaced.test.ts` HAS a
  // correct afterAll, but a worker killed mid-file never runs it, and the row
  // then fails check-spine-integrity on the next verify. Leaked exactly that
  // way when the suite was run with the QA server up (CPU contention → dead
  // worker). Tokens are `MC-DUP-${Date.now()}`, so they cannot collide with a
  // real `DIM-XXXX-XXXX`.
  // SURVTEST- added 2026-08-01: same failure mode as MC-DUP- above, this time
  // from `__tests__/symptom-surveillance.test.ts` (tokens `SURVTEST-*-${Date.now()}`).
  // DIM-PANO-US1 added 2026-08-01: unit-history-govt-subsumption.test.ts fixture
  // (fixed token `DIM-PANO-US1SUB`) — same killed-worker leak class.
  byToken: [
    "TRNS-TEST-",
    "DDXTEST-",
    "MORT-TEST-",
    "SQLQ-TEST-",
    "MC-DUP-",
    "SURVTEST-",
    "DIM-PANO-US1",
  ],
} as const;

export function isLocalDatabase(url: string): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL?.trim() || DEFAULT_LOCAL_URL;

  if (!isLocalDatabase(url)) {
    const masked = url.replace(/:[^:@]*@/, ":***@");
    console.error(
      `✗ Refusing to run: ${masked} is not a local database.\n  This script deletes rows. It only ever runs against localhost.`,
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const nameLikes = TEST_PET_PREFIXES.byName.map((p) => `${p}%`);
    const tokenLikes = TEST_PET_PREFIXES.byToken.map((p) => `${p}%`);

    const doomed = await sql<Array<{ id: string; name: string; token: string; status: string }>>`
      SELECT id::text AS id, name, public_token AS token, status
      FROM pets
      WHERE name LIKE ANY(${nameLikes}) OR public_token LIKE ANY(${tokenLikes})
      ORDER BY created_at DESC`;

    if (doomed.length === 0) {
      console.log("✓ No test-fixture pets found. Nothing to clean.");
      return;
    }

    console.log(`${doomed.length} test-fixture pet(s):`);
    for (const p of doomed) console.log(`  ${p.token}  ${p.name}  [${p.status}]`);

    if (!apply) {
      console.log("\nDry run — nothing deleted. Re-run with --apply to remove them.");
      return;
    }

    const actor = await sql<Array<{ id: string }>>`
      SELECT p.id::text AS id FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE u.email = 'admin@dim.test' LIMIT 1`;
    const actorId = actor[0]?.id;
    if (!actorId) {
      console.error("✗ No admin@dim.test profile to attribute the append-only override to.");
      process.exit(1);
    }

    const ids = doomed.map((p) => p.id);
    await sql.begin(async (tx) => {
      // The sanctioned escape hatch, set LOCAL so it dies with the transaction.
      await tx`SELECT set_config('app.allow_event_mutation', 'true', true)`;
      await tx`SELECT set_config('app.allow_event_mutation_actor', ${actorId}, true)`;
      await tx`DELETE FROM pet_events WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM ownerships WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM pet_identifications WHERE pet_id = ANY(${ids}::uuid[])`;
      await tx`DELETE FROM pets WHERE id = ANY(${ids}::uuid[])`;
    });
    console.log(`\n✓ Removed ${ids.length} test-fixture pet(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("clean-test-orphans.ts") ||
    process.argv[1].endsWith("clean-test-orphans.js"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
