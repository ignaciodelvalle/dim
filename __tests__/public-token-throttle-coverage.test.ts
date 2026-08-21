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
// So the enumeration derives from CALL SITES of `publicPetByToken`, which is
// the thing the rule is actually about. Anything that resolves a public token
// is in scope by construction, whatever the file is called and wherever it
// lives. The exemptions below are the shapes that legitimately do not take the
// READ limiter, each with the reason and the limiter it takes instead.
//
// WIDENED TO src/ (Track 2, 2026-08-21) — AND WHY, IN THE SAME COMMIT
// ---------------------------------------------------------------------------
// The scan walked `app/` only. That was the whole world while every resolver
// was a route file, and it stopped being true the moment the credential's
// decision moved into a use-case: `lookupPublicCredential` in
// src/modules/pets/application/read/ now runs the throttle, the pet-row lookup
// and the view-data fan-out, and the page is a renderer over its four-way
// answer. An `app/`-only walk would have watched the guard leave its scope and
// reported nothing — the fence would have gone green precisely because the
// code it guards moved. So the roots widened in the commit that moved it.
//
// The move also changed what "applies the guard" LOOKS like, and the fence has
// to accept the new shape without accepting less:
//
//   • DIRECT  — `await isPublicTokenReadThrottled("bucket")` in the route
//     itself. The original shape; still how /encontre, /sighting and the OG
//     image do it.
//   • PORT    — `await throttle.isThrottled()` inside a use-case. The use-case
//     may NOT import next/headers (the application fence), so the limiter
//     arrives as a parameter. It is REQUIRED, so no caller can reach the pet
//     row without one: the type checker enforces what this fence merely
//     watches.
//   • ADAPTER — `publicTokenThrottle("bucket")` at a call site that hands the
//     port to such a use-case. The file does not run the guard; it supplies it.
//
// The ADAPTER form is the one that could rot into a hole, so it carries a
// second layer: every caller of `lookupPublicCredential(` must pass
// `throttle: publicTokenThrottle("<literal>")` naming a bucket from the known
// list. A non-literal bucket is rejected — `publicTokenThrottle(bucket)` with a
// variable is how one surface silently starts spending another's counter, and
// makes "which surface is being hammered" unanswerable from the storage.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
/** Both layers that can resolve a public token: route files and use-cases. */
const SCAN_ROOTS = ["app", "src"] as const;
const GUARD = "isPublicTokenReadThrottled";
const LOOKUP = "publicPetByToken(";
/** The application-layer door every public-credential renderer goes through. */
const DOOR = "lookupPublicCredential(";
/** The infrastructure adapter that binds the limiter to a request. */
const ADAPTER = "publicTokenThrottle(";
/** How a use-case applies the injected limiter. */
const PORT_CALL = "await throttle.isThrottled()";

/**
 * Every limiter bucket this surface family is allowed to spend. A bucket per
 * route so one abusive scraper cannot spend a legitimate finder's budget on a
 * different page, and so the counters stay readable when someone asks which
 * surface is being hammered.
 *
 * `public_token_api_credential` is RESERVED for the coming
 * `GET /api/v1/pets/{token}/credential` route handler (Track 2) — listed ahead
 * of its use so adding the route is not also a fence edit under time pressure.
 */
const KNOWN_BUCKETS = new Set([
  "public_token_page",
  "public_token_sighting",
  "public_token_og_image",
  "public_token_encontre",
  "public_token_api_credential",
]);

type Source = { file: string; src: string };

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
  "src/modules/pets/application/sighting/report-pet-sighting.ts":
    "A WRITE use-case, bounded harder than any read: enforceRateLimit(`sighting:${publicToken}`, ip, ...) runs before it resolves the token. Its route (/sighting/page.tsx) already takes the read limiter, so the read path is covered where reading happens.",
  "src/modules/custody-disputes/application/report-dispute-tip.ts":
    "A WRITE use-case with the same shape: enforceRateLimit(`dispute_tip:${publicToken}`, ip, ...) before the lookup. The form it backs lives on /p/[publicToken], which takes the read limiter.",
};

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/** Every non-test source file under the scanned roots, with its contents. */
function allSources(): Source[] {
  const found: Source[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    for (const entry of readdirSync(abs, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      if (entry.name.includes(".test.")) continue;
      const file = join(entry.parentPath, entry.name);
      found.push({
        file: file.slice(ROOT.length + 1).replaceAll("\\", "/"),
        src: readFileSync(file, "utf8"),
      });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** Every file that resolves a public credential token. */
function publicTokenResolvers(): Source[] {
  return allSources().filter((s) => s.src.includes(LOOKUP));
}

/** The ones the rule applies to: resolvers minus documented exemptions. */
function publicTokenPages(): Source[] {
  return publicTokenResolvers().filter((s) => EXEMPT[s.file] === undefined);
}

// ---------------------------------------------------------------------------
// Pure predicates — the fence logic, testable against fixtures (RED controls)
// ---------------------------------------------------------------------------

/**
 * Which of the three legitimate forms a file carries, or null.
 *
 * Matches the awaited CALL, not the identifier: a bare `includes(GUARD)` is
 * satisfied by the import line alone, so deleting the guard from a page's body
 * would leave this green. Caught by mutating one page.
 */
function guardForm(src: string): "direct" | "port" | "adapter" | null {
  if (src.includes(`await ${GUARD}(`)) return "direct";
  if (src.includes(PORT_CALL)) return "port";
  if (src.includes(ADAPTER)) return "adapter";
  return null;
}

/** Every argument text handed to the adapter, e.g. `"public_token_page"`. */
function adapterArgs(src: string): string[] {
  const out: string[] = [];
  const re = /publicTokenThrottle\(([^)]*)\)/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) out.push(m[1].trim());
  return out;
}

/** Every bucket literal a file names, in either the direct or adapter form. */
function bucketLiterals(src: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:${GUARD}|publicTokenThrottle)\\("([^"]+)"\\)`, "g");
  for (let m = re.exec(src); m !== null; m = re.exec(src)) out.push(m[1]);
  return out;
}

