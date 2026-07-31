// RLS matrix harness — drives `matrix.data.ts` against the live Supabase
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
//
// **A SETUP FAILURE FAILS THE SUITE (P2.8, 2026-07-31).** This header used to
// say the suite "skips with a clear marker rather than failing — the matrix is
// contract-level, not seed-level", and the code backed that up: `setupError`
// was `console.warn`ed and every matrix cell `return`ed before asserting. The
// consequence was measured on 2026-07-30 — the whole file printed GREEN while
// asserting NOTHING about RLS (the skipped cells run in 0 ms, a real probe
// takes 3-4 ms). A security matrix that passes without probing is worse than no
// matrix: it is a gate that reports "authorization verified" when nothing was.
//
// There is deliberately NO CI-vs-local split. "Only local degrades to a skip"
// is exactly how the 2026-07-30 fixture collision survived: the only gate a
// human runs before pushing was the one that stopped checking. Missing env,
// missing seed users, or a fixture that cannot be provisioned now throw out of
// `beforeAll` with the cause in the message.

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cases,
  db,
  ownerships,
  petAchievementViews,
  petEvents,
  petIdentifications,
  petTransfers,
  pets,
} from "@/db";
import { generateUniqueCasePublicCode } from "@/lib/infra/case-helpers";
import {
  findBlockingTransfers,
  selectPetsWithoutPendingTransfer,
} from "../../scripts/seed-transfer-guards";
import { withMutationOverride } from "../_helpers/db-overrides";
import { RLS_MATRIX, type RlsOperation, type RlsRole } from "./matrix.data";

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

// How many (table × role × operation) probes the generated block below runs.
// Derived, not hardcoded: the number was 44 on 2026-07-31 and moves the moment
// a table joins RLS_MATRIX or a second operation is wired.
const MATRIX_CELL_COUNT = ALL_TABLES.length * 4 * OPERATIONS_UNDER_TEST.length;

/**
 * The single message a setup failure produces.
 *
 * ONE loud failure, not `MATRIX_CELL_COUNT` of them, is the deliberate choice:
 * a red matrix cell means "the live policy disagrees with the declared
 * contract", which is a security regression and a completely different
 * diagnosis from "the fixtures never got built". Printing the second as
 * dozens of copies of the first buries the actual cause under a wall of
 * identical "expected allow, saw deny" and trains readers to skim the file
 * that is supposed to be unskimmable. So the failure is raised once, out of
 * `beforeAll`, and it NAMES the cause.
 *
 * The per-cell guards still throw this same message rather than returning
 * (see the probe block). That costs nothing when `beforeAll` already threw —
 * those tests never run — and it is the backstop that matters: `setupError` is
 * mutable module state, so if a future edit reintroduces a soft path into it,
 * no cell can go back to passing without probing.
 */
