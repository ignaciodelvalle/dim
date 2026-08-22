// PO-4 (2026-08-05) — an erased subject's pet stops resolving publicly.
//
// Erasure (Ley 25.326 art. 16) soft-deletes the pets in the subject's custody:
// `erase_subject_data` sets `pets.deleted_at` and leaves the row in place so
// the append-only spine survives. Every public surface, though, resolved the
// token with a bare `eq(pets.public_token, …)`, so the credential kept
// answering anyone who scanned the QR. The physical chapa (/t/[serial] → 307
// → /p) made that pre-existing behavior reachable from a durable object.
//
// The three things this file proves, against the REAL RPC and a real DB:
//
//   1. The erasure soft-deletes the pet still in the subject's custody and
//      does NOT touch a pet transferred away BEFORE the erasure. That
//      asymmetry is the whole PO-4 decision: the credential belongs to the
//      ANIMAL (invariant #1), so it goes dark only when the animal's own row
//      is erased — never because a previous owner exercised their rights.
//   2. `publicPetByToken` — the one predicate every ungated public surface now
//      resolves through — drops the erased pet and keeps the transferred one.
//   3. `lookupTagBySerial` returns NO destination for an ACTIVE chapa whose
//      pet was erased, so /t/[serial] can render its honest neutral state
//      instead of 307-ing a person in the street into a 404.
//
// The page-level side of (3) — what the scanner actually reads — lives in
// tag-resolver-page.test.tsx, which drives the resolver's four-state matrix
// over a mocked lookup.
//
// The static sweep at the bottom is the fence that matters most: the failure
// mode here is a NEW public route that simply forgets the filter, and a
// forgotten filter looks exactly like a present one until someone scans a
// token that should be gone. It is a RULE over derived reachability and no
// longer a hand-kept list of routes — see the long note above it for what that
// list missed, and for what the rule still cannot see.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petTags, pets, profiles } from "@/db";
import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
import { generateTagActivationCode, generateTagSerial } from "@/lib/infra/publicToken";
import { lookupTagBySerial } from "@/lib/infra/tag-lookup";
import { hashTagActivationCode } from "@/lib/utils/tag-code-hash";
import { withMutationOverride } from "./_helpers/db-overrides";
import { ROOT, directDeps } from "./db-reachability";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const PASS = "SoftDelete_2026!";

const ERASED_EMAIL = "po4-erased@dim-test.local";
const KEEPER_EMAIL = "po4-keeper@dim-test.local";

const TOKEN_ERASED = "DIM-PO4E-RASE";
const TOKEN_MOVED = "DIM-PO4M-OVED";
const TEST_LOTE = "TEST-LOTE-PO4";

const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

let erasedUserId: string;
let keeperUserId: string;
let erasedPetId: string;
let movedPetId: string;
let serialErased: string;
let serialMoved: string;

// Auth users are REUSED across runs (audit_log points back at actor_user_id
// with ON DELETE RESTRICT, so delete-and-recreate breaks on the second run —
// same reasoning as subject-rights-rpcs.test.ts).
async function ensureUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function insertPet(publicToken: string, name: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({ publicToken, name, species: "dog", sex: "female", status: "active" })
    .returning({ id: pets.id });
  return row.id;
}

async function activateTagFor(petId: string, userId: string): Promise<string> {
  const serial = generateTagSerial();
  await db.insert(petTags).values({
    serial,
    activationCodeHash: hashTagActivationCode(generateTagActivationCode()),
    loteId: TEST_LOTE,
    status: "active",
    petId,
    activatedByUserId: userId,
    activatedAt: new Date(),
  });
  return serial;
}

async function cleanup() {
  await db.delete(petTags).where(eq(petTags.loteId, TEST_LOTE));
  await withMutationOverride(async (tx) => {
    for (const token of [TOKEN_ERASED, TOKEN_MOVED]) {
      const stale = await tx.select({ id: pets.id }).from(pets).where(eq(pets.publicToken, token));
      for (const { id } of stale) await tx.delete(pets).where(eq(pets.id, id));
    }
  });
}

