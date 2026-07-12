// Regression test — exercises the REAL app/(app)/inicio/page.tsx (not a
// re-implementation of its logic) to pin the canon-C2 fix from
// __tests__/inicio-carousel-transit-compliance.test.ts at the page level:
// a transit/foster-role pet's credential-rail card must show the SAME
// compliance status /mis-mascotas would show for it, not the "registered"
// placeholder fallback.
//
// requireUserOrRedirect is mocked to skip real Supabase session cookies
// (same technique as __tests__/turnos-offering-detail-page.test.ts); every
// other read InicioPage performs hits the real local Postgres/Supabase
// instance, so this exercises the actual complianceByPet union added to
// inicio/page.tsx.

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: vi.fn(),
}));

import type { CredCardData } from "@/app/(app)/inicio/_components/CredCard";
import { CredentialRail } from "@/app/(app)/inicio/_components/CredentialRail";
import { db, ownerships, petEvents, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const EMAIL = "inicio-page-transit-carousel@dim-test.local";
const PASS = "InicioPageTransitCarousel_2026!";
const TOKEN = "TRNS-TEST-0002";

const VET = { authorRole: "vet" as const, authorVerified: true, authorOrganizationId: null };

let userId: string;
let petId: string;

beforeAll(async () => {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === EMAIL);
  if (existing) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.publicToken, TOKEN));
    });
    await admin.auth.admin.deleteUser(existing.id);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  userId = data.user.id;

  vi.mocked(requireUserOrRedirect).mockResolvedValue({
    supabase: {} as never,
    user: { id: userId } as never,
  });

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: TOKEN,
      name: "Transit Page Test Cat",
      species: "cat", // never PPP — keeps the fixture to 3 obligations.
      status: "active",
    })
    .returning({ id: pets.id });
  petId = pet.id;

  // Transit/foster ownership — excluded from fetchPetHealthNudges (owner-role
  // filter), included in fetchPetsForOwner (no role filter) — the exact
  // asymmetry that produced the carousel/mis-mascotas disagreement.
  await db.insert(ownerships).values({ petId, ownerUserId: userId, role: "foster" });

  const occurredAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const nextDueAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // "upcoming" → ok
  await db.insert(petEvents).values([
    {
      petId,
      eventType: "vaccination_administered",
      occurredAt,
      payload: { vaccine_name: "Antirrábica", next_due_at: nextDueAt.toISOString() },
      ...VET,
    },
    { petId, eventType: "microchip_implanted", occurredAt, payload: {}, ...VET },
    { petId, eventType: "sterilization_performed", occurredAt, payload: {}, ...VET },
  ]);
});

afterAll(async () => {
  if (petId) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
});

// Minimal React-element shape used by the DFS below — avoids pulling in
// `@types/react`'s full ReactElement generics for a simple tree walk.
type ElementLike = { type?: unknown; props?: { children?: unknown } };

function isElementLike(node: unknown): node is ElementLike {
  return typeof node === "object" && node !== null && "type" in node;
}

// Depth-first search for the first element of the given `type` in a React
// element tree returned directly from an async Server Component invocation
// (no renderer involved — just walking the plain element/props objects JSX
// produces).
function findByType(node: unknown, type: unknown): ElementLike | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isElementLike(node)) return null;
  if (node.type === type) return node;
  return findByType(node.props?.children, type);
}

describe("/inicio page — credential carousel shows the transit pet's real status", () => {
  it("CredentialRail receives the pet with status 'ok', not the 'registered' fallback", async () => {
    const { default: InicioPage } = await import("@/app/(app)/inicio/page");
    const result = await InicioPage();

    const rail = findByType(result, CredentialRail) as {
      props?: { cards?: CredCardData[] };
    } | null;
    expect(rail).not.toBeNull();

    const card = rail?.props?.cards?.find((c) => c.token === TOKEN);
    expect(card).toBeDefined();
    // Before the fix: no complianceByPet entry for a transit pet → fallback
    // to "registered", contradicting /mis-mascotas' real "AL DÍA" (ok).
    expect(card?.status).toBe("ok");
  });
});
