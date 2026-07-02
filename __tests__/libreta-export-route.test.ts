// Tests for GET /api/mis-mascotas/[publicToken]/libreta-export (Item 14.3 +
// QA finding fix, engram #635).
//
// The route renders a print-styled HTML view (window.print() auto-fires on
// load) — there is no server-side PDF generation. It previously returned
// Content-Disposition: inline; filename="....pdf" while serving
// text/html, misrepresenting the response as a real PDF download. This test
// locks in the honest contract: Content-Type stays text/html and no
// Content-Disposition header is sent (nothing here claims a .pdf filename).
//
// Auth/ownership guards (401/404) are covered indirectly via the same
// requirePetAccess-style pattern used elsewhere (see get-libreta-face-data
// test); this file focuses on the header-honesty regression plus a smoke
// check that the handler still renders successfully for the owner.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { type Pet, db, ownerships, pets } from "@/db";
import * as supabaseServer from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

const PET_TOKEN = "DIM-LIBEXP-01";
const mockCreateClient = vi.mocked(supabaseServer.createClient);

let ownerUserId: string;
let fixturePet: Pet;

function buildRequest() {
  return new Request(`http://test.local/api/mis-mascotas/${PET_TOKEN}/libreta-export`);
}

function mockAuthAs(userId: string | null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeAll(async () => {
  const [ownerProfile] = (await db.execute(sql`
    select p.id::text as id
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = 'owner@dim.test'
    limit 1
  `)) as unknown as Array<{ id: string }>;
  if (!ownerProfile?.id) {
    throw new Error(
      "libreta-export-route test: owner@dim.test profile not found. Run `pnpm seed:test` first.",
    );
  }
  ownerUserId = ownerProfile.id;

  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM ownerships WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  });

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "Libreta Export Fixture",
      species: "dog",
      sex: "female",
      potentiallyDangerousBreed: false,
    })
    .returning();
  fixturePet = pet;

  await db.insert(ownerships).values({
    petId: fixturePet.id,
    ownerUserId,
    role: "owner",
    startedAt: new Date(),
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${fixturePet.id}::uuid`);
    await tx.execute(sql`DELETE FROM ownerships WHERE pet_id = ${fixturePet.id}::uuid`);
    await tx.execute(sql`DELETE FROM pets WHERE id = ${fixturePet.id}::uuid`);
  });
});

describe("GET /api/mis-mascotas/[publicToken]/libreta-export", () => {
  it("returns 401 without an authenticated user", async () => {
    mockAuthAs(null);
    const { GET } = await import("@/app/api/mis-mascotas/[publicToken]/libreta-export/route");
    const res = await GET(buildRequest() as never, {
      params: Promise.resolve({ publicToken: PET_TOKEN }),
    });
    expect(res.status).toBe(401);
  });

  it("renders text/html with no Content-Disposition header (no fabricated .pdf filename)", async () => {
    mockAuthAs(ownerUserId);
    const { GET } = await import("@/app/api/mis-mascotas/[publicToken]/libreta-export/route");
    const res = await GET(buildRequest() as never, {
      params: Promise.resolve({ publicToken: PET_TOKEN }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    // The route has no server-side PDF generation — it must not claim a
    // ".pdf" filename (or any Content-Disposition) for an HTML response.
    expect(res.headers.get("content-disposition")).toBeNull();

    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    // Print-to-PDF affordance: the browser's native print dialog produces
    // the actual PDF, not the server.
    expect(html).toContain("window.print()");
  });
});
