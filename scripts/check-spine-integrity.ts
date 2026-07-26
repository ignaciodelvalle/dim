// Spine-integrity CI gate — enforces project invariant #3.
//
// Every pet MUST have its `pet_registered` event in the append-only event
// spine. The pets table is an operational CACHE; the spine is the record of
// fact. A pets row with no pet_registered event is a pet that, as far as the
// log is concerned, was never registered — a cache row outranking the spine,
// which is exactly what invariant #3 forbids.
//
// This is BLOCKING FROM DAY ONE, with NO grandfather baseline for existing
// rows (PO decision 2026-07-26). Deliberately unlike lint:seed-ids, which
// ratchets against scripts/seed-ids-baseline.json: a baseline here would
// legitimise precisely the drift this gate exists to stop. The 930 orphans
// present when this gate was written were fixed at the source (leaking test
// fixtures) and then purged, so the starting state is genuinely 0.
//
// THE ONE EXEMPTION — pets.seed_tag = 'perf'
// Bulk volume fixtures for performance work are inserted by the thousand and
// deliberately skip the real intake circuit; making them go through registerPet
// would defeat their purpose. The exemption is therefore:
//   * EXPLICIT — a named seed_tag value, listed in EXEMPT_SEED_TAGS below;
//   * VISIBLE  — the exempted count is always printed, including when it is 0;
//   * NARROW   — it is NOT a token-prefix LIKE. Matching on `public_token LIKE
//     'PERF-%'` would let anything that merely names itself right slip through,
//     and a token prefix is unowned: any test can mint one. seed_tag is a
//     column a writer must set on purpose (migration 0160).
// Nothing else is exempt. Test fixtures are NOT exempt — a fixture that needs a
// pet either registers it through the real circuit or cleans it up.
//
// Run:  pnpm tsx scripts/check-spine-integrity.ts   (or: pnpm lint:spine)
// Exits 0 when every non-exempt pet is anchored in the spine, OR when the DB is
//   unreachable (graceful skip, same as lint:locality / lint:db-budget, so a
//   DB-less CI box does not hard-fail; the partition LOGIC is enforced offline
//   by __tests__/check-spine-integrity.test.ts).
// Exits 1 listing the orphan pets, with the two ways to remediate.

import postgres from "postgres";

/**
 * seed_tag values whose pets may legitimately lack a pet_registered event.
 * Adding a value here is a deliberate, reviewable act — keep this list tiny.
 */
export const EXEMPT_SEED_TAGS = ["perf"] as const;

export type OrphanPetRow = {
  public_token: string;
  name: string;
  seed_tag: string | null;
  created_at: Date | string;
};

export type SpinePartition = {
  /** Orphans that fail the gate. */
  blocking: OrphanPetRow[];
  /** Orphans covered by an explicit seed_tag exemption. */
  exempt: OrphanPetRow[];
};

/**
 * Pure core: split orphan pets into blocking vs explicitly exempt.
 * Extracted so the exemption rule is unit-testable without a database.
 */
export function partitionOrphans(rows: OrphanPetRow[]): SpinePartition {
  const exemptTags = new Set<string>(EXEMPT_SEED_TAGS);
  const blocking: OrphanPetRow[] = [];
  const exempt: OrphanPetRow[] = [];
  for (const row of rows) {
    // Only a real seed_tag match exempts. Never the public_token.
    if (row.seed_tag !== null && exemptTags.has(row.seed_tag)) exempt.push(row);
    else blocking.push(row);
  }
  return { blocking, exempt };
}

/** How many offenders to print in full before summarising the rest. */
const MAX_LISTED = 20;

async function runCheck(): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });

  let rows: OrphanPetRow[];
  let totalPets: number;
  try {
    // Every pet with no pet_registered event, exemptions included — the
    // partition happens in JS so the exempted count can be REPORTED rather
    // than filtered away invisibly in SQL.
    rows = await sql<OrphanPetRow[]>`
      SELECT p.public_token, p.name, p.seed_tag, p.created_at
      FROM pets p
      WHERE NOT EXISTS (
        SELECT 1 FROM pet_events e
        WHERE e.pet_id = p.id AND e.event_type = 'pet_registered'
      )
      ORDER BY p.created_at DESC
    `;
    const [countRow] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM pets`;
    totalPets = Number(countRow?.n ?? 0);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[warn] check-spine-integrity: could not reach the DB (${reason}). Skipping this run.\n  This guard needs the local Supabase stack (pnpm db:start) or a DATABASE_URL.\n  The partition LOGIC is still enforced offline by __tests__/check-spine-integrity.test.ts.`,
    );
    await sql.end({ timeout: 1 }).catch(() => {});
    process.exit(0);
    return;
  }
  await sql.end({ timeout: 1 }).catch(() => {});

  const { blocking, exempt } = partitionOrphans(rows);

  // The exempted count is printed on EVERY run, pass or fail. A fence that
  // hides what it waves through is not a fence.
  const exemptLine =
    exempt.length === 0
      ? `  Exempt (seed_tag in ${EXEMPT_SEED_TAGS.join(", ")}): 0 pet(s).`
      : `  Exempt (seed_tag in ${EXEMPT_SEED_TAGS.join(", ")}): ${exempt.length} pet(s) allowed to skip the spine.`;

  if (blocking.length > 0) {
    for (const p of blocking.slice(0, MAX_LISTED)) {
      const created = new Date(p.created_at).toISOString().slice(0, 19).replace("T", " ");
      console.error(
        `✗ ${p.public_token} ("${p.name}", created ${created}, seed_tag=${p.seed_tag ?? "null"}) has no pet_registered event.`,
      );
    }
    if (blocking.length > MAX_LISTED) {
      console.error(`  … and ${blocking.length - MAX_LISTED} more.`);
    }
    console.error(
      `\n✗ ${blocking.length} pet(s) exist only as a cache row, with no pet_registered event in the append-only spine (invariant #3).`,
    );
    console.error(
      "  If this came from a TEST: register the pet through registerPet, or delete it in afterAll —\n" +
        "  scope the delete to the ids that test created, and use withMutationOverride\n" +
        "  (__tests__/_helpers/db-overrides.ts) for the pet_events cascade.",
    );
    console.error(
      "  If this is a BULK PERF FIXTURE: set pets.seed_tag = 'perf' at insert time.\n" +
        "  Do not add a new exemption without a reviewed decision.",
    );
    console.error(`\n${exemptLine}`);
    process.exit(1);
  }

  console.log(
    `✓ Spine integrity clean — every one of ${totalPets} pet(s) has its pet_registered event.`,
  );
  console.log(exemptLine);
}

// Only query the DB when invoked as a CLI. Importing this module from unit
// tests must not trigger the query or process.exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-spine-integrity.ts") ||
    process.argv[1].endsWith("check-spine-integrity.js"));

if (isMain) {
  runCheck();
}
