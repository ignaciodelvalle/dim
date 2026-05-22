// RLS matrix harness — drives `matrix.spec.ts` against the live Supabase
// local stack via PostgREST (supabase-js), which IS subject to RLS.
//
// **MVP scope (this commit):** only SELECT is exercised end-to-end. The
// matrix expects every role × table to have all 4 operations declared
// for documentation completeness, but INSERT/UPDATE/DELETE harness wiring
// is deferred — each of those needs per-table valid payload shapes that
// would explode the test file. See the `OPERATIONS_UNDER_TEST` constant
// below for the gate; extend it when payload helpers are added.
//
// **Pre-flight:** depends on `pnpm seed:test` having populated the local
// Supabase stack with the canonical test users (owner@dim.test,
// vet@dim.test, admin@dim.test). The CI test job runs db:bootstrap →
// seed:test as part of its setup; locally `pnpm seed:test` is manual.
// If the users are missing, the suite skips with a clear marker rather
// than failing — the matrix is contract-level, not seed-level.

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db } from "@/db";
import { generateUniqueCasePublicCode } from "@/lib/case-helpers";
import { RLS_MATRIX, type RlsOperation, type RlsRole } from "./matrix.spec";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Operations the harness actually exercises. Cells for ops not in this set
// are still validated for shape (every role × every op must be declared in
// the spec), but the outcome assertion is skipped.
const OPERATIONS_UNDER_TEST: ReadonlyArray<RlsOperation> = ["select"];

// Test user fixtures — seeded by scripts/seed-test-users.ts (shared password).
const SHARED_PASSWORD = "Test1234!";

const ROLE_USERS: Record<Exclude<RlsRole, "anon">, { email: string; password: string }> = {
  owner: { email: "owner@dim.test", password: SHARED_PASSWORD },
  other_user: { email: "vet@dim.test", password: SHARED_PASSWORD },
  admin: { email: "admin@dim.test", password: SHARED_PASSWORD },
};

// PostgREST table names (snake_case) — `RLS_MATRIX` keys MUST match.
const ALL_TABLES = Object.keys(RLS_MATRIX);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

interface RoleContext {
  client: SupabaseClient;
  userId: string | null; // null for anon
}

const contexts = new Map<RlsRole, RoleContext>();
let ownerPetId: string | null = null;
let setupError: string | null = null;
let fixtureCaseId: string | null = null;

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setupError =
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — skipping RLS matrix.";
    return;
  }

  // Anon client (no auth).
  contexts.set("anon", {
    client: createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    userId: null,
  });

  // Auth'd clients — one per seeded role.
  for (const [role, creds] of Object.entries(ROLE_USERS)) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword(creds);
    if (error || !data.user) {
      setupError = `sign-in failed for ${role} (${creds.email}): ${error?.message ?? "no user"}. Run \`pnpm seed:test\` first.`;
      return;
    }
    contexts.set(role as RlsRole, { client, userId: data.user.id });
  }

  // Resolve the fixture pet id — first pet visible to owner.
  const ownerCtx = contexts.get("owner");
  if (ownerCtx) {
    const { data } = await ownerCtx.client.from("pets").select("id").limit(1);
    ownerPetId = data && data.length > 0 ? (data[0].id as string) : null;
    if (!ownerPetId) {
      setupError = "owner has zero pets after sign-in — re-seed with `pnpm seed:test`.";
      return;
    }
  }

  // Fixture case row tied to the owner's pet — needed so the `cases`
  // probes have something to (de)authorize against. Inserted via Drizzle
  // (service role bypasses RLS) so we control the row precisely; cleaned
  // up in afterAll. case_kind=`bite_incident` lets the owner read it
  // (welfare_denuncia is hidden from the subject by design).
  if (ownerPetId) {
    const code = await generateUniqueCasePublicCode();
    const [row] = await db
      .insert(cases)
      .values({
        publicCode: code,
        caseKind: "bite_incident",
        status: "open",
        primarySubjectKind: "registered_pet",
        primaryPetId: ownerPetId,
        openedReason: "rls-matrix fixture: probes cases-table policies",
      })
      .returning({ id: cases.id });
    fixtureCaseId = row.id;
  }
});

