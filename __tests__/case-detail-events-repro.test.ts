// Reproduction / regression test for getCaseDetailByPublicCode case_events merge
// (PR-2). Cowork reported /casos/PANO-CASE-DISPUTE-0000 crashing on the
// case_events query inside getCaseDetailByPublicCode (lib/case-queries.ts),
// while a DECOMISO case rendered fine.
//
// The case_events query is IDENTICAL for every case kind — it filters by
// case_id alone and projects a constant 'system' authorRole. A missing/renamed
// column would therefore fail Postgres at PLAN time for BOTH the DISPUTE and the
// DECOMISO case, yet DECOMISO worked. That rules out a code/schema bug and points
// at local DB schema drift in the QA sandbox (consistent with the session-expiry
// and stale-tab caveats in the handoff).
//
// This test pins the merge path against the canonical, fully-migrated test DB:
// a case WITH case_events rows resolves without throwing and surfaces those
// entries in the unified timeline (authorRole 'system'). It is the lasting
// regression guard the 🔴 report deserved — there is no production code change.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { caseEvents, db, organizations } from "@/db";
import { openCase } from "@/lib/infra/case-helpers";
import { getCaseDetailByPublicCode } from "@/lib/infra/case-queries";
import { withMutationOverride } from "./_helpers/db-overrides";

const ORG_TOKEN = "DIM-PR2-CE-ORG";
let caseId: string;
let casePublicCode: string;

beforeAll(async () => {
  // Idempotent cleanup of any leftovers from a prior run.
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`
      DELETE FROM case_events WHERE case_id IN (
        SELECT id FROM cases WHERE opened_by_organization_id IN (
          SELECT id FROM organizations WHERE public_token = ${ORG_TOKEN}
        )
      )
    `);
    await tx.execute(sql`
      DELETE FROM cases WHERE opened_by_organization_id IN (
        SELECT id FROM organizations WHERE public_token = ${ORG_TOKEN}
      )
    `);
    await tx.execute(sql`DELETE FROM organizations WHERE public_token = ${ORG_TOKEN}`);
  });

  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_TOKEN,
      legalName: "PR2 CaseEvents Org SRL",
      displayName: "PR2 CaseEvents Org",
      orgType: "sanitary_authority",
      email: "pr2-ce@dim-test.local",
      verified: true,
    })
    .returning();

  // A pet-less, general-subject case is exactly what case_events exists for
  // (migration 0069 — pet_events.pet_id is NOT NULL, so general cases log here).
  const created = await openCase({
    kind: "bite_incident",
    primarySubjectKind: "general",
    openedByOrganizationId: org.id,
    openedReason: "PR-2 repro: case_events merge",
  });
  caseId = created.id;
  casePublicCode = created.publicCode;

  // Two case_events entries on the case timeline — the rows whose SELECT crashed
  // for Cowork's DISPUTE case.
  await db.insert(caseEvents).values([
    {
      caseId,
      entryType: "classification",
      payload: { note: "primera entrada" },
      notes: "clasificación inicial",
    },
    {
      caseId,
      entryType: "control_action",
      payload: { note: "segunda entrada" },
      notes: "acción de control",
    },
  ]);
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM case_events WHERE case_id = ${caseId}`);
    await tx.execute(sql`UPDATE cases SET welfare_report_id = NULL WHERE id = ${caseId}`);
    await tx.execute(sql`DELETE FROM cases WHERE id = ${caseId}`);
    await tx.execute(sql`DELETE FROM organizations WHERE public_token = ${ORG_TOKEN}`);
  });
});

describe("getCaseDetailByPublicCode — case_events merge (PR-2 repro)", () => {
  it("resolves a case that has case_events rows without throwing", async () => {
    const detail = await getCaseDetailByPublicCode(casePublicCode);
    expect(detail).not.toBeNull();
  });

  it("merges case_events into the unified timeline with authorRole 'system'", async () => {
    const detail = await getCaseDetailByPublicCode(casePublicCode);
    const systemTypes = (detail?.events ?? [])
      .filter((e) => e.authorRole === "system")
      .map((e) => e.eventType);
    // Subset assertion (not exact count): openCase may emit its own case_opened
    // entry, which also projects authorRole 'system'.
    expect(systemTypes).toContain("classification");
    expect(systemTypes).toContain("control_action");
  });
});
