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
//   • WRITE   — `await enforceRateLimit("<surface>:<token>", ip, …)` in an
//     anonymous POST use-case. A harder limit than the read one (1/min + 10/hr
//     per IP+token vs 60/min), so it bounds the same enumeration more tightly;
//     what it does NOT do on its own is bound it FIRST. See below.
//   • ADAPTER — `publicTokenThrottle("bucket")` at a call site that hands the
//     port to such a use-case. The file does not run the guard; it supplies it.
//
// EVERY FORM IS ALSO AN ORDERING (widened 2026-08-21)
// ---------------------------------------------------------------------------
// The WRITE form arrived by DELETING two exemptions, not by adding a loophole.
// report-pet-sighting.ts and report-dispute-tip.ts were exempt on the written
// ground that their write limiter "runs before it resolves the token" — and it
// ran after, in both. Nothing checked, because the ordering rule was stated for
// the `port` shape only. A hand-rolled POST needs no page load, so each was an
// unbounded oracle answering "does this token exist?" and "is this animal lost
// / under custody review?" through its DISTINCT refusal strings. The order was
// inverted in the same commit, the exemptions deleted, and the ordering check
// generalised to whichever form a file carries.
//
// EVERY PREDICATE READS CODE, NOT COMMENTS (fixed 2026-08-21)
// ---------------------------------------------------------------------------
// The match texts are sentence fragments. A docblock stating the contract
// truthfully contains them verbatim, so the fence used to grade documentation:
// a use-case with `// …run: await throttle.isThrottled()` and no limiter passed
// as `port`, and a comment warning against `publicTokenThrottle(someVariable)`
// failed the literal-bucket check. Everything below goes through
// scripts/lib/strip-comments.mjs first.
//
// The ADAPTER form is the one that could rot into a hole, so it carries a
// second layer: every caller of `lookupPublicCredential(` must pass
// `throttle: publicTokenThrottle("<literal>")` naming a bucket from the known
// list. A non-literal bucket is rejected — `publicTokenThrottle(bucket)` with a
// variable is how one surface silently starts spending another's counter, and
// makes "which surface is being hammered" unanswerable from the storage.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "@/scripts/lib/strip-comments.mjs";
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
/** The harder per-(IP, token) limiter the anonymous WRITE use-cases take. */
const WRITE_LIMITER = "await enforceRateLimit(";

/**
 * Every limiter bucket this surface family is allowed to spend. A bucket per
 * route so one abusive scraper cannot spend a legitimate finder's budget on a
 * different page, and so the counters stay readable when someone asks which
 * surface is being hammered.
 *
 * `public_token_api_credential` was listed here BEFORE its route existed, so
 * that adding the endpoint would not also be a fence edit under time pressure.
 * It landed on 2026-08-21 (`app/api/v1/pets/[publicToken]/credential/route.ts`)
 * and the reservation is now a real user — which the door-caller assertions
 * below exercise, so nothing has to remember to delete this note.
 *
 * The endpoint's SECOND bucket, `public_token_api_credential_lookup`, is not
 * listed and must not be: this set gates the adapter's first argument, the
 * per-IP surface bucket. The narrower per-(token, IP) limiter is configured
 * inside the adapter's options object, where it is not a call-site literal.
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
 *
 * THREE CAME OUT ON 2026-08-21, AND THE REASON IS WHY THIS LIST IS DANGEROUS.
 * `report-pet-sighting.ts` and `report-dispute-tip.ts` were exempt on the
 * written ground that their harder write limiter "runs before it resolves the
 * token". It did not — both resolved the token FIRST and consulted the limiter
 * afterwards, so each was an unbounded token-existence-and-status oracle for
 * any hand-rolled POST. The exemption text asserted an ORDER that nothing
 * checked, which is strictly worse than no exemption: it reads as a reviewed
 * decision. The fix inverted the real order and both files are now IN SCOPE,
 * carrying the WRITE form below where the fence can see the ordering itself.
 *
 * `encontre/action.ts` was the THIRD, and its exemption is the reason to
 * distrust the honest-looking ones too. When the first two were fixed, this
 * file's entry was REWRITTEN to admit the same inversion — "its limiter runs
 * AFTER its token lookup … Tracked, not fixed here" — and left in place. A
 * documented hole is still a hole, and the file it excused is the heaviest of
 * the three: its refusals distinguish "no existe" from "no está perdida" from
 * "titularidad en revisión", and its non-form branch calls the Supabase ADMIN
 * API to resolve the owner's email. The order was inverted and the entry
 * deleted in the same commit, so the WRITE form's positional check below now
 * covers it like the other two.
 */
