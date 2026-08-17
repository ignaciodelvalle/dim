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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const PUBLIC_TOKEN_DIR = join(ROOT, "app", "(public)", "p", "[publicToken]");
const GUARD = "isPublicTokenReadThrottled";

/** Every `page.tsx` under the public-token route tree, repo-relative. */
function publicTokenPages(): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(PUBLIC_TOKEN_DIR, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || entry.name !== "page.tsx") continue;
    const abs = join(entry.parentPath, entry.name);
    found.push(abs.slice(ROOT.length + 1).replaceAll("\\", "/"));
  }
  return found.sort();
}

describe("public-token routes are rate limited", () => {
  it("finds the route tree at all", () => {
    // NON-VACUITY. If the directory moves or the recursive walk stops matching,
    // every assertion below would pass over an empty list — the exact failure
    // shape this repo keeps rediscovering in its own fences.
    const pages = publicTokenPages();
    expect(pages.length).toBeGreaterThanOrEqual(3);
    // The two that were missing the guard, named explicitly: if either is
    // renamed away, that is a decision someone should make on purpose.
    expect(pages).toContain("app/(public)/p/[publicToken]/encontre/page.tsx");
    expect(pages).toContain("app/(public)/p/[publicToken]/sighting/page.tsx");
  });

  it("applies the per-IP read guard on every page in the tree", () => {
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
      expect(componentAt, `${file} has no default page component`).toBeGreaterThan(-1);
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
