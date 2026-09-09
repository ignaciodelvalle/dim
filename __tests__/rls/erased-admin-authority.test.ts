// RLS — an ERASED profile is not a platform administrator (migration 0215).
//
// WHAT THIS DEFENDS
// -----------------
// `profiles` carries two lifecycle markers that mean different things: a
// deactivation sets `deactivated_at`; a Ley 25.326 art. 16 erasure
// (`erase_subject_data`) sets `deleted_at` and hashes every PII column. Every
// predicate that decided "is this caller a platform admin" tested
// `deactivated_at` — or nothing — and never `deleted_at`. An administrator who
// exercised their OWN erasure therefore kept administrative authority at the
// database layer: every admin-branch RLS policy still matched, `can_read_case`
// still returned true, and `pii.caller_is_admin` — the guard that lets a
// non-subject run export_subject_data / erase_subject_data on someone else —
// still said yes. The application layer bounces an erased SESSION off every
// page (requireLiveUser → ACCOUNT_ERASED), but a bearer token already issued
// keeps talking to PostgREST and to the RPCs directly until it expires.
//
// THE PROBE IS THE ATTACK. One ephemeral institutional admin, provisioned here
// through the admin SDK + the handle_new_user trigger and promoted over
// Drizzle (BYPASSRLS), signs in ONCE and keeps that session for the whole
// file. Three states, same token:
//   1. LIVE      — the control. Every read below must return the fixture row,
//                  and both functions must say true. Without this, a zero in
//                  state 2 would prove nothing (the matrix's anon row passed
//                  for months on exactly that vacuity — matrix.test.ts:704).
//   2. ERASED    — `deleted_at` set, `deactivated_at` still NULL, which is the
//                  state erase_subject_data leaves. Every read must return
//                  ZERO rows and both functions must say false.
//   3. RESTORED  — `deleted_at` cleared again. Everything comes back, which
//                  pins the refusal on the marker and not on the session.
//
// Four surfaces, chosen to cover both pre-0215 classes:
//   · cron_runs           policy that checked deactivated_at only
//   · audit_log           policy that checked NEITHER marker (actor NULL, so
//                         only the admin branch can serve the row)
//   · can_read_case       the function db/cases_rls.sql owns (:49)
//   · pii.caller_is_admin the subject-rights RPC guard
//
// The catalog-level fence (every predicate carries both markers) lives in
// __tests__/rls/coverage.test.ts and scripts/check-rls-coverage.ts check 5;
// this file is the behavioural half.
//
// PRE-FLIGHT: local Supabase stack, .env.local loaded. Setup failures THROW —
// never a green skip.

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUDIT_LOG_ACTIONS,
  auditLog,
  cases,
  cronRuns,
  db,
  notifications,
  pets,
  profiles,
} from "@/db";
import { generateUniqueCasePublicCode } from "@/lib/infra/case-helpers";
import { setAuditMutationGucs } from "../_helpers/db-overrides";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ADMIN_EMAIL = "erased-admin-probe@dim-test.local";
const ADMIN_PASSWORD = "ErasedAdminProbe_2026!";
const PET_TOKEN = "DIM-ERAD-0001";
const CRON_NAME = "erased-admin-probe";

let adminClient: SupabaseClient | null = null;
let adminUserId = "";
let petId = "";
let caseId = "";
let cronRunId = "";
let auditRowId = "";
let setupError: string | null = null;