function setupFailureMessage(cause: string): string {
  return `RLS matrix setup FAILED — refusing to report ${MATRIX_CELL_COUNT} green cells that probed nothing. Cause: ${cause}`;
}

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
let fixtureAchievementViewId: string | null = null;
// Fixture pet_transfers row. The owner/admin SELECT cells were corrected to
// `allow` (matrix.data.ts) once someone noticed they only said `deny` because
// the table happened to be empty — but no fixture followed, so on a database
// where nothing had created a transfer the harness read `deny` again and the
// two cells failed. That is the same accident with the sign flipped: a security
// cell whose verdict depends on whether rows happen to exist is not measuring a
// policy. Self-provisioned here, like the cases / achievement-view /
// identification fixtures above, and cleaned up in afterAll.
//
// A15 / P2.2 — IT NEEDS ITS OWN PET, not `ownerPetId`.
//
// migration 0054 declares a PARTIAL UNIQUE index,
//   pet_transfers_one_pending_per_pet ON pet_transfers(pet_id) WHERE status='pending',
// and this fixture inserts a PENDING row. Attaching it to the shared
// `ownerPetId` made the whole matrix die in beforeAll on any database where
// something else had already opened a transfer on that pet — measured
// 2026-07-30: the demo seed's PTR-D2TZ-JGR4 on DIM-DEMO-0001. CI never saw it
// (it bootstraps clean and creates no transfers), so the only gate that broke
// was the one a human runs before pushing, which is how work gets pushed
// unverified.
//
// "Pick a different owner pet" is NOT a fix here, and the measurement says so:
// on a bootstrapped+demo local database owner@dim.test owns exactly ONE active
// pet, the one carrying the transfer. A filter would correctly find no
// candidate and the suite would degrade to a 44-cell silent skip — green, and
// asserting nothing. Deleting the demo transfer is worse still: that is
// mutating data to fit a test.
//
// (P2.8 has since removed the silent-skip half of that outcome: a setup error
// now throws. The fixture reasoning is unchanged and still preferable — a suite
// that goes red because a filter found no candidate is a suite nobody can run.)
//
// So the transfer fixture self-provisions a DEDICATED pet, exactly like the
// welfare-bridge and clean-events fixtures below do for their own drift
// problems. The pet is created here, used only here, and dropped in afterAll,
// which makes "no pending transfer on it" true by construction.
//
// The `NOT EXISTS` guard from scripts/seed-transfer-guards.ts still runs over
// that pet before the insert. It is not ceremony: afterAll's deletes are
// `.catch(() => {})`, so a crashed run CAN leave a fixture transfer behind, and
// the guard turns that into a named setup error instead of a raw unique-index
// violation. `findBlockingTransfers` then re-checks through a different query
// shape, so the guard cannot certify its own bugs.
//
// NOT ordering — A8's lesson: adding an ORDER BY to a colliding pick converts
// an intermittent failure into a 100% one. Deterministic ≠ correct. The
// exclusion is the guard.
let transferFixturePetId: string | null = null;
let transferFixtureOwnershipId: string | null = null;
let fixtureTransferId: string | null = null;
let fixtureIdentificationId: string | null = null;
// pet-document-redesign REQ-1.2/1.3 (migration 0115) fixtures. Uses a
// DEDICATED second pet (not `ownerPetId`) so its case-attached pet_events
// don't leak into the generic `table: pet_events` probes above, which grant
// admin an `allow` for ANY case-attached event via the pre-existing
// `can_read_case` OR-branch (admin has universal case read) — colliding with
// the generic matrix's `admin.pet_events.select = deny` expectation, which
// assumes zero case-attached events exist on the shared fixture pet.
let welfareBridgePetId: string | null = null;
let welfareBridgeOwnershipId: string | null = null;
let fixtureWelfareCaseId: string | null = null;
let fixtureWelfareBridgeEventId: string | null = null;
let fixtureNormalEventId: string | null = null;
// Dedicated CASE-FREE pet for the generic `pet_events` probes. The shared
// `ownerPetId` fixture belongs to the seeded demo world, and seed evolution
// (e.g. seed-demo-spine's "denuncia con mascota vinculada") can attach a case
// to one of its events at any time — which flips the admin probe to `allow`
// through the legitimate `can_read_case` OR-branch and breaks the
// `admin.pet_events.select = deny` cell, whose real meaning is "admin has NO
// RLS path to a NON-case-attached event". Probing a pet this test creates and
// fully controls (one plain event, never a case) makes the cell assert
// exactly that, immune to seed-data drift. Cleaned up in afterAll.
let cleanEventsPetId: string | null = null;
let cleanEventsOwnershipId: string | null = null;
let cleanEventsEventId: string | null = null;

/**
 * Provision the pet_transfers fixture: a DEDICATED pet owned by the owner, plus
 * ONE pending transfer owner → admin. Returns a setup-error string, or null on
 * success. See the `transferFixturePetId` docblock for the full rationale.
 */
