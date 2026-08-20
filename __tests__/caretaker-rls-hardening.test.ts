// RLS proof tests for the titular-only deny-list (migration 0190).
//
// WHY THESE EXIST, AND WHY THEY CANNOT BE FAKED AT THE APP LAYER
// ---------------------------------------------------------------------------
// The app-layer deny-list (requireTitularAccess + scripts/check-titular-gate.ts)
// is real against the Next.js app: every legitimate write goes through Drizzle,
// which connects as a BYPASSRLS role, so the guard is the only gate and it runs.
//
// Against a client holding a valid Supabase bearer token and talking to
// PostgREST directly, it is worth nothing. Before 0190, every ownership-derived
// policy tested `owner_user_id = auth.uid() AND ended_at IS NULL` with NO role
// predicate — so an active caretaker could
//   PATCH /rest/v1/pets      {"jurisdiction_province": …}
//   POST  /rest/v1/pet_events {"event_type":"custody_transferred", …}
//   POST  /rest/v1/libreta_share_tokens {…}
// and defeat four of the seven deny-list rows without ever touching the app.
// That PostgREST is reachable by an authenticated attacker is not speculation:
// migration 0163 exists because somebody exercised that exact vector.
//
// So the assertions below connect AS THE `authenticated` ROLE with a spoofed
// `request.jwt.claims`, which is what PostgREST does. Anything less would be
// testing the app we already trust instead of the layer we just changed.
//
// SHAPE OF THE ASSERTIONS — read this before adding one:
//   - A denied UPDATE is NOT an error. RLS filters the USING clause, so the
//     statement succeeds and affects ZERO rows. Asserting `rejects` there would
//     fail even against a correct policy.
//   - A denied INSERT IS an error (42501, "new row violates row-level security
//     policy"), because WITH CHECK is evaluated on the produced row.
//   - Every caretaker denial is paired with the SAME statement run as the
//     TITULAR. Without the pair, a policy that denies everybody would pass.
//
// Requires: local Supabase stack running + migrations 0189 and 0190 applied.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, pets, profiles } from "@/db";
import { TITULAR_ONLY_EVENT_TYPES } from "@/lib/domain/titular-only";
import { pgErrorCode } from "@/lib/infra/db-errors";
import { withMutationOverride } from "./_helpers/db-overrides";

const PET_TOKEN = "DIM-CRLS-0001";
const TITULAR_ID = "0cae7a11-1111-4000-8000-000000000001";
const CARETAKER_ID = "0cae7a11-1111-4000-8000-000000000002";

let petId: string;

/**
 * Run one statement the way PostgREST would: as the `authenticated` role, with
 * `request.jwt.claims.sub` set to the caller. SET LOCAL + transaction-scoped
 * set_config means both revert when the transaction ends.
 */
async function asAuthenticated<T = Record<string, unknown>>(
  userId: string,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
    );
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return (await tx.execute(statement)) as unknown as T[];
  });
}

async function expectRlsDenied(promise: Promise<unknown>): Promise<void> {
  let code: string | null = null;
  let rejected = false;
  try {
    await promise;
  } catch (err) {
    rejected = true;
    code = pgErrorCode(err) ?? null;
  }
  expect(rejected, "expected the write to be refused by RLS, but it succeeded").toBe(true);
  // 42501 = insufficient_privilege, which is what a WITH CHECK violation raises.
  expect(code).toBe("42501");
}

async function cleanup(): Promise<void> {
  await db.execute(
    sql`DELETE FROM libreta_share_tokens WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${PET_TOKEN})`,
  );
  // pet_events is append-only by trigger (db/triggers.sql); teardown needs the
  // documented escape hatch with an accountable actor.
  await withMutationOverride(async (tx) => {
    await tx.execute(
      sql`DELETE FROM pet_events WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${PET_TOKEN})`,
    );
  });
  await db.execute(
    sql`DELETE FROM ownerships WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${PET_TOKEN})`,
  );
  await db.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  await db.execute(
    sql`DELETE FROM profiles WHERE id IN (${TITULAR_ID}::uuid, ${CARETAKER_ID}::uuid)`,
  );
}