function adminSdk(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function deleteFixture(): Promise<void> {
  await db.delete(cases).where(eq(cases.openedReason, "erased-admin-authority fixture"));
  await db.delete(pets).where(eq(pets.publicToken, PET_TOKEN));
  await db.delete(cronRuns).where(eq(cronRuns.cronName, CRON_NAME));

  const admin = adminSdk();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === ADMIN_EMAIL);

  // The audit fixture row has a NULL actor on purpose; find it by payload.
  await db.transaction(async (tx) => {
    await setAuditMutationGucs(tx);
    await tx.execute(
      sql`DELETE FROM audit_log WHERE payload->>'fixture' = 'erased-admin-authority'`,
    );
    if (found) {
      await tx.delete(auditLog).where(eq(auditLog.actorUserId, found.id));
      await tx.delete(auditLog).where(eq(auditLog.targetUserId, found.id));
    }
  });
  if (!found) return;
  await db.delete(notifications).where(eq(notifications.userId, found.id));
  await db.delete(profiles).where(eq(profiles.id, found.id));
  await admin.auth.admin.deleteUser(found.id);
}

/**
 * A PostgREST credential that never reached a policy returns an empty result
 * too — and an empty result is exactly what the ERASED probes read as
 * "refused". Scoring a rejected key as a refusal is how the anon row of the
 * RLS matrix passed for months without evaluating a policy (matrix.test.ts:704).
 */
function assertCredentialReachedRls(error: { code?: string; message: string } | null): void {
  if (!error) return;
  const credentialRejected =
    error.code?.startsWith("PGRST30") || /JWT|API key/i.test(error.message);
  if (!credentialRejected) return;
  throw new Error(
    `The probe never reached a policy — PostgREST rejected the CREDENTIAL (${error.code ?? "no code"}: ${error.message}). This is NOT a refusal. Check NEXT_PUBLIC_SUPABASE_ANON_KEY against \`supabase status -o env\`.`,
  );
}

function client(): SupabaseClient {
  if (setupError) throw new Error(setupError);
  if (!adminClient) throw new Error("admin client not provisioned");
  return adminClient;
}

async function rowsVisible(table: "cron_runs" | "audit_log", id: string): Promise<number> {
  const { data, error } = await client().from(table).select("id").eq("id", id);
  assertCredentialReachedRls(error);
  if (error) throw new Error(`${table} probe errored: ${error.message}`);
  return (data ?? []).length;
}

async function canReadCase(): Promise<boolean> {
  const rows = (await db.execute(
    sql`select public.can_read_case(${caseId}::uuid, ${adminUserId}::uuid) as ok`,
  )) as unknown as Array<{ ok: boolean }>;
  return rows[0]?.ok === true;
}

async function callerIsAdmin(): Promise<boolean> {
  const rows = (await db.execute(
    sql`select pii.caller_is_admin(${adminUserId}::uuid) as ok`,
  )) as unknown as Array<{ ok: boolean }>;
  return rows[0]?.ok === true;
}

async function setDeletedAt(value: Date | null): Promise<void> {
  await db.update(profiles).set({ deletedAt: value }).where(eq(profiles.id, adminUserId));
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    setupError =
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing — no PostgREST to probe.";
    throw new Error(setupError);
  }

  await deleteFixture();

  const created = await adminSdk().auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    setupError = `createUser(${ADMIN_EMAIL}) failed: ${created.error?.message ?? "no user"}`;
    throw new Error(setupError);
  }
  adminUserId = created.data.user.id;

  // handle_new_user creates (owner, personal). Promote over Drizzle — the only
  // legitimate writer of these columns (migration 0211). deactivated_at stays
  // NULL throughout: the state under test is erased-but-not-deactivated.
  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional", displayName: "Erased admin probe" })
    .where(eq(profiles.id, adminUserId));

  const [cron] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "ok", details: { fixture: "erased-admin-authority" } })
    .returning({ id: cronRuns.id });
  cronRunId = cron.id;

  // actor NULL: the "actor_user_id = auth.uid()" branch can never match this
  // row, so a read can only come from the admin branch under test.
  const [audit] = await db
    .insert(auditLog)
    .values({
      actorUserId: null,
      action: AUDIT_LOG_ACTIONS[0],
      payload: { fixture: "erased-admin-authority" },
    })
    .returning({ id: auditLog.id });
  auditRowId = audit.id;

  const [pet] = await db
    .insert(pets)
    .values({ publicToken: PET_TOKEN, name: "Erased-admin probe pet", species: "dog" })
    .returning({ id: pets.id });
  petId = pet.id;

  // No ownership, no jurisdiction on purpose: the admin branch is the ONLY
  // branch of can_read_case that can say yes for this caller.
  const [row] = await db
    .insert(cases)
    .values({
      publicCode: await generateUniqueCasePublicCode(),
      caseKind: "bite_incident",
      status: "open",
      primarySubjectKind: "registered_pet",
      primaryPetId: petId,
      openedReason: "erased-admin-authority fixture",
    })
    .returning({ id: cases.id });
  caseId = row.id;

  adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authErr } = await adminClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authErr || !auth.user) {
    setupError = `sign-in failed for ${ADMIN_EMAIL}: ${authErr?.message ?? "no user"}`;
    throw new Error(setupError);
  }
}, 30_000);