async function provisionTransferFixture(): Promise<string | null> {
  const ownerCtxForTransfer = contexts.get("owner");
  const adminCtxForTransfer = contexts.get("admin");
  if (!ownerCtxForTransfer?.userId || !adminCtxForTransfer?.userId) return null;

  const [transferPetRow] = await db
    .insert(pets)
    .values({
      publicToken: `DIM-RLSTRF-${Date.now().toString(36).toUpperCase()}`,
      name: "RLS Matrix Transfer Fixture Pet",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
    })
    .returning({ id: pets.id });
  transferFixturePetId = transferPetRow.id;

  const [transferOwnershipRow] = await db
    .insert(ownerships)
    .values({
      petId: transferFixturePetId,
      ownerUserId: ownerCtxForTransfer.userId,
      role: "owner",
    })
    .returning({ id: ownerships.id });
  transferFixtureOwnershipId = transferOwnershipRow.id;

  // NOT EXISTS over pet_transfers_one_pending_per_pet's own predicate. A pet
  // created two statements ago cannot have one — unless a previous crashed run
  // leaked a fixture row onto a recycled id, which is precisely the case worth
  // NAMING instead of hitting as a raw unique-index violation.
  const legalTargets = await selectPetsWithoutPendingTransfer([transferFixturePetId]);
  if (legalTargets.length === 0) {
    return "the transfer fixture's own pet already carries a pending transfer — pet_transfers_one_pending_per_pet would reject the insert. Leftovers from a crashed run: DELETE FROM pet_transfers WHERE public_token LIKE 'TRF-RLSFIX-%'.";
  }
  // Independent oracle — a different query shape, so the guard cannot certify
  // its own bugs.
  const blocking = await findBlockingTransfers(transferFixturePetId);
  if (blocking.length > 0) {
    return `scripts/seed-transfer-guards.ts offered a pet that already has a pending transfer (${blocking
      .map((t) => t.publicToken)
      .join(", ")}) — it is out of sync with pet_transfers_one_pending_per_pet.`;
  }

  const [transferRow] = await db
    .insert(petTransfers)
    .values({
      publicToken: `TRF-RLSFIX-${Date.now().toString(36).toUpperCase()}`,
      petId: transferFixturePetId,
      fromOwnerId: ownerCtxForTransfer.userId,
      toOwnerId: adminCtxForTransfer.userId,
      toOwnerEmail: ROLE_USERS.admin.email,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: petTransfers.id });
  fixtureTransferId = transferRow?.id ?? null;
  return null;
}

/**
 * Provision every fixture. Records the first blocking problem in `setupError`
 * and returns; the `beforeAll` wrapper below turns that into a thrown failure.
 * Split out so each guard can keep its early `return` (there is nothing left to
 * provision once one fails) without any of them being able to decide that the
 * run is allowed to continue quietly.
 */
