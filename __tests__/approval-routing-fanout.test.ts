// findAuthoritiesForJurisdiction — the two failures that were invisible.
//
// WHY THIS FILE EXISTS (routing audit, 2026-08-17 — engram onboarding/ruteo-y-fallback)
// ---------------------------------------------------------------------------
// The system has exactly ONE good notification fallback: this resolver routes to
// the jurisdiction's govt operators and, failing that, to every active
// institutional admin. Seventeen call sites depend on it. Two structural defects
// went around it, and BOTH were undetectable from inside the product:
//
//   1. THE WHOLE-PROVINCE OPERATOR WAS INVISIBLE TO THE WRITER. The locality was
//      matched with plain equality, while "covers the whole province" is stored
//      as the `""` sentinel (or, in CABA, the INDEC whole-city entry). The READ
//      side was taught this in July — jurisdictionPairClause, approval-scope,
//      case-queries — so a province-wide operator SAW the bite / denuncia /
//      request sitting in her queue and was NEVER notified about it, while the
//      resolver concluded "no govt covers this locality" and paged national
//      admins. Nothing in the product could show the difference: the row was
//      there, the queue worked, only the notification never happened.
//
//   2. AN EMPTY FAN-OUT LEFT NO TRACE AT ALL. When the resolver returned zero
//      users, the recipients loop ran zero times, the action returned ok, and
//      nothing was written anywhere — no notification, no audit row, no cron
//      alert. It was the only failure in the system with no evidence of its own,
//      which is exactly why it would be the last one anyone ever found.
//
// These are integration tests on purpose. Both defects lived in the SQL, not in
// the branching: a mocked resolver would have agreed with the buggy version.

import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, db, govtAssignments, profiles } from "@/db";
import { WHOLE_PROVINCE_SENTINEL } from "@/lib/domain/jurisdiction-canonical";
import { findAuthoritiesForJurisdiction } from "@/lib/infra/approval-routing";
import { setAuditMutationGucs } from "./_helpers/db-overrides";

// A province nothing else in the seeds operates in, so the fixtures below are
// the ONLY active assignments the resolver can find there.
const PROVINCE = "Tierra del Fuego";
const LOCALITY = "Ushuaia";
const OTHER_LOCALITY = "Río Grande";

// Deterministic ids — greppable in a failed run, and unique enough to clean up.
const WHOLE_PROVINCE_GOVT_ID = "d1a90000-0000-4000-8000-00000000fa01";
const LOCALITY_GOVT_ID = "d1a90000-0000-4000-8000-00000000fa02";

const FIXTURE_IDS = [WHOLE_PROVINCE_GOVT_ID, LOCALITY_GOVT_ID];
const TRACE_ROUTE = "test_empty_fanout";

async function activeInstitutionalAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function cleanup() {
  for (const id of FIXTURE_IDS) {
    await db.delete(govtAssignments).where(eq(govtAssignments.userId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  await db.transaction(async (tx) => {
    await setAuditMutationGucs(tx);
    await tx
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.action, "notification_fanout_empty"),
          sql`${auditLog.payload}->>'route' = ${TRACE_ROUTE}`,
        ),
      );
  });
}

beforeAll(async () => {
  await cleanup();

  await db.insert(profiles).values([
    {
      id: WHOLE_PROVINCE_GOVT_ID,
      displayName: "routing-fixture-whole-province-govt",
      role: "govt",
      accountType: "institutional",
    },
    {
      id: LOCALITY_GOVT_ID,
      displayName: "routing-fixture-locality-govt",
      role: "govt",
      accountType: "institutional",
    },
  ]);
});

afterAll(cleanup);