afterAll(async () => {
  await adminClient?.auth.signOut().catch(() => {});
  await deleteFixture();
});

describe("erased admin — LIVE control: the session and the fixtures really reach the admin branch", () => {
  it("reads the cron_runs fixture through PostgREST (deactivated_at-only policy class)", async () => {
    expect(
      await rowsVisible("cron_runs", cronRunId),
      "a LIVE institutional admin cannot read cron_runs — every refusal below would be vacuous",
    ).toBe(1);
  });

  it("reads the actor-less audit_log fixture through PostgREST (neither-marker policy class)", async () => {
    expect(
      await rowsVisible("audit_log", auditRowId),
      "a LIVE admin cannot read an actor-less audit row — the admin branch is not what is being measured",
    ).toBe(1);
  });

  it("can_read_case says yes for the case it has no other relation to", async () => {
    expect(await canReadCase()).toBe(true);
  });

  it("pii.caller_is_admin says yes", async () => {
    expect(await callerIsAdmin()).toBe(true);
  });
});

describe("erased admin — deleted_at set, deactivated_at NULL (what erase_subject_data leaves)", () => {
  beforeAll(async () => {
    await setDeletedAt(new Date());
    // Ground truth, so a passing refusal below cannot be an unset marker.
    const [row] = await db
      .select({ deletedAt: profiles.deletedAt, deactivatedAt: profiles.deactivatedAt })
      .from(profiles)
      .where(eq(profiles.id, adminUserId));
    if (!row?.deletedAt || row.deactivatedAt !== null) {
      throw new Error("fixture is not in the erased-but-not-deactivated state");
    }
  });

  it("is refused the cron_runs fixture — the same session that just read it", async () => {
    expect(
      await rowsVisible("cron_runs", cronRunId),
      "an ERASED admin still reads cron_runs — the policy checks deactivated_at but not deleted_at",
    ).toBe(0);
  });

  it("is refused the audit_log fixture", async () => {
    expect(
      await rowsVisible("audit_log", auditRowId),
      "an ERASED admin still reads the audit log — the policy checks neither marker",
    ).toBe(0);
  });

  it("can_read_case says no", async () => {
    expect(
      await canReadCase(),
      "can_read_case still grants universal scope to an erased admin (db/cases_rls.sql:49)",
    ).toBe(false);
  });

  it("pii.caller_is_admin says no — the erasure RPCs no longer accept it as a non-subject caller", async () => {
    expect(
      await callerIsAdmin(),
      "an erased admin can still run export_subject_data / erase_subject_data on every other person",
    ).toBe(false);
  });
});

describe("erased admin — RESTORED: the refusal was the marker, not the session", () => {
  beforeAll(async () => {
    await setDeletedAt(null);
  });

  it("reads both fixtures again and both functions say yes again", async () => {
    expect(await rowsVisible("cron_runs", cronRunId)).toBe(1);
    expect(await rowsVisible("audit_log", auditRowId)).toBe(1);
    expect(await canReadCase()).toBe(true);
    expect(await callerIsAdmin()).toBe(true);
  });
});