beforeAll(async () => {
  await cleanup();

  erasedUserId = await ensureUser(ERASED_EMAIL);
  keeperUserId = await ensureUser(KEEPER_EMAIL);

  // The erasure RPC is not idempotent across runs from the test's point of
  // view (it soft-deletes the profile), so reset the subject to a live state.
  await db
    .update(profiles)
    .set({ displayName: "PO4 Erased Subject", deletedAt: null, updatedAt: new Date() })
    .where(eq(profiles.id, erasedUserId));
  await db
    .update(profiles)
    .set({ displayName: "PO4 Keeper", deletedAt: null, updatedAt: new Date() })
    .where(eq(profiles.id, keeperUserId));

  // Pet 1 — still in the erasing subject's custody at erasure time.
  erasedPetId = await insertPet(TOKEN_ERASED, "PO4 Erased Pet");
  await db.insert(ownerships).values({
    petId: erasedPetId,
    ownerUserId: erasedUserId,
    role: "owner",
  });

  // Pet 2 — transferred AWAY before the erasure: the subject's ownership row
  // is closed and the keeper holds the live one.
  movedPetId = await insertPet(TOKEN_MOVED, "PO4 Moved Pet");
  await db.insert(ownerships).values({
    petId: movedPetId,
    ownerUserId: erasedUserId,
    role: "owner",
    endedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  await db.insert(ownerships).values({
    petId: movedPetId,
    ownerUserId: keeperUserId,
    role: "owner",
  });

  serialErased = await activateTagFor(erasedPetId, erasedUserId);
  serialMoved = await activateTagFor(movedPetId, keeperUserId);

  // The real thing: the subject exercises art. 16.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: erasedUserId })}, true)`,
    );
    await tx.execute(
      sql`SELECT public.erase_subject_data(${erasedUserId}::uuid, 'PO4 resolution test'::text)`,
    );
  });
}, 60_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("erase_subject_data — which pets go dark (PO-4)", () => {
  it("soft-deletes the pet in the subject's custody", async () => {
    const [row] = await db
      .select({ deletedAt: pets.deletedAt })
      .from(pets)
      .where(eq(pets.id, erasedPetId));
    expect(row.deletedAt).not.toBeNull();
  });

  it("leaves a pet transferred away BEFORE the erasure untouched", async () => {
    // The overreach guard. If this ever flips, an ex-owner exercising their
    // rights would switch off a credential that belongs to someone else's
    // animal — the exact scenario the PO called out when deciding PO-4.
    const [row] = await db
      .select({ deletedAt: pets.deletedAt })
      .from(pets)
      .where(eq(pets.id, movedPetId));
    expect(row.deletedAt).toBeNull();
  });
});

describe("publicPetByToken — the shared public-resolution predicate (PO-4)", () => {
  it("resolves nothing for the erased pet", async () => {
    const rows = await db.select({ id: pets.id }).from(pets).where(publicPetByToken(TOKEN_ERASED));
    expect(rows).toHaveLength(0);
  });

  it("still resolves the transferred pet", async () => {
    const rows = await db.select({ id: pets.id }).from(pets).where(publicPetByToken(TOKEN_MOVED));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(movedPetId);
  });
});

describe("/t/[serial] lookup — an active chapa never points at an erased pet (PO-4)", () => {
  it("returns the active status with NO destination for the erased pet", async () => {
    // Status stays 'active' — the chapa was never revoked, and lying about
    // that would send its owner into the activation flow. What disappears is
    // the destination, which is what stops the 307-into-404.
    const result = await lookupTagBySerial(serialErased);
    expect(result).toEqual({ status: "active", publicToken: null });
  });

  it("keeps resolving the transferred pet's chapa", async () => {
    expect(await lookupTagBySerial(serialMoved)).toEqual({
      status: "active",
      publicToken: TOKEN_MOVED,
    });
  });

  it("the pet_tags row itself is untouched by the erasure", async () => {
    const [row] = await db
      .select({ status: petTags.status, petId: petTags.petId })
      .from(petTags)
      .where(eq(petTags.serial, serialErased));
    expect(row.status).toBe("active");
    expect(row.petId).toBe(erasedPetId);
  });
});

