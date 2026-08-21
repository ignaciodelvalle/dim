// Every anonymous route that resolves a public credential token must apply the
// per-IP read limit.
//
// WHY A COVERAGE FENCE AND NOT A BEHAVIOURAL TEST. The defect was never that
// the limiter did the wrong thing — it works, and /p/[publicToken] has used it
// since V1-1. The defect was that two sibling routes resolving the SAME token
// through the SAME `publicPetByToken()` lookup simply never called it, under a
// comment in the third file asserting the guard ran "before touching any pet
// data". Testing the limiter's behaviour again would have kept passing while
// the gap existed; only enumerating the ROUTES can catch a route that forgot.
//
// It matters most for /encontre, whose "allowFinderFormWhenLost=false" branch
// renders the owner's tel:/mailto: and calls the Supabase ADMIN API to resolve
// their email — an unauthenticated path to a privileged lookup.
//
// WHAT THIS FENCE ENUMERATED, AND WHAT IT SHOULD HAVE (fixed 2026-08-21)
// ---------------------------------------------------------------------------
// It walked `page.tsx` files under one directory. The SUBJECT is "anonymous
// code that resolves a public credential token", and the two are not the same
// set: `opengraph-image.tsx` is a separate HTTP route by Next file convention
// — WhatsApp, Facebook and Google fetch it directly, not as part of the page
// render — and it is not called page.tsx, so this fence could not see it. It
// sat unthrottled and unbudgeted, answering "is this animal lost?" through its
// own artwork (SE BUSCA vs Credencial pública) on the most expensive read in
// the product: a 1200x630 satori render per hit.
//
// So the enumeration now derives from CALL SITES of `publicPetByToken` across
// app/, which is the thing the rule is actually about. Anything that resolves a
// public token is in scope by construction, whatever the file is called and
// wherever it lives. The exemptions below are the two shapes that legitimately
// do not take the READ limiter, each with the reason and the limiter it takes
// instead.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const APP_DIR = join(ROOT, "app");
const GUARD = "isPublicTokenReadThrottled";
const LOOKUP = "publicPetByToken(";

/**
 * Resolvers that legitimately do NOT take the read limiter. Each names the
 * reason and what bounds it instead — an exemption without a stated
 * alternative is just a hole with a comment.
 */
const EXEMPT: Record<string, string> = {
  "app/(public)/p/[publicToken]/encontre/action.ts":
    "A WRITE action, bounded harder than any read: enforceRateLimit(`finder_possession:${token}`, ip, 1/min + 10/hr). Adding the 60/min read limiter on top would loosen nothing and confuse the counters.",
  "app/(public)/adoptar/[petToken]/page.tsx":
    "Resolves only pets that are adoption-LISTED — a non-listed token reaches notFound() at the isListable gate. Listed pets are already enumerable from the public /adoptar catalog, so this surface reveals nothing the catalog does not.",
  "app/(public)/adoptar/[petToken]/postular/page.tsx":
    "Same listed-only gate as the detail page above; it is the apply step of the same public catalog entry.",
};

/** Every file under app/ that resolves a public credential token. */
function publicTokenResolvers(): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(APP_DIR, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.includes(".test.")) continue;
    const abs = join(entry.parentPath, entry.name);
    if (!readFileSync(abs, "utf8").includes(LOOKUP)) continue;
    found.push(abs.slice(ROOT.length + 1).replaceAll("\\", "/"));
  }
  return found.sort();
}

/** The ones the rule applies to: resolvers minus documented exemptions. */
function publicTokenPages(): string[] {
  return publicTokenResolvers().filter((f) => EXEMPT[f] === undefined);
}