beforeAll(async () => {
  await cleanup();
  await db.insert(profiles).values([
    { id: TITULAR_ID, displayName: "Titular RLS", role: "owner" },
    { id: CARETAKER_ID, displayName: "Cuidadora RLS", role: "owner" },
  ]);
  const [pet] = await db
    .insert(pets)
    .values({ publicToken: PET_TOKEN, name: "Pampa RLS", species: "dog" })
    .returning({ id: pets.id });
  petId = pet.id;
  await db.insert(ownerships).values([
    { petId, ownerUserId: TITULAR_ID, role: "owner" },
    { petId, ownerUserId: CARETAKER_ID, role: "caretaker" },
  ]);
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// The caretaker keeps every read. That is the whole point of the role.
// ---------------------------------------------------------------------------

describe("caretaker — reads are untouched", () => {
  it("can SELECT the pet row", async () => {
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`SELECT id FROM public.pets WHERE id = ${petId}::uuid`,
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// pets UPDATE — deny-list rows jurisdiction-change / tier2 / identity
// ---------------------------------------------------------------------------

describe("pets UPDATE — titular only", () => {
  it("refuses a caretaker's jurisdiction change (zero rows, not an error)", async () => {
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`UPDATE public.pets SET jurisdiction_province = 'Córdoba' WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("still lets the TITULAR change it — the policy denies the role, not the table", async () => {
    const rows = await asAuthenticated(
      TITULAR_ID,
      sql`UPDATE public.pets SET jurisdiction_province = 'Córdoba' WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses a caretaker's Tier-2 public toggle", async () => {
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`UPDATE public.pets SET tier2_public_permanent = true WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses a caretaker publishing THEIR OWN contact on the credential", async () => {
    // KEY 1 of the two-key model (`disclose_caretaker_contact_when_lost`,
    // migration 0193) is the TITULAR's. A caretaker flipping it via PostgREST
    // would be granting themselves a disclosure the titular never chose — which
    // is the inverse of the failure key 2 protects against, and just as bad.
    // Covered for free by the pets UPDATE policy (0190) because it is a column
    // on `pets`; asserted anyway, because "covered for free" is exactly the
    // sentence that stops being true when somebody adds a column-scoped policy.
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`UPDATE public.pets SET disclose_caretaker_contact_when_lost = true WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("still lets the TITULAR set the caretaker-contact disclosure", async () => {
    const rows = await asAuthenticated(
      TITULAR_ID,
      sql`UPDATE public.pets SET disclose_caretaker_contact_when_lost = true WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(1);
    // Leave the fixture as it was found — the flag is off by default and other
    // assertions in this file must not inherit it.
    await db.execute(
      sql`UPDATE public.pets SET disclose_caretaker_contact_when_lost = false WHERE id = ${petId}::uuid`,
    );
  });

  it("refuses a caretaker's rename (identity field)", async () => {
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`UPDATE public.pets SET name = 'Renombrada' WHERE id = ${petId}::uuid RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pet_events INSERT — NOT a blanket deny. This is the subtle one.
// ---------------------------------------------------------------------------

describe("pet_events INSERT — titular-only event types only", () => {
  it("refuses a caretaker-forged custody_transferred", async () => {
    // The worst case in the whole audit: pet_events has no UPDATE and no DELETE
    // policy and the invariant forbids deletion, so a forged transfer would be
    // a PERMANENT lie in an append-only ledger. The transfers module would not
    // honour it (ownerships has been write-locked since 0163), which makes it a
    // lie rather than a theft — but invariant #2 exists to prevent exactly that.
    await expectRlsDenied(
      asAuthenticated(
        CARETAKER_ID,
        sql`INSERT INTO public.pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload)
            VALUES (${petId}::uuid, 'custody_transferred', now(), ${CARETAKER_ID}::uuid, '{}'::jsonb)`,
      ),
    );
  });

  it("refuses a caretaker-forged adoption_eligibility_set", async () => {
    await expectRlsDenied(
      asAuthenticated(
        CARETAKER_ID,
        sql`INSERT INTO public.pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload)
            VALUES (${petId}::uuid, 'adoption_eligibility_set', now(), ${CARETAKER_ID}::uuid, '{}'::jsonb)`,
      ),
    );
  });

  it("ALLOWS a caretaker's medical event — the arrangement would be pointless otherwise", async () => {
    const rows = await asAuthenticated(
      CARETAKER_ID,
      sql`INSERT INTO public.pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload)
          VALUES (${petId}::uuid, 'vaccination_administered', now(), ${CARETAKER_ID}::uuid, '{}'::jsonb)
          RETURNING id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("still lets the TITULAR write a titular-only event type", async () => {
    const rows = await asAuthenticated(
      TITULAR_ID,
      sql`INSERT INTO public.pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload)
          VALUES (${petId}::uuid, 'custody_transfer_proposed', now(), ${TITULAR_ID}::uuid, '{}'::jsonb)
          RETURNING id`,
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// libreta_share_tokens INSERT — deny-list row libreta-share-minting
// ---------------------------------------------------------------------------

describe("libreta_share_tokens INSERT — titular only", () => {
  it("refuses a caretaker minting a public medical share link", async () => {
    await expectRlsDenied(
      asAuthenticated(
        CARETAKER_ID,
        sql`INSERT INTO public.libreta_share_tokens (share_token, pet_id, created_by_user_id)
            VALUES ('CRLS-CARETAKER', ${petId}::uuid, ${CARETAKER_ID}::uuid)`,
      ),
    );
  });

  it("still lets the TITULAR mint one", async () => {
    const rows = await asAuthenticated(
      TITULAR_ID,
      sql`INSERT INTO public.libreta_share_tokens (share_token, pet_id, created_by_user_id)
          VALUES ('CRLS-TITULAR', ${petId}::uuid, ${TITULAR_ID}::uuid) RETURNING id`,
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// pet_caretaker_grants — the table ships write-locked (the 0163 posture)
// ---------------------------------------------------------------------------

describe("pet_caretaker_grants — no write policy at all", () => {
  it("refuses a caretaker inserting their own grant", async () => {
    // If this ever passes, a caretaker can mint or extend their own access.
    await expectRlsDenied(
      asAuthenticated(
        CARETAKER_ID,
        sql`INSERT INTO public.pet_caretaker_grants (public_token, pet_id, granted_by_user_id, caretaker_email, ends_at)
            VALUES ('CRLS-SELF', ${petId}::uuid, ${TITULAR_ID}::uuid, 'x@dim-test.local', now() + interval '30 days')`,
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// The duplication fence — SQL list vs TS list
// ---------------------------------------------------------------------------

describe("titular_only_event_types() — the second copy is fenced", () => {
  it("matches lib/domain/titular-only.ts exactly", async () => {
    // Defense in depth costs a second copy of the list. Duplication is only
    // acceptable when it is checked: this assertion goes red the moment either
    // side moves alone, which is the whole reason the copy is allowed to exist.
    const rows = (await db.execute(
      sql`SELECT public.titular_only_event_types() AS types`,
    )) as unknown as Array<{ types: string[] }>;
    expect([...rows[0].types].sort()).toEqual([...TITULAR_ONLY_EVENT_TYPES].sort());
  });

  it("is non-empty — an empty list would make the pet_events policy a no-op", async () => {
    const rows = (await db.execute(
      sql`SELECT cardinality(public.titular_only_event_types()) AS n`,
    )) as unknown as Array<{ n: number }>;
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });
});

describe("has_titular_write_access()", () => {
  it("is true for the titular and false for the caretaker", async () => {
    const rows = (await db.execute(
      sql`SELECT
            public.has_titular_write_access(${petId}::uuid, ${TITULAR_ID}::uuid) AS titular,
            public.has_titular_write_access(${petId}::uuid, ${CARETAKER_ID}::uuid) AS caretaker`,
    )) as unknown as Array<{ titular: boolean; caretaker: boolean }>;
    expect(rows[0].titular).toBe(true);
    expect(rows[0].caretaker).toBe(false);
  });

  it("is false for a stranger and for null arguments", async () => {
    const rows = (await db.execute(
      sql`SELECT
            public.has_titular_write_access(${petId}::uuid, gen_random_uuid()) AS stranger,
            public.has_titular_write_access(NULL, ${TITULAR_ID}::uuid) AS nullPet`,
    )) as unknown as Array<{ stranger: boolean; nullpet: boolean }>;
    expect(rows[0].stranger).toBe(false);
    expect(rows[0].nullpet).toBe(false);
  });
});