async function runSetup(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setupError =
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — the harness cannot reach PostgREST, so no policy can be probed. Load the local env before running this file.";
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

  // Resolve the fixture pet id — the first owner-visible pet WITHOUT an
  // open bite_incident case. The old "first pet" pick collided with the
  // partial unique index cases_open_per_pet_kind_idx whenever local QA had
  // left an open bite case on that pet (e.g. CAS-3KRJ-433G on the 2026-07-03
  // smoke run) — seed/QA residue must never fail this fixture.
  const ownerCtx = contexts.get("owner");
  if (ownerCtx) {
    // status='active' only: a LOST pet's disclosure policies deliberately
    // widen visibility (public credential, finder flows), which flips the
    // deny probes for other_user/admin — the matrix asserts the BASELINE
    // posture, so the fixture pet must be in the baseline state.
    //
    // Ordered so the candidate WINDOW is stable too: an unordered LIMIT is
    // answered in physical heap order, which moves as other suites UPDATE pets.
    const { data } = await ownerCtx.client
      .from("pets")
      .select("id,status,public_token")
      .eq("status", "active")
      .order("public_token", { ascending: true })
      .limit(20);
    const candidateIds = (data ?? []).map((r) => r.id as string);
    if (candidateIds.length === 0) {
      setupError = "owner has zero ACTIVE pets after sign-in — re-seed with `pnpm seed:test`.";
      return;
    }
    const openBite = await db
      .select({ petId: cases.primaryPetId })
      .from(cases)
      .where(
        and(
          inArray(cases.primaryPetId, candidateIds),
          eq(cases.caseKind, "bite_incident"),
          eq(cases.status, "open"),
        ),
      );
    const busy = new Set(openBite.map((r) => r.petId));
    ownerPetId = candidateIds.find((id) => !busy.has(id)) ?? null;
    if (!ownerPetId) {
      setupError =
        "every owner pet already has an open bite_incident case — close one or re-seed with `pnpm seed:test`.";
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

  // Fixture pet_achievement_views row — needed so the SELECT probe can
  // assert `allow` for the owner role (owner sees own pulse rows). Inserted
  // via Drizzle (service role bypasses RLS); cleaned up in afterAll.
  const ownerCtxForAv = contexts.get("owner");
  if (ownerPetId && ownerCtxForAv?.userId) {
    const [avRow] = await db
      .insert(petAchievementViews)
      .values({
        userId: ownerCtxForAv.userId,
        petId: ownerPetId,
        achievementId: "rls-matrix-fixture",
      })
      .onConflictDoNothing()
      .returning({ id: petAchievementViews.id });
    fixtureAchievementViewId = avRow?.id ?? null;
  }

  const transferSetupError = await provisionTransferFixture();
  if (transferSetupError) {
    setupError = transferSetupError;
    return;
  }

  // Fixture pet_identifications row — the probe used to rely on SEEDED
  // identifications for the owner pet, and the S002 cache-integrity cleanup
  // (task #36) legitimately deleted cache rows without microchip events,
  // silently flipping the owner/admin allow probes to deny. Self-provision
  // instead (service role bypasses RLS; bare cache row is fine here — this
  // table probes POLICIES, not projection integrity). Cleaned up in afterAll.
  if (ownerPetId) {
    const [idRow] = await db
      .insert(petIdentifications)
      .values({
        petId: ownerPetId,
        // collar_tag: exempt from chip_requires_iso_fields — we probe POLICIES,
        // not chip semantics.
        kind: "collar_tag",
        code: "RLS-MATRIX-FIXTURE-CHIP",
        status: "active",
        recordedAt: new Date().toISOString().slice(0, 10),
      })
      .onConflictDoNothing()
      .returning({ id: petIdentifications.id });
    fixtureIdentificationId = idRow?.id ?? null;
  }

  // Fixture welfare_denuncia case + bridge pet_event, tied to a DEDICATED
  // second owner pet — needed so the pet_events welfare-bridge probes
  // (migration 0115, REQ-1.2/1.3) have something to (de)authorize against
  // without perturbing the generic `ownerPetId` probes above. Inserted via
  // Drizzle (service role bypasses RLS/append-only trigger); cleaned up in
  // afterAll. Also inserts a plain normal event with no case_id as the
  // regression control (owner must still see their own normal events).
  const ownerCtxForWelfare = contexts.get("owner");
  if (ownerCtxForWelfare?.userId) {
    const [petRow] = await db
      .insert(pets)
      .values({
        publicToken: `DIM-RLSMTX-${Date.now().toString(36).toUpperCase()}`,
        name: "RLS Matrix Welfare Fixture Pet",
        species: "dog",
        sex: "female",
        potentiallyDangerousBreed: false,
      })
      .returning({ id: pets.id });
    welfareBridgePetId = petRow.id;

    const [ownershipRow] = await db
      .insert(ownerships)
      .values({
        petId: welfareBridgePetId,
        ownerUserId: ownerCtxForWelfare.userId,
        role: "owner",
      })
      .returning({ id: ownerships.id });
    welfareBridgeOwnershipId = ownershipRow.id;

    const code = await generateUniqueCasePublicCode();
    const [welfareRow] = await db
      .insert(cases)
      .values({
        publicCode: code,
        caseKind: "welfare_denuncia",
        status: "open",
        primarySubjectKind: "registered_pet",
        primaryPetId: welfareBridgePetId,
        openedReason:
          "rls-matrix fixture: pet_events welfare-bridge-event hidden-from-subject probe",
      })
      .returning({ id: cases.id });
    fixtureWelfareCaseId = welfareRow.id;

    const [bridgeEventRow] = await db
      .insert(petEvents)
      .values({
        petId: welfareBridgePetId,
        eventType: "maltreatment_reported",
        occurredAt: new Date(),
        caseId: fixtureWelfareCaseId,
        authorRole: "owner",
        payload: {},
      })
      .returning({ id: petEvents.id });
    fixtureWelfareBridgeEventId = bridgeEventRow.id;

    const [normalEventRow] = await db
      .insert(petEvents)
      .values({
        petId: welfareBridgePetId,
        eventType: "note_added",
        occurredAt: new Date(),
        authorRole: "owner",
        payload: { text: "rls-matrix fixture: normal event, no case_id" },
      })
      .returning({ id: petEvents.id });
    fixtureNormalEventId = normalEventRow.id;

    // Dedicated case-free pet + one plain event for the generic pet_events
    // probes (see cleanEventsPetId declaration for the WHY).
    const [cleanPetRow] = await db
      .insert(pets)
      .values({
        publicToken: `DIM-RLSCLN-${Date.now().toString(36).toUpperCase()}`,
        name: "RLS Matrix Clean Events Pet",
        species: "dog",
        sex: "male",
        potentiallyDangerousBreed: false,
      })
      .returning({ id: pets.id });
    cleanEventsPetId = cleanPetRow.id;

    const [cleanOwnershipRow] = await db
      .insert(ownerships)
      .values({
        petId: cleanEventsPetId,
        ownerUserId: ownerCtxForWelfare.userId,
        role: "owner",
      })
      .returning({ id: ownerships.id });
    cleanEventsOwnershipId = cleanOwnershipRow.id;

    const [cleanEventRow] = await db
      .insert(petEvents)
      .values({
        petId: cleanEventsPetId,
        eventType: "note_added",
        occurredAt: new Date(),
        authorRole: "owner",
        payload: { text: "rls-matrix fixture: case-free event for generic pet_events probes" },
      })
      .returning({ id: petEvents.id });
    cleanEventsEventId = cleanEventRow.id;
  }
}

beforeAll(async () => {
  await runSetup();
  // P2.8 — the whole point. A setup failure USED to be a console.warn, and the
  // file then printed a full green while every cell returned before asserting.
  // Throwing here fails the file at the source, with the reason attached, and
  // makes it impossible for the matrix to report a pass it did not earn.
  if (setupError) throw new Error(setupFailureMessage(setupError));
});

afterAll(async () => {
  for (const ctx of contexts.values()) {
    await ctx.client.auth.signOut().catch(() => {});
  }
  if (fixtureIdentificationId) {
    await db.delete(petIdentifications).where(eq(petIdentifications.id, fixtureIdentificationId));
  }
  if (fixtureCaseId) {
    await db
      .delete(cases)
      .where(eq(cases.id, fixtureCaseId))
      .catch(() => {});
  }
  if (fixtureTransferId) {
    await db
      .delete(petTransfers)
      .where(eq(petTransfers.id, fixtureTransferId))
      .catch(() => {});
  }
  // Ordered: the transfer row FKs the pet (ON DELETE CASCADE would take it, but
  // deleting explicitly keeps the intent readable and survives a schema change
  // that drops the cascade).
  if (transferFixtureOwnershipId) {
    await db
      .delete(ownerships)
      .where(eq(ownerships.id, transferFixtureOwnershipId))
      .catch(() => {});
  }
  if (transferFixturePetId) {
    await db
      .delete(pets)
      .where(eq(pets.id, transferFixturePetId))
      .catch(() => {});
  }
  if (fixtureAchievementViewId) {
    await db
      .delete(petAchievementViews)
      .where(eq(petAchievementViews.id, fixtureAchievementViewId))
      .catch(() => {});
  }
  if (fixtureWelfareBridgeEventId || fixtureNormalEventId) {
    await withMutationOverride(async (tx) => {
      if (fixtureWelfareBridgeEventId) {
        await tx.delete(petEvents).where(eq(petEvents.id, fixtureWelfareBridgeEventId));
      }
      if (fixtureNormalEventId) {
        await tx.delete(petEvents).where(eq(petEvents.id, fixtureNormalEventId));
      }
    }).catch(() => {});
  }
  if (fixtureWelfareCaseId) {
    await db
      .delete(cases)
      .where(eq(cases.id, fixtureWelfareCaseId))
      .catch(() => {});
  }
  if (welfareBridgeOwnershipId) {
    await db
      .delete(ownerships)
      .where(eq(ownerships.id, welfareBridgeOwnershipId))
      .catch(() => {});
  }
  if (welfareBridgePetId) {
    await db
      .delete(pets)
      .where(eq(pets.id, welfareBridgePetId))
      .catch(() => {});
  }
  if (cleanEventsEventId) {
    await withMutationOverride(async (tx) => {
      await tx.delete(petEvents).where(eq(petEvents.id, cleanEventsEventId as string));
    }).catch(() => {});
  }
  if (cleanEventsOwnershipId) {
    await db
      .delete(ownerships)
      .where(eq(ownerships.id, cleanEventsOwnershipId))
      .catch(() => {});
  }
  if (cleanEventsPetId) {
    await db
      .delete(pets)
      .where(eq(pets.id, cleanEventsPetId))
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

/**
 * Refuse to score a CREDENTIAL failure as a policy denial.
 *
 * A real RLS denial is `200 []` — PostgREST authenticates the request, runs the
 * policy, and returns an empty set. A rejected credential is `401` with no rows
 * at all. Both arrive here as `data === null || data.length === 0`, and the
 * probe below used to call both of them "deny".
 *
 * That is not hypothetical. Until 2026-07-31 the vitest CI job exported
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy_anon_key`. The three signed-in roles
 * were unaffected — the local GoTrue gateway does not validate `apikey`, so
 * sign-in still minted a real session JWT and those cells probed real policies.
 * The `anon` role has no session, so supabase-js sent the placeholder itself as
 * the bearer token and PostgREST answered:
 *
 *     {"code":"PGRST301","message":"Expected 3 parts in JWT; got 1"}
 *
 * before RLS was consulted. Every anon cell reported `deny` and passed. A
 * permissive `anon` SELECT policy added to any table in RLS_MATRIX would not
 * have turned a single one of them red.
 *
 * The CI env is fixed (.github/actions/supabase-env), but env is exactly the
 * kind of thing that regresses silently, so the harness now refuses the input
 * rather than trusting the pipeline that feeds it.
 */
function assertCredentialReachedRls(
  error: { code?: string; message: string } | null,
  table: string,
  role: RlsRole,
): void {
  if (!error) return;
  const credentialRejected =
    error.code?.startsWith("PGRST30") || /JWT|API key/i.test(error.message);
  if (!credentialRejected) return;
  const detail = `${error.code ?? "no code"}: ${error.message}`;
  throw new Error(
    `RLS probe for ${role} on ${table} never reached a policy — PostgREST rejected the CREDENTIAL (${detail}). This is NOT a denial, and scoring it as one is how the anon row of this matrix passed for months without evaluating a policy. Check NEXT_PUBLIC_SUPABASE_ANON_KEY — it must be the running stack's real key (\`supabase status -o env\`), not a placeholder.`,
  );
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
  // pet_identifications is scoped to the fixture pet like the other per-pet
  // tables: unfiltered it probed "any row", and any LOST pet in the DB
  // (whose disclosure policies deliberately expose its chip for finder
  // lookup) flipped the other_user deny probe — a data-dependent assertion.
  if (table === "pet_events" && (cleanEventsPetId ?? ctx.ownerPetId)) {
    // pet_events probes target the test-owned CASE-FREE pet, not the shared
    // seeded fixture pet — any case-attached event on the shared pet flips
    // admin to `allow` via can_read_case, which is legitimate policy but not
    // what the deny cell asserts (no RLS path to NON-case events).
    query = client
      .from(table)
      .select("*")
      .eq("pet_id", cleanEventsPetId ?? (ctx.ownerPetId as string))
      .limit(1);
  } else if (ctx.ownerPetId && ["ownerships", "pet_identifications"].includes(table)) {
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
  } else if (table === "pet_achievement_views" && ctx.ownerPetId) {
    // Probe the fixture row inserted in beforeAll for the owner's first pet.
    query = client.from(table).select("*").eq("pet_id", ctx.ownerPetId).limit(1);
  }

  const { data, error } = await query;
  // MUST run before the zero-rows reading below: a 401 is an empty result too.
  assertCredentialReachedRls(error, table, role);
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
  it("setup ran without errors — otherwise every cell below is meaningless", () => {
    // Unreachable while beforeAll throws (this test never runs in that case).
    // Kept as an ASSERTION, not a console.warn: it was `expect(true).toBe(true)`
    // next to a warning nobody reads, which is what made the green believable.
    expect(setupError, setupError ? setupFailureMessage(setupError) : undefined).toBeNull();
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
            // Backstop, not the primary gate — beforeAll already threw. Never
            // a `return`: a cell that cannot probe must not report a pass.
            if (setupError) throw new Error(setupFailureMessage(setupError));

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

// ---------------------------------------------------------------------------
// pet_events welfare-bridge event — hidden from the subject owner
// (pet-document-redesign REQ-1.2/1.3, migration 0115, design ADR-1).
//
// The generic `table: pet_events` block above probes with an unfiltered
// "any row for the owner's pet" query, which stays `allow` (the owner's
// normal events are still readable — that's the regression control). This
// block probes the SPECIFIC welfare-bridge row and the SPECIFIC normal row
// inserted as fixtures in the top-level beforeAll, which the generic harness
// can't express (it has no per-row granularity). This is the safety net for
// the riskiest change in the privacy slice: the rewritten ownership branch
// must deny the welfare-bridge row while still allowing every other owner
// read through unchanged.
// ---------------------------------------------------------------------------
describe("pet_events welfare-bridge event (migration 0115 — REQ-1.2/1.3)", () => {
  it("owner SELECT on the welfare-bridge event (maltreatment_reported) = deny", async () => {
    if (setupError) throw new Error(setupFailureMessage(setupError));
    // Setup succeeded, so the fixture MUST exist — a missing id here means the
    // insert silently produced nothing, and the privacy assertion below would
    // otherwise "pass" against a row that was never written.
    if (!fixtureWelfareBridgeEventId) {
      throw new Error("welfare-bridge fixture event was not created despite a clean setup");
    }
    const ctx = contexts.get("owner");
    if (!ctx) throw new Error("No client for role owner");

    const { data } = await ctx.client
      .from("pet_events")
      .select("*")
      .eq("id", fixtureWelfareBridgeEventId)
      .limit(1);

    expect(
      data?.length ?? 0,
      "owner must NOT be able to read a pet_event bridged to a welfare_denuncia case they are the subject of",
    ).toBe(0);
  });

  it("owner SELECT on their own normal pet_event (no case_id) = allow (regression)", async () => {
    if (setupError) throw new Error(setupFailureMessage(setupError));
    if (!fixtureNormalEventId) {
      throw new Error("normal-event fixture was not created despite a clean setup");
    }
    const ctx = contexts.get("owner");
    if (!ctx) throw new Error("No client for role owner");

    const { data } = await ctx.client
      .from("pet_events")
      .select("*")
      .eq("id", fixtureNormalEventId)
      .limit(1);

    expect(
      data?.length ?? 0,
      "the rewritten ownership branch must be a no-op for events with no case_id — owner should still read their own normal events",
    ).toBe(1);
  });
});