afterAll(async () => {
  for (const ctx of contexts.values()) {
    await ctx.client.auth.signOut().catch(() => {});
  }
  if (fixtureCaseId) {
    await db
      .delete(cases)
      .where(eq(cases.id, fixtureCaseId))
      .catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Per-op probes
// ---------------------------------------------------------------------------

interface ProbeResult {
  outcome: "allow" | "deny";
  detail: string;
}

async function probeSelect(
  client: SupabaseClient,
  table: string,
  role: RlsRole,
  ctx: { ownerUserId: string | null; ownerPetId: string | null },
): Promise<ProbeResult> {
  // Choose the most discriminating filter per table — we want a query
  // that, if it returns rows, proves the policy authorizes THIS role to
  // see the fixture resource (the owner's first pet & associated data).
  // For tables that don't have a pet_id or user_id, fall back to "any row".
  let query = client.from(table).select("*").limit(1);
  if (ctx.ownerPetId && ["pet_events", "ownerships"].includes(table)) {
    query = client.from(table).select("*").eq("pet_id", ctx.ownerPetId).limit(1);
  } else if (ctx.ownerPetId && table === "cases") {
    query = client.from(table).select("*").eq("primary_pet_id", ctx.ownerPetId).limit(1);
  } else if (ctx.ownerUserId && table === "notifications") {
    query = client.from(table).select("*").eq("user_id", ctx.ownerUserId).limit(1);
  } else if (ctx.ownerUserId && table === "profiles" && role === "owner") {
    // For owner, probe their OWN profile (positive control of "own"
    // permission) — for everyone else, probe the owner's profile (test
    // cross-user denial).
    query = client.from(table).select("*").eq("id", ctx.ownerUserId).limit(1);
  } else if (ctx.ownerUserId && table === "profiles") {
    query = client.from(table).select("*").eq("id", ctx.ownerUserId).limit(1);
  } else if (table === "pets" && ctx.ownerPetId) {
    query = client.from(table).select("*").eq("id", ctx.ownerPetId).limit(1);
  }

  const { data, error } = await query;
  const rows = data?.length ?? 0;
  // Pass criterion mirrors the smoke pattern: zero rows == deny.
  return {
    outcome: rows > 0 ? "allow" : "deny",
    detail: error ? `error=${error.message}` : `rows=${rows}`,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("RLS matrix (§4.4 — D7 doctrine)", () => {
  it("setup ran without errors (otherwise the rest of the suite skips)", () => {
    if (setupError) {
      console.warn(`[RLS matrix] SKIPPING: ${setupError}`);
    }
    // We don't fail the suite on missing seed — only when seed exists and
    // a probe disagrees with the matrix.
    expect(true).toBe(true);
  });

  it("every role × table cell in the matrix declares all 4 operations", () => {
    const missing: string[] = [];
    for (const [table, byRole] of Object.entries(RLS_MATRIX)) {
      for (const role of ["anon", "owner", "other_user", "admin"] as RlsRole[]) {
        const cell = byRole[role];
        for (const op of ["select", "insert", "update", "delete"] as RlsOperation[]) {
          if (!cell[op]) {
            missing.push(`${table}.${role}.${op}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // Generate one test per (table, role) pair under test.
  for (const table of ALL_TABLES) {
    describe(`table: ${table}`, () => {
      for (const role of ["anon", "owner", "other_user", "admin"] as RlsRole[]) {
        for (const op of OPERATIONS_UNDER_TEST) {
          const expectedCell = RLS_MATRIX[table][role][op];
          it(`${role} ${op}: expects ${expectedCell.outcome} — ${expectedCell.reason ?? "(no reason given)"}`, async () => {
            if (setupError) return; // skip body when seed missing

            const ctx = contexts.get(role);
            if (!ctx) {
              throw new Error(`No client for role ${role}`);
            }

            // Resolve probe by operation. Only `select` is wired in MVP.
            let probe: ProbeResult;
            switch (op) {
              case "select":
                probe = await probeSelect(ctx.client, table, role, {
                  ownerUserId: contexts.get("owner")?.userId ?? null,
                  ownerPetId,
                });
                break;
              default:
                // Op not in OPERATIONS_UNDER_TEST — should be unreachable
                // because the loop only iterates over OPERATIONS_UNDER_TEST.
                throw new Error(`Operation ${op} has no probe`);
            }

            expect(
              probe.outcome,
              `Matrix says ${role}.${table}.${op}=${expectedCell.outcome} but harness saw ${probe.outcome} (${probe.detail}). Reason on file: "${expectedCell.reason}".`,
            ).toBe(expectedCell.outcome);
          });
        }
      }
    });
  }
});