describe("public-token routes are rate limited", () => {
  it("finds every public-token resolver, not just the pages", () => {
    // NON-VACUITY. If the walk or the lookup match breaks, every assertion
    // below passes over an empty list — the exact failure shape this repo keeps
    // rediscovering in its own fences.
    const all = publicTokenResolvers();
    expect(all.length).toBeGreaterThanOrEqual(6);

    const pages = publicTokenPages();
    expect(pages.length).toBeGreaterThanOrEqual(4);
    // The ones that were missing the guard, named explicitly: if any is renamed
    // away, that is a decision someone should make on purpose.
    expect(pages).toContain("app/(public)/p/[publicToken]/encontre/page.tsx");
    expect(pages).toContain("app/(public)/p/[publicToken]/sighting/page.tsx");
    // THE ONE THE OLD SCOPE COULD NOT SEE. Not a page.tsx, and a separate HTTP
    // request that scrapers fetch directly.
    expect(pages).toContain("app/(public)/p/[publicToken]/opengraph-image.tsx");
  });

  it("keeps every exemption pointed at a file that still resolves a token", () => {
    // An exemption for a file that moved is a hole nobody can see. And each one
    // has to say what bounds it INSTEAD — the reason text is the contract.
    const all = new Set(publicTokenResolvers());
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(all.has(file), `${file} is exempt but no longer resolves a token`).toBe(true);
      expect(reason.length, `${file} needs a written reason`).toBeGreaterThan(40);
    }
  });

  it("applies the per-IP read guard on every resolver in scope", () => {
    // Matches the awaited CALL, not the identifier: a bare `includes(GUARD)`
    // is satisfied by the import line alone, so deleting the guard from a
    // page's body would leave this green. Caught by mutating one page.
    const missing = publicTokenPages().filter(
      (file) => !readFileSync(join(ROOT, file), "utf8").includes(`await ${GUARD}(`),
    );
    expect(missing).toEqual([]);
  });

  it("calls the guard BEFORE the page component resolves the token", () => {
    // Order is the whole point: a limiter that runs after `publicPetByToken()`
    // has already hit the database bounds nothing. Compares source positions
    // rather than trusting the call exists somewhere in the file.
    //
    // SCOPED TO THE PAGE COMPONENT, DELIBERATELY. /p/[publicToken] also has a
    // `generateMetadata` that resolves the token above the component, and it is
    // NOT behind the guard. That is a judgement, not an oversight: one HTTP
    // request runs both functions, `enforceRateLimit` is a counter INCREMENT,
    // and a second call would bill one visit twice — halving the effective
    // limit to 30/min for every legitimate finder. The metadata read is bounded
    // by its own budget, selects Tier-0 fields only (name, species, status,
    // sex) and degrades to a generic title, so what it leaks past a throttled
    // caller is one cheap read of data already on the credential's face. The
    // residual is documented in lib/infra/public-token-throttle.ts; closing it
    // needs a check-without-increment mode on the limiter.
    const outOfOrder: string[] = [];
    for (const file of publicTokenPages()) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const componentAt = src.indexOf("export default async function");
      expect(componentAt, `${file} has no default exported component`).toBeGreaterThan(-1);
      const body = src.slice(componentAt);

      const lookupAt = body.indexOf("publicPetByToken(");
      if (lookupAt === -1) continue; // component resolves the token some other way
      const guardAt = body.indexOf(`await ${GUARD}(`);
      if (guardAt === -1 || guardAt > lookupAt) outOfOrder.push(file);
    }
    expect(outOfOrder).toEqual([]);
  });

  it("gives each route its own limiter bucket", () => {
    // One shared bucket would let a scraper hammering /sighting spend the
    // budget of a finder loading the credential in the street, and would make
    // "which surface is being hit" unanswerable from the counters.
    const buckets = publicTokenPages().flatMap((file) => {
      const src = readFileSync(join(ROOT, file), "utf8");
      const m = src.match(new RegExp(`${GUARD}\\("([^"]+)"\\)`));
      return m ? [m[1]] : [];
    });
    expect(buckets.length).toBeGreaterThanOrEqual(3);
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});
