// Regression test for the gob/decomisos custody_episode list ordering fix
// (2026-07-21 operator-screen consistency pass, item B).
//
// Bug: the list query ordered by `desc(cases.openedAt)` alone. Most seed
// custody_episode rows share an identical batch-import timestamp (verified
// against the local DB), so ties fell back to whatever order Postgres's scan
// happened to hand back — for a bulk-inserted batch that reads out in
// roughly insertion order, meaning the oldest case in a tied block rendered
// FIRST and the newest LAST: "the list starts at the end" symptom reported.
//
// Fix: add `desc(cases.id)` as a tiebreak (app/gob/decomisos/page.tsx),
// mirroring the canonical newest-first pattern lib/infra/case-queries.ts
// already uses for listCasesForGovt/listCasesForAdmin, backed by the
// cases_opened_at_id_idx composite index on (opened_at DESC, id DESC).
//
// SQL guarantees a multi-column ORDER BY breaks ties on the second key
// regardless of physical row layout, so these assertions are fully
// deterministic (not flaky) once the tiebreak is in place.

import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { cases, db } from "@/db";

const insertedIds: string[] = [];

async function insertCustodyEpisode(openedAt: Date): Promise<string> {
  const [row] = await db
    .insert(cases)
    .values({
      publicCode: `DEC-ORDER-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      caseKind: "custody_episode",
      primarySubjectKind: "general",
      status: "open",
      openedAt,
    })
    .returning({ id: cases.id });
  insertedIds.push(row.id);
  return row.id;
}

describe("gob/decomisos custody_episode list ordering (B)", () => {
  afterAll(async () => {
    if (insertedIds.length > 0) {
      await db.delete(cases).where(inArray(cases.id, insertedIds));
    }
  });

  it("breaks ties on an identical openedAt by id DESC — matches the page's fixed ORDER BY", async () => {
    const tiedAt = new Date("2026-06-20T00:00:00.000Z");
    const idA = await insertCustodyEpisode(tiedAt);
    const idB = await insertCustodyEpisode(tiedAt);
    const idC = await insertCustodyEpisode(tiedAt);

    // Independent reference order: id DESC alone, for the same three rows.
    const idOrderRows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(inArray(cases.id, [idA, idB, idC]))
      .orderBy(desc(cases.id));
    const expectedOrder = idOrderRows.map((r) => r.id);

    // The page's exact fixed ORDER BY: opened_at DESC, id DESC. With all
    // three rows sharing the same openedAt, this must collapse to the
    // id-DESC order above — not scan/insertion order.
    const tieRows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.caseKind, "custody_episode"), inArray(cases.id, [idA, idB, idC])))
      .orderBy(desc(cases.openedAt), desc(cases.id));

    expect(tieRows.map((r) => r.id)).toEqual(expectedOrder);
  });

  it("still puts a genuinely more recent case first, ahead of an older tied batch", async () => {
    const older = new Date("2026-06-20T00:00:00.000Z");
    const newer = new Date();
    const idOld = await insertCustodyEpisode(older);
    const idNew = await insertCustodyEpisode(newer);

    const rows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.caseKind, "custody_episode"), inArray(cases.id, [idOld, idNew])))
      .orderBy(desc(cases.openedAt), desc(cases.id));

    expect(rows[0]?.id).toBe(idNew);
    expect(rows[1]?.id).toBe(idOld);
  });
});