const EXEMPT: Record<string, string> = {
  "app/(public)/adoptar/[petToken]/page.tsx":
    "Resolves only pets that are adoption-LISTED — a non-listed token reaches notFound() at the isListable gate. Listed pets are already enumerable from the public /adoptar catalog, so this surface reveals nothing the catalog does not.",
  "app/(public)/adoptar/[petToken]/postular/page.tsx":
    "Same listed-only gate as the detail page above; it is the apply step of the same public catalog entry.",
};

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * The file's CODE, with every comment blanked to whitespace.
 *
 * WHY EVERY PREDICATE GOES THROUGH THIS. The match texts below are sentence
 * fragments — `await throttle.isThrottled()`, `publicTokenThrottle(` — and a
 * docblock that TELLS THE TRUTH about the contract contains them verbatim. So
 * the fence reacted to documentation, in both directions:
 *
 *   - Fails OPEN: a use-case with `// The caller is expected to have run:
 *     await throttle.isThrottled()` in a comment and NO limiter in code read as
 *     `port`, ordering check included.
 *   - Fails CLOSED: a Track 2 writer's accurate comment explaining why a
 *     variable bucket is banned — it named `publicTokenThrottle(someVariable)`
 *     — was tallied as a real call site and failed the literal-bucket check. A
 *     fence that penalises correct documentation teaches worse comments.
 *
 * scripts/lib/strip-comments.mjs substitutes whitespace 1:1 and keeps newlines,
 * so byte offsets survive and the ORDERING comparisons below still line up with
 * the original file. Memoised because the resolver filter strips every file
 * under both roots (~1400 files, ~60ms) and the predicates then re-ask for the
 * same handful.
 */
const strippedCache = new Map<string, string>();
function code(src: string): string {
  const hit = strippedCache.get(src);
  if (hit !== undefined) return hit;
  const out = stripComments(src);
  strippedCache.set(src, out);
  return out;
}

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

/** Every file that resolves a public credential token — in CODE, not in prose. */
function publicTokenResolvers(): Source[] {
  return allSources().filter((s) => code(s.src).includes(LOOKUP));
}

/** The ones the rule applies to: resolvers minus documented exemptions. */
function publicTokenPages(): Source[] {
  return publicTokenResolvers().filter((s) => EXEMPT[s.file] === undefined);
}

// ---------------------------------------------------------------------------
// Pure predicates — the fence logic, testable against fixtures (RED controls)
// ---------------------------------------------------------------------------

/**
 * The four legitimate shapes, each mapped to the call text that proves it RAN.
 *
 * Matching the awaited CALL and not the identifier is deliberate: a bare
 * `includes(GUARD)` is satisfied by the import line alone, so deleting the
 * guard from a page's body would leave this green. Caught by mutating one page.
 *
 * Probe order matters — a file carrying two shapes is classified by the
 * strongest one it runs itself, and `adapter` (which runs nothing, it only
 * SUPPLIES a limiter) is last.
 */
const FORM_CALLS = {
  direct: `await ${GUARD}(`,
  port: PORT_CALL,
  write: WRITE_LIMITER,
  adapter: ADAPTER,
} as const;
type GuardForm = keyof typeof FORM_CALLS;
const FORM_PROBE_ORDER: readonly GuardForm[] = ["direct", "port", "write", "adapter"];

/** Which of the four legitimate forms a file carries, or null. */
function guardForm(src: string): GuardForm | null {
  const c = code(src);
  return FORM_PROBE_ORDER.find((form) => c.includes(FORM_CALLS[form])) ?? null;
}

/**
 * The BUCKET argument handed to each adapter call, e.g. `"public_token_page"`.
 *
 * WIDENED 2026-08-21, AND THE WIDENING IS THE HONEST KIND. It used to be
 * `publicTokenThrottle\(([^)]*)\)` — everything up to the first `)` — which
 * assumed a one-argument call. The adapter now takes an optional second
 * argument (`{ perLookup: … }`, the narrower limiter the /api/v1 route layers
 * on top), so that pattern captured `"public_token_api_credential", {` and
 * failed the literal check on a call that is perfectly literal.
 *
 * The fix reads only the FIRST argument — up to a comma or the closing paren —
 * because the first argument is what the rule is about: one surface, one named
 * bucket, no computed value. It is NOT a relaxation: a variable first argument
 * still fails (see the RED controls below, including one for the two-argument
 * shape specifically). What the fence stops watching is the second argument,
 * which names its own bucket inside an object and is not a call-site literal
 * this predicate could read anyway.
 */