describe("findAuthoritiesForJurisdiction — whole-province subsumption (writer side)", () => {
  it("notifies the WHOLE-PROVINCE operator about a locality-level event inside her province", async () => {
    await db.insert(govtAssignments).values({
      userId: WHOLE_PROVINCE_GOVT_ID,
      jurisdictionProvince: PROVINCE,
      // "Toda la provincia" — the same sentinel describeMandate, censusEligibleProvince
      // and jurisdictionPairClause have honoured since D3 (2026-08-04).
      jurisdictionLocality: WHOLE_PROVINCE_SENTINEL,
    });

    const recipients = await findAuthoritiesForJurisdiction({
      province: PROVINCE,
      locality: LOCALITY,
    });

    // THE BUG: this used to be the admin list, because plain `eq(locality, 'Ushuaia')`
    // matched no assignment and the resolver fell through to the national fallback.
    expect(recipients).toContain(WHOLE_PROVINCE_GOVT_ID);

    // And she is the ONLY recipient: a covering govt exists, so admins are not
    // paged. This is the half that proves the fallback did not merely also fire.
    const admins = await activeInstitutionalAdminIds();
    expect(recipients.filter((id) => admins.includes(id))).toEqual([]);
  });

  it("a LOCALITY-specific assignment never widens to a sibling locality", async () => {
    await db.insert(govtAssignments).values({
      userId: LOCALITY_GOVT_ID,
      jurisdictionProvince: PROVINCE,
      jurisdictionLocality: LOCALITY,
    });

    const recipients = await findAuthoritiesForJurisdiction({
      province: PROVINCE,
      locality: OTHER_LOCALITY,
    });

    // Subsumption goes UP (locality → whole province), never sideways. The
    // Ushuaia operator must not be paged about Río Grande.
    expect(recipients).not.toContain(LOCALITY_GOVT_ID);
    // The whole-province operator still covers it — that is the point.
    expect(recipients).toContain(WHOLE_PROVINCE_GOVT_ID);
  });

  it("a REVOKED whole-province assignment stops covering the province", async () => {
    await db
      .update(govtAssignments)
      .set({ revokedAt: new Date() })
      .where(eq(govtAssignments.userId, WHOLE_PROVINCE_GOVT_ID));

    const recipients = await findAuthoritiesForJurisdiction({
      province: PROVINCE,
      locality: OTHER_LOCALITY,
    });

    expect(recipients).not.toContain(WHOLE_PROVINCE_GOVT_ID);
  });
});

describe("findAuthoritiesForJurisdiction — an empty fan-out leaves a trace", () => {
  it("writes a notification_fanout_empty audit row when NOBODY can be reached", async () => {
    // The fallback is global by construction, so the only way to observe an
    // empty fan-out is to make the fallback empty. Deactivate every active
    // institutional admin for the length of one call and put them back.
    // (The db project runs with fileParallelism:false, so nothing else is
    // reading profiles while this window is open.)
    const admins = await activeInstitutionalAdminIds();
    expect(
      admins.length,
      "expected at least one active institutional admin in the local DB — run pnpm db:bootstrap",
    ).toBeGreaterThan(0);

    const before = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "notification_fanout_empty"));

    let recipients: string[] = [];
    try {
      for (const id of admins) {
        await db.update(profiles).set({ deactivatedAt: new Date() }).where(eq(profiles.id, id));
      }

      recipients = await findAuthoritiesForJurisdiction(
        // A province with no active assignment left (the whole-province fixture
        // was revoked above) — govt-first finds nobody either.
        { province: PROVINCE, locality: OTHER_LOCALITY },
        { route: TRACE_ROUTE },
      );
    } finally {
      for (const id of admins) {
        await db.update(profiles).set({ deactivatedAt: null }).where(eq(profiles.id, id));
      }
    }

    expect(recipients).toEqual([]);

    const after = await db
      .select({ id: auditLog.id, payload: auditLog.payload, actorUserId: auditLog.actorUserId })
      .from(auditLog)
      .where(eq(auditLog.action, "notification_fanout_empty"));

    // The whole deliverable in one assertion: the fan-out reached nobody AND
    // said so.
    expect(after.length).toBe(before.length + 1);

    const row = after.find((r) => !before.some((b) => b.id === r.id));
    expect(row).toBeDefined();
    const payload = row?.payload as Record<string, unknown>;
    expect(payload.route).toBe(TRACE_ROUTE);
    expect(payload.province).toBe(PROVINCE);
    expect(payload.locality).toBe(OTHER_LOCALITY);
    expect(payload.reason).toBe("no_govt_no_admin");
    // No human acted — the row exists precisely because the system produced no
    // recipient. The FK is nullable for system writers like this one.
    expect(row?.actorUserId).toBeNull();
  });

  it("writes NO row when the admin fallback DOES reach somebody", async () => {
    // The fallback firing is a success, not a gap: a row here would drown the
    // real signal in noise from every unseeded locality in the country.
    const before = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "notification_fanout_empty"));

    const recipients = await findAuthoritiesForJurisdiction(
      { province: PROVINCE, locality: OTHER_LOCALITY },
      { route: TRACE_ROUTE },
    );
    expect(recipients.length).toBeGreaterThan(0);

    const after = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "notification_fanout_empty"));
    expect(after.length).toBe(before.length);
  });
});