// ---------------------------------------------------------------------------
// Static sweep — A RULE, NOT A LIST.
//
// WHY THIS WAS REWRITTEN. The first version of this sweep walked a FIXED array
// of nine route files and asserted each resolved through `publicPetByToken`.
// It was green the whole time `/perdidas` and `app/sitemap.ts` were publishing
// an erased subject's pet — name, breed, colour, "Localidad, Provincia" and
// "hace N días" — and the sitemap was handing `/p/{token}` to Google every day
// at priority 0,85, where it 404s. That is the difference the erasure policy
// (PO-4) says must not be observable: "deleted" became distinguishable from
// "never existed".
//
// A hand-kept list cannot catch that, because the failure mode IS forgetting.
// The list did not fail — it was never told. So the sweep now DERIVES the set
// it checks:
//
//   1. Take every Next entry file (page/route/layout/…) under the route groups
//      that serve requests WITHOUT a session.
//   2. Walk the import graph forward from them.
//   3. Subtract the closure of every OTHER entry file. What is left is
//      PUBLIC-ONLY code: modules that exist to answer unauthenticated callers
//      and nobody else. A module shared with `/gob` or `/mis-mascotas` is not
//      in scope — it answers an authorized caller too, and its filtering is
//      that caller's question, not this one's.
//   4. In each of those files, every read of `pets` must carry the soft-delete
//      guard.
//
// WHAT THIS RULE STILL CANNOT SEE — stated, not left to be rediscovered:
//
//   • THE SEED IS DECLARED. `UNAUTHENTICATED_ENTRIES` below names route groups,
//     not files. Nothing in the tree marks a route "unauthenticated", so a NEW
//     unauthenticated route GROUP must be added here by hand. That is a rare and
//     visible event (four exist today, and adding one is a routing decision);
//     adding a page or a query under an existing one is constant, and THAT is
//     what the old list kept missing. Coarser seed, mechanical body.
//   • IT COUNTS, IT DOES NOT PARSE. The check compares "reads of `pets`" against
//     "soft-delete guards" per file. A file with two reads and two guards on the
//     same read passes. Statement-level segmentation was tried and rejected
//     against this corpus: `lost-listing-read.ts` and `adoption-listing-read.ts`
//     both build a predicate ARRAY dozens of lines above the `.where()` that
//     consumes it, so no window around the query contains its own guard.
//   • DYNAMIC REACHABILITY. `directDeps` reads static import specifiers. A
//     module reached only through a computed `import()` is invisible.
//   • RLS IS THE OTHER HALF. This is a static check over application queries;
//     it says nothing about what a direct PostgREST client can read.
//
// The allowlist below is DEBT, not exemption. It may only shrink: an entry that
// stops violating fails this suite, so a fix cannot leave a stale line behind.
// ---------------------------------------------------------------------------

/** Route groups and files that answer a request with no session. */
const UNAUTHENTICATED_ENTRY_PREFIXES = [
  "app/(public)/", // the Next route group whose whole purpose is ungated pages
  "app/api/v1/", // the credential API — "the same door as the page" (review #7)
  "app/libreta/", // /libreta/compartir/{shareToken} — a share link, no session
  "app/r/", // /r/invite/{token} — an invitation opened before signing in
] as const;
const UNAUTHENTICATED_ENTRY_FILES = [
  "app/page.tsx", // the landing page
  "app/sitemap.ts", // hands URLs to search engines; the one that advertised 404s
  "app/robots.ts", // present or not, it is an unauthenticated surface
] as const;

/** Next's own entry-file names. Everything else is an imported module. */
const NEXT_ENTRY_FILE =
  /^(page|route|layout|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|error|not-found|loading)\.tsx?$/;

/** A read of the `pets` table: the FROM side or any join onto it. */
const PETS_READ = /\.(?:from|leftJoin|innerJoin|rightJoin|fullJoin)\(\s*pets\b/g;
/** The soft-delete guard, in every spelling this repo actually uses. */
const SOFT_DELETE_GUARD =
  /(pets\.deletedAt|pets\.deleted_at|publicPetByToken|deleted_at\s+IS\s+NULL)/gi;

/**
 * KNOWN DEBT — public-only files that read `pets` without the guard.
 *
 * Each line is a real instance of the same class the erasure policy forbids,
 * left out of this change because it is not its subject. The rule is what makes
 * them visible at all: the old fixed list never mentioned a single one.
 */
const SOFT_DELETE_DEBT = new Map<string, string>([
  [
    "app/page.tsx",
    "Landing demo-pet existence probe. Leaks only whether the DECLARED demo token resolves, and the token is a deployment constant.",
  ],
  [
    "app/libreta/compartir/[shareToken]/page.tsx",
    "Tier-2 medical share. Reached by share token, so an erased pet keeps serving its libreta to whoever already holds the link.",
  ],
  [
    "lib/infra/caretaker-public-contact.ts",
    "Joins pets to decide the lost-mode caretaker disclosure. Its caller resolves the pet through the guard first, so it is reachable only for a live pet today — an assumption nothing enforces.",
  ],
  [
    "src/modules/pets/application/public-lookup/lookup-pet-for-denuncia.ts",
    "Hand-rolled eq(pets.publicToken). An erased pet still answers with its name in the denuncia form.",
  ],
  [
    "src/modules/pets/application/scans/log-scan.ts",
    "Hand-rolled eq(pets.publicToken). Records a scan against an erased pet and can fire the owner alert.",
  ],
]);

function publicOnlyModules(): string[] {
  const appDir = resolve(ROOT, "app");
  const entries: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) walk(full);
      else if (NEXT_ENTRY_FILE.test(e.name)) entries.push(full);
    }
  };
  walk(appDir);

  const relOf = (f: string): string => f.slice(`${ROOT}/`.length);
  const isUnauthenticated = (f: string): boolean => {
    const rel = relOf(f);
    return (
      UNAUTHENTICATED_ENTRY_PREFIXES.some((p) => rel.startsWith(p)) ||
      (UNAUTHENTICATED_ENTRY_FILES as readonly string[]).includes(rel)
    );
  };

  const closure = (roots: string[]): Set<string> => {
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const dep of directDeps(file)) if (!seen.has(dep)) queue.push(dep);
    }
    return seen;
  };

  const openDoor = closure(entries.filter(isUnauthenticated));
  const behindAuth = closure(entries.filter((f) => !isUnauthenticated(f)));
  return [...openDoor]
    .filter((f) => !behindAuth.has(f) && /\.tsx?$/.test(f))
    .map(relOf)
    .sort();
}