function adapterArgs(src: string): string[] {
  const out: string[] = [];
  const re = /publicTokenThrottle\(\s*([^,)]*)/g;
  const c = code(src);
  for (let m = re.exec(c); m !== null; m = re.exec(c)) out.push(m[1].trim());
  return out;
}

/**
 * Every bucket literal a file names, in either the direct or adapter form.
 *
 * Same widening as `adapterArgs`, for the same reason: the trailing `\)` in the
 * old pattern silently stopped matching the moment the adapter grew a second
 * argument, and a bucket-uniqueness check that matches NOTHING passes.
 */
function bucketLiterals(src: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:${GUARD}|publicTokenThrottle)\\(\\s*"([^"]+)"`, "g");
  const c = code(src);
  for (let m = re.exec(c); m !== null; m = re.exec(c)) out.push(m[1]);
  return out;
}

/** True for the file that DEFINES the door (it takes the port, never binds it). */
function definesDoor(src: string): boolean {
  return code(src).includes(`export async function ${DOOR.slice(0, -1)}(`);
}

/**
 * Problems with one caller of the door: it must hand over a limiter, and the
 * bucket must be a literal from the known list.
 */
function doorCallerViolations({ file, src }: Source): string[] {
  const problems: string[] = [];
  if (!code(src).includes(`throttle: ${ADAPTER}`)) {
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

/**
 * True when the file runs its guard — whichever of the four forms it carries —
 * before it resolves anything.
 *
 * Generalised from a port-only check on 2026-08-21, when the two anonymous
 * WRITE use-cases came out of EXEMPT: their limiter is `enforceRateLimit`, and
 * a rule stated only for the `port` shape would have watched them enter scope
 * and said nothing about the very ordering that made them oracles.
 */
function guardPrecedesLookup(src: string): boolean {
  const form = guardForm(src);
  if (form === null) return false;
  const c = code(src);
  const guardAt = c.indexOf(FORM_CALLS[form]);
  for (const marker of [LOOKUP, ".findPet("]) {
    const at = c.indexOf(marker);
    if (at !== -1 && at < guardAt) return false;
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
    expect(pages.length).toBeGreaterThanOrEqual(7);
    // The ones that were missing the guard, named explicitly: if any is renamed
    // away, that is a decision someone should make on purpose.
    expect(pages).toContain("app/(public)/p/[publicToken]/encontre/page.tsx");
    expect(pages).toContain("app/(public)/p/[publicToken]/sighting/page.tsx");
    // THE TWO THAT WERE EXEMPT ON A FALSE PREMISE — the exemption text claimed
    // their write limiter ran before the lookup and it ran after. In scope now.
    expect(pages).toContain("src/modules/pets/application/sighting/report-pet-sighting.ts");
    expect(pages).toContain("src/modules/custody-disputes/application/report-dispute-tip.ts");
    // THE ONE THE OLD SCOPE COULD NOT SEE. Not a page.tsx, and a separate HTTP
    // request that scrapers fetch directly.
    expect(pages).toContain("app/(public)/p/[publicToken]/opengraph-image.tsx");
    // THE ONE THE app/-ONLY SCOPE COULD NOT SEE — the credential's decision
    // now lives in the application layer.
    expect(pages).toContain("src/modules/pets/application/read/lookup-public-credential.ts");

    // The widening is only real if it actually reaches the new root.
    expect(all.filter((f) => f.startsWith("src/")).length).toBeGreaterThanOrEqual(3);
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

  it("applies the per-IP read guard, in one of its four forms, on every resolver in scope", () => {
    const missing = publicTokenPages()
      .filter((s) => guardForm(s.src) === null)
      .map((s) => s.file);
    expect(missing).toEqual([]);
  });

  it("exercises all four guard forms — none is dead weight the fence still accepts", () => {
    // NON-VACUITY for the widening itself. If `port`, `write` or `adapter`
    // stops having a real user, the accepted-forms list is looser than the code
    // needs and should shrink in the commit that removed the last user.
    const forms = new Set(publicTokenPages().map((s) => guardForm(s.src)));
    expect([...forms].sort()).toEqual(["adapter", "direct", "port", "write"]);
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
    // TWO SHAPES LIVE UNDER app/, AND THE CHECK HAD ONLY EVER SEEN ONE.
    // Until 2026-08-21 every in-scope app/ resolver was a page component, so
    // this demanded `export default async function` and read the body from
    // there. Then `encontre/action.ts` came out of EXEMPT — a "use server"
    // ACTION, which has no default export at all — and the demand fired as a
    // failure on a file that had just been FIXED. The rule was never about
    // default exports; it is about the guard preceding the lookup, and for a
    // file with no component body the whole file IS the body. That is precisely
    // what `guardPrecedesLookup` computes for the src/ layer below, so the two
    // shapes now share one predicate instead of one of them owning the rule.
    const outOfOrder: string[] = [];
    let components = 0;
    let wholeFile = 0;
    for (const { file, src } of publicTokenPages()) {
      if (!file.startsWith("app/")) continue;
      // Comments blanked, offsets preserved — a `// await isPublicTokenRead…`
      // line above the lookup must not read as the guard having run.
      const componentAt = code(src).indexOf("export default async function");

      if (componentAt === -1) {
        wholeFile += 1;
        if (!guardPrecedesLookup(src)) outOfOrder.push(file);
        continue;
      }

      components += 1;
      const body = code(src).slice(componentAt);
      const lookupAt = body.indexOf(LOOKUP);
      if (lookupAt === -1) continue; // component resolves the token some other way
      const guardAt = body.indexOf(`await ${GUARD}(`);
      if (guardAt === -1 || guardAt > lookupAt) outOfOrder.push(file);
    }
    expect(outOfOrder).toEqual([]);
    // NON-VACUITY for BOTH arms. If either drops to zero the branch above it is
    // untested, and a check nobody exercises is a check nobody has proved.
    expect(components).toBeGreaterThanOrEqual(3);
    expect(wholeFile).toBeGreaterThanOrEqual(1);
  });

  it("applies the guard BEFORE the use-case resolves the token", () => {
    // Same rule as above, stated for the layer the decision moved to. The page
    // component no longer resolves the token itself, so without this the
    // ordering guarantee would simply have evaporated in the refactor.
    //
    // It covers the WRITE use-cases too, and that is the point: a hand-rolled
    // POST reaches them with no page load, so the lookup they run before their
    // limiter is an unbounded token-existence-and-status oracle. Both were
    // EXEMPT on the written claim that their limiter already ran first — it did
    // not, and nothing checked. This is the check.
    const outOfOrder = publicTokenPages()
      .filter((s) => s.file.startsWith("src/") && !guardPrecedesLookup(s.src))
      .map((s) => s.file);
    expect(outOfOrder).toEqual([]);
    // NON-VACUITY: an empty src/ slice would make the assertion above trivially
    // true, which is exactly how this fence went blind before.
    expect(publicTokenPages().filter((s) => s.file.startsWith("src/")).length).toBe(3);
  });

  it("makes every caller of the door hand over a literal, known bucket", () => {
    // The second layer under the ADAPTER form. The type checker already forces
    // a caller to pass SOME limiter; this forces it to be a named surface.
    const callers = allSources().filter((s) => code(s.src).includes(DOOR) && !definesDoor(s.src));
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
    expect(guardPrecedesLookup(inverted)).toBe(false);

    const correct = `
      export async function lookupPublicCredential(input, deps) {
        if (await throttle.isThrottled()) return { status: "throttled" };
        const row = await deps.findPet(input.publicToken);
        return row;
      }`;
    expect(guardPrecedesLookup(correct)).toBe(true);
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

  it("still flags a non-literal bucket when the adapter is called with TWO arguments", () => {
    // THE CONTROL FOR THE 2026-08-21 REGEX WIDENING. `adapterArgs` stopped
    // requiring the closing paren so the two-argument form would parse; this is
    // the proof that it did not stop reading the first argument. A fence
    // relaxed to make a real call pass, without a control for the shape it used
    // to reject, is a fence that has quietly been switched off.
    const dynamic = {
      file: "app/api/v1/pets/[publicToken]/credential/route.ts",
      src: "await lookupPublicCredential({ publicToken, throttle: publicTokenThrottle(bucket, { perLookup: { bucket: LOOKUP_BUCKET, key, limit } }) });",
    };
    expect(doorCallerViolations(dynamic)).toEqual([
      "app/api/v1/pets/[publicToken]/credential/route.ts: limiter bucket must be a string literal, got `bucket`",
    ]);
  });

  it("reads the bucket literal out of a TWO-argument adapter call", () => {
    // The other half of the same control: the widening must still SEE the
    // literal. A `bucketLiterals` that matched nothing would make the
    // one-bucket-per-route uniqueness assertion vacuously true.
    const twoArg = `await lookupPublicCredential({ publicToken, throttle: publicTokenThrottle("public_token_api_credential", { perLookup: { bucket: "x", key, limit } }) });`;
    expect(bucketLiterals(twoArg)).toEqual(["public_token_api_credential"]);
    expect(adapterArgs(twoArg)).toEqual(['"public_token_api_credential"']);
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

  it("does NOT accept a port call that lives only in a comment", () => {
    // THE HOLE THIS CLOSES. `PORT_CALL` is a sentence fragment, and a docblock
    // that TELLS THE TRUTH about the contract contains it verbatim — so a
    // use-case with the sentence in prose and no limiter in code read as
    // guarded. The fence reacted to documentation instead of behaviour, which
    // is the failure mode scripts/lib/strip-comments.mjs exists for.
    const commentOnly = `
      import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
      // The caller is expected to have run: await throttle.isThrottled()
      export async function leakPet(publicToken: string) {
        return db.select().from(pets).where(publicPetByToken(publicToken));
      }`;
    expect(guardForm(commentOnly)).toBeNull();
    expect(guardPrecedesLookup(commentOnly)).toBe(false);
  });

  it("does NOT accept a direct guard call that lives only in a comment", () => {
    const commentOnly = `
      /* await isPublicTokenReadThrottled("public_token_page") used to run here */
      export default async function Page({ publicToken }: { publicToken: string }) {
        return db.select().from(pets).where(publicPetByToken(publicToken));
      }`;
    expect(guardForm(commentOnly)).toBeNull();
  });

  it("does NOT read an illustrative adapter call out of a comment", () => {
    // The false positive a Track 2 writer actually hit: an accurate comment
    // explaining WHY a dynamic bucket is banned — `publicTokenThrottle(someVariable)`
    // — was tallied as a real call site and failed the literal-bucket check.
    // A fence that penalises correct documentation teaches worse comments.
    const illustrative = {
      file: "app/(public)/p/[publicToken]/fake/page.tsx",
      src: `
        // NEVER publicTokenThrottle(someVariable): a variable bucket lets one
        // surface silently spend another surface's counter.
        await lookupPublicCredential({ publicToken, throttle: publicTokenThrottle("public_token_page") });`,
    };
    expect(adapterArgs(illustrative.src)).toEqual(['"public_token_page"']);
    expect(doorCallerViolations(illustrative)).toEqual([]);
  });

  it("flags a WRITE use-case that resolves the token before its limiter", () => {
    // The two anonymous POST use-cases (sighting, dispute tip) are reachable by
    // hand-rolled POST with no page load, so the lookup they run before the
    // limiter is an unbounded token-existence oracle — their distinct error
    // strings separate "no existe" from "no está perdida".
    const inverted = `
      export async function reportPetSighting(publicToken: string) {
        const [pet] = await db.select().from(pets).where(publicPetByToken(publicToken));
        if (!pet) return { ok: false, error: "Mascota no encontrada." };
        await enforceRateLimit(\`sighting:\${publicToken}\`, ip, { maxPerMinute: 1 });
      }`;
    expect(guardForm(inverted)).toBe("write");
    expect(guardPrecedesLookup(inverted)).toBe(false);

    const correct = `
      export async function reportPetSighting(publicToken: string) {
        await enforceRateLimit(\`sighting:\${publicToken}\`, ip, { maxPerMinute: 1 });
        const [pet] = await db.select().from(pets).where(publicPetByToken(publicToken));
        if (!pet) return { ok: false, error: "Mascota no encontrada." };
      }`;
    expect(guardPrecedesLookup(correct)).toBe(true);
  });
});
