// Linking-case authorization tests for loadGobPetSubView (task #12).
//
// FENCE PROOF: operators have no pet directory — a pet is reachable ONLY through
// an in-jurisdiction welfare report / case. These tests lock:
//   - a govt operator whose only linking record is out of scope → { ok:false };
//   - a govt operator with an in-scope linking report → { ok:true };
//   - a non-existent pet → { ok:false } (identical outcome, no leak);
//   - an admin still REQUIRES a linking record (a pet with no welfare nexus is
//     never reachable, even universal-scope) but is never scope-blocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable @/db stub (see welfare-inspector-detail.test.ts). Only `db` is
// replaced — the real table exports (drizzle refs, no DB connection at import)
// stay, so gob-pet-subview + case-queries resolve every table they import.
// Hoisted so the vi.mock factory can use the builder + queue.
const h = vi.hoisted(() => {
  const dbState = { queue: [] as unknown[] };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
    builder[m] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable query-builder stub for the @/db mock
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(dbState.queue.length ? dbState.queue.shift() : []).then(resolve, reject);
  return { dbState, builder };
});

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, db: h.builder };
});

import { loadGobPetSubView } from "../gob-pet-subview";

const PET = {
  id: "pet-1",
  publicToken: "DIM-AAAA-BBBB",
  name: "Pampa",
  species: "dog",
  sex: "male",
  status: "active",
  breed: null,
  color: null,
  jurisdictionProvince: "CABA",
  jurisdictionLocality: "Palermo",
};

const GOVT_CABA = {
  profile: { id: "u-1", role: "govt" as const },
  jurisdictions: [{ province: "CABA", locality: "Palermo" }],
  user: { id: "u-1" },
};
const ADMIN = {
  profile: { id: "admin-1", role: "admin" as const },
  jurisdictions: [] as { province: string; locality: string }[],
  user: { id: "admin-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.dbState.queue = [];
});

describe("loadGobPetSubView — linking-case jurisdiction gate", () => {
  it("govt: only linking record is out of scope → { ok:false }", async () => {
    // pet, then [reportRows], [caseRows]
    h.dbState.queue = [[PET], [{ province: "Salta", locality: "Salta" }], []];
    const res = await loadGobPetSubView(GOVT_CABA, "DIM-AAAA-BBBB");
    expect(res.ok).toBe(false);
  });

  it("govt: an in-scope linking welfare report → { ok:true }", async () => {
    h.dbState.queue = [[PET], [{ province: "CABA", locality: "Palermo" }], []];
    const res = await loadGobPetSubView(GOVT_CABA, "DIM-AAAA-BBBB");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pet.publicToken).toBe("DIM-AAAA-BBBB");
  });

  it("non-existent pet → { ok:false }", async () => {
    h.dbState.queue = [[]]; // pet query empty
    const res = await loadGobPetSubView(GOVT_CABA, "DIM-XXXX-YYYY");
    expect(res.ok).toBe(false);
  });

  it("admin: still requires a linking record — none → { ok:false }", async () => {
    h.dbState.queue = [[PET], [], []]; // no reports, no cases
    const res = await loadGobPetSubView(ADMIN, "DIM-AAAA-BBBB");
    expect(res.ok).toBe(false);
  });

  it("admin: any linking record (any jurisdiction) → { ok:true }", async () => {
    h.dbState.queue = [[PET], [{ province: "Salta", locality: "Salta" }], []];
    const res = await loadGobPetSubView(ADMIN, "DIM-AAAA-BBBB");
    expect(res.ok).toBe(true);
  });
});