/** Comments are not code: a guard quoted in prose must not count as one. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
}

type PetsReader = { rel: string; reads: number; guards: number };

function scanPublicOnlyPetsReaders(): PetsReader[] {
  const out: PetsReader[] = [];
  for (const rel of publicOnlyModules()) {
    let source: string;
    try {
      source = stripComments(readFileSync(resolve(ROOT, rel), "utf8"));
    } catch {
      continue;
    }
    const reads = source.match(PETS_READ)?.length ?? 0;
    if (reads === 0) continue;
    out.push({ rel, reads, guards: source.match(SOFT_DELETE_GUARD)?.length ?? 0 });
  }
  return out;
}

describe("every unauthenticated read of `pets` carries the soft-delete filter (PO-4 rule)", () => {
  const readers = scanPublicOnlyPetsReaders();
  const violations = readers.filter((r) => r.guards < r.reads).map((r) => r.rel);

  // NON-VACUITY FLOOR, three ways. A rule whose graph walk quietly returns
  // nothing is greener than a correct one, and that is the exact shape of the
  // defect this replaces.
  it("actually reaches the public surfaces it claims to check", () => {
    const rels = readers.map((r) => r.rel);
    expect(readers.length).toBeGreaterThanOrEqual(12);
    // Named anchors: the two listings this rule was written for, the credential
    // page, and the API — the second door onto the same data.
    expect(rels).toContain("src/modules/lost/infrastructure/lost-listing-read.ts");
    expect(rels).toContain("src/modules/adoption/infrastructure/adoption-listing-read.ts");
    expect(rels).toContain("app/(public)/p/[publicToken]/page.tsx");
    // And it must NOT have swallowed the authenticated half: the govt/admin
    // aggregates read `pets` unguarded by design and are not this rule's
    // business. Seeing one here means the subtraction stopped working.
    expect(rels).not.toContain("lib/metrics/census.ts");
    expect(rels).not.toContain("src/modules/panorama/infrastructure/repository-history.ts");
  });

  it("flags an unguarded read and clears a guarded one", () => {
    // The detector against hand-written samples, so a regex that stopped
    // matching anything cannot pass by finding zero violations everywhere.
    const bad = "const rows = await db.select().from(pets).where(eq(pets.status, 'lost'));";
    const good =
      "const rows = await db.select().from(pets).where(and(eq(pets.status, 'lost'), isNull(pets.deletedAt)));";
    const commented = "// isNull(pets.deletedAt) used to be here\nawait db.select().from(pets);";
    const count = (s: string, re: RegExp) => stripComments(s).match(re)?.length ?? 0;
    expect(count(bad, PETS_READ)).toBe(1);
    expect(count(bad, SOFT_DELETE_GUARD)).toBe(0);
    expect(count(good, SOFT_DELETE_GUARD)).toBe(1);
    // A guard that lives in a comment is prose, not a filter.
    expect(count(commented, SOFT_DELETE_GUARD)).toBe(0);
  });

  it("has no unguarded read outside the declared debt", () => {
    expect(violations.filter((rel) => !SOFT_DELETE_DEBT.has(rel))).toEqual([]);
  });

  it("carries no stale debt — the allowlist may only shrink", () => {
    expect([...SOFT_DELETE_DEBT.keys()].filter((rel) => !violations.includes(rel))).toEqual([]);
  });
});