/** True for the file that DEFINES the door (it takes the port, never binds it). */
function definesDoor(src: string): boolean {
  return src.includes(`export async function ${DOOR.slice(0, -1)}(`);
}

/**
 * Problems with one caller of the door: it must hand over a limiter, and the
 * bucket must be a literal from the known list.
 */
function doorCallerViolations({ file, src }: Source): string[] {
  const problems: string[] = [];
  if (!src.includes(`throttle: ${ADAPTER}`)) {
    problems.push(`${file}: calls ${DOOR} without \`throttle: ${ADAPTER}…)\``);
  }
  for (const arg of adapterArgs(src)) {
    if (!/^"[a-z_]+"$/.test(arg)) {
      problems.push(`${file}: limiter bucket must be a string literal, got \`${arg}\``);
    } else if (!KNOWN_BUCKETS.has(arg.slice(1, -1))) {
      problems.push(`${file}: unknown limiter bucket ${arg}`);
    }
  }
  return problems;
}

/** True when the file applies its guard before it resolves anything. */
function portPrecedesLookup(src: string): boolean {
  const portAt = src.indexOf(PORT_CALL);
  if (portAt === -1) return false;
  for (const marker of [LOOKUP, ".findPet("]) {
    const at = src.indexOf(marker);
    if (at !== -1 && at < portAt) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The fence, over the real tree
// ---------------------------------------------------------------------------

describe("public-token routes are rate limited", () => {
  it("finds every public-token resolver across app/ AND src/", () => {
    // NON-VACUITY. If the walk or the lookup match breaks, every assertion
    // below passes over an empty list — the exact failure shape this repo keeps
    // rediscovering in its own fences.
    const all = publicTokenResolvers().map((s) => s.file);
    expect(all.length).toBeGreaterThanOrEqual(9);

    const pages = publicTokenPages().map((s) => s.file);
    expect(pages.length).toBeGreaterThanOrEqual(5);
    // The ones that were missing the guard, named explicitly: if any is renamed
    // away, that is a decision someone should make on purpose.
    expect(pages).toContain("app/(public)/p/[publicToken]/encontre/page.tsx");
    expect(pages).toContain("app/(public)/p/[publicToken]/sighting/page.tsx");
    // THE ONE THE OLD SCOPE COULD NOT SEE. Not a page.tsx, and a separate HTTP
    // request that scrapers fetch directly.
    expect(pages).toContain("app/(public)/p/[publicToken]/opengraph-image.tsx");
    // THE ONE THE app/-ONLY SCOPE COULD NOT SEE — the credential's decision
    // now lives in the application layer.
    expect(pages).toContain("src/modules/pets/application/read/lookup-public-credential.ts");

    // The widening is only real if it actually reaches the new root.
    expect(all.filter((f) => f.startsWith("src/")).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps every exemption pointed at a file that still resolves a token", () => {
    // An exemption for a file that moved is a hole nobody can see. And each one
    // has to say what bounds it INSTEAD — the reason text is the contract.
    const all = new Set(publicTokenResolvers().map((s) => s.file));
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(all.has(file), `${file} is exempt but no longer resolves a token`).toBe(true);
      expect(reason.length, `${file} needs a written reason`).toBeGreaterThan(40);
    }
  });

  it("applies the per-IP read guard, in one of its three forms, on every resolver in scope", () => {
    const missing = publicTokenPages()
      .filter((s) => guardForm(s.src) === null)
      .map((s) => s.file);
    expect(missing).toEqual([]);
  });

  it("exercises all three guard forms — none is dead weight the fence still accepts", () => {
    // NON-VACUITY for the widening itself. If `port` or `adapter` stops having
    // a real user, the accepted-forms list is looser than the code needs and
    // should shrink in the commit that removed the last user.
    const forms = new Set(publicTokenPages().map((s) => guardForm(s.src)));
    expect([...forms].sort()).toEqual(["adapter", "direct", "port"]);
  });

  it("calls the guard BEFORE the route component resolves the token", () => {
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
    for (const { file, src } of publicTokenPages()) {
      if (!file.startsWith("app/")) continue;
      const componentAt = src.indexOf("export default async function");
      expect(componentAt, `${file} has no default exported component`).toBeGreaterThan(-1);
      const body = src.slice(componentAt);

      const lookupAt = body.indexOf(LOOKUP);
      if (lookupAt === -1) continue; // component resolves the token some other way
      const guardAt = body.indexOf(`await ${GUARD}(`);
      if (guardAt === -1 || guardAt > lookupAt) outOfOrder.push(file);
    }
    expect(outOfOrder).toEqual([]);
  });

  it("applies the port BEFORE the use-case resolves the token", () => {
    // Same rule as above, stated for the layer the decision moved to. The page
    // component no longer resolves the token itself, so without this the
    // ordering guarantee would simply have evaporated in the refactor.
    const outOfOrder = publicTokenPages()
      .filter((s) => s.file.startsWith("src/") && !portPrecedesLookup(s.src))
      .map((s) => s.file);
    expect(outOfOrder).toEqual([]);
  });

  it("makes every caller of the door hand over a literal, known bucket", () => {
    // The second layer under the ADAPTER form. The type checker already forces
    // a caller to pass SOME limiter; this forces it to be a named surface.
    const callers = allSources().filter((s) => s.src.includes(DOOR) && !definesDoor(s.src));
    // NON-VACUITY: at least the page. An empty caller list means the door was
    // renamed and this assertion stopped seeing anything.
    expect(callers.map((s) => s.file)).toContain("app/(public)/p/[publicToken]/page.tsx");

    const problems = callers.flatMap(doorCallerViolations);
    expect(problems).toEqual([]);
  });

  it("gives each route its own limiter bucket", () => {
    // One shared bucket would let a scraper hammering /sighting spend the
    // budget of a finder loading the credential in the street, and would make
    // "which surface is being hit" unanswerable from the counters.
    const buckets = publicTokenPages().flatMap((s) => bucketLiterals(s.src));
    expect(buckets.length).toBeGreaterThanOrEqual(3);
    expect(new Set(buckets).size).toBe(buckets.length);
    for (const bucket of buckets) expect(KNOWN_BUCKETS.has(bucket)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RED controls — the detector must BITE. A fence that has never failed is a
// fence nobody has proved works.
// ---------------------------------------------------------------------------

describe("the fence bites", () => {
  it("flags a src resolver that takes no limiter at all", () => {
    const fixture = `
      import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
      export async function leakPet(publicToken: string) {
        return db.select().from(pets).where(publicPetByToken(publicToken));
      }`;
    expect(guardForm(fixture)).toBeNull();
    // And the real tree does NOT look like that.
    expect(publicTokenPages().filter((s) => guardForm(s.src) === null)).toEqual([]);
  });

  it("flags a use-case that resolves the token before awaiting its port", () => {
    const inverted = `
      export async function lookupPublicCredential(input, deps) {
        const row = await deps.findPet(input.publicToken);
        if (await throttle.isThrottled()) return { status: "throttled" };
        return row;
      }`;
    expect(portPrecedesLookup(inverted)).toBe(false);

    const correct = `
      export async function lookupPublicCredential(input, deps) {
        if (await throttle.isThrottled()) return { status: "throttled" };
        const row = await deps.findPet(input.publicToken);
        return row;
      }`;
    expect(portPrecedesLookup(correct)).toBe(true);
  });

  it("flags a caller that passes a non-literal bucket", () => {
    const dynamic = {
      file: "app/(public)/p/[publicToken]/fake/page.tsx",
      src: "const l = await lookupPublicCredential({ publicToken, throttle: publicTokenThrottle(bucket) });",
    };
    expect(doorCallerViolations(dynamic)).toEqual([
      "app/(public)/p/[publicToken]/fake/page.tsx: limiter bucket must be a string literal, got `bucket`",
    ]);
  });

  it("flags a caller that names an unknown bucket", () => {
    const unknown = {
      file: "app/(public)/p/[publicToken]/fake/page.tsx",
      src: `await lookupPublicCredential({ publicToken, throttle: publicTokenThrottle("whatever") });`,
    };
    expect(doorCallerViolations(unknown)).toEqual([
      'app/(public)/p/[publicToken]/fake/page.tsx: unknown limiter bucket "whatever"',
    ]);
  });

  it("flags a caller that hands the door no limiter", () => {
    const bare = {
      file: "app/(public)/p/[publicToken]/fake/page.tsx",
      src: "const l = await lookupPublicCredential({ publicToken });",
    };
    expect(doorCallerViolations(bare)).toEqual([
      "app/(public)/p/[publicToken]/fake/page.tsx: calls lookupPublicCredential( without `throttle: publicTokenThrottle(…)`",
    ]);
  });
});
