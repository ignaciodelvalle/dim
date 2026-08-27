// Every per-IP rate-limit bucket on `/api/v1` belongs to a declared FAMILY.
//
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// `lib/infra/public-token-throttle.ts` records what happened the last time a SET
// of rate-limited surfaces was described in prose: the comment said "the four
// HTML surfaces", there were five, and the fifth — `/adoptar/{petToken}` — spent
// months reading as a deliberate exception rather than as a gap, because a count
// in a comment is a claim about a set that nothing checks.
//
// WU-EAS-2 re-derived the ceilings for `app/api/v1/me/**` and
// `app/api/v1/localities/**` against Argentine carrier NAT and deliberately left
// ten sibling buckets on the older numbers. That is exactly the shape that
// defect had: same caller, same phone, same gateway, different ceiling one screen
// later. So the list of what moved and what did not is NOT written in prose. It
// is `API_V1_IP_BUCKET_FAMILIES`, and this file is what makes it true.
//
// WHAT IS ASSERTED, AND WHY BOTH DIRECTIONS
// ---------------------------------------------------------------------------
//   source → map: a per-IP bucket that exists in a route but is in no family is
//     a route that landed without anybody deciding what its ceiling should be.
//   map → source: a family entry with no bucket behind it is a claim about a
//     surface that no longer has it, which is how an inventory quietly becomes
//     fiction while still reading as complete.
//
// AND, SINCE 2026-08-26, THE ASSIGNMENT ITSELF — the hole a review found in the
// two directions above. Both of them are SET assertions: they prove every bucket
// is named somewhere in the map and that the map names nothing extra. Neither
// looks at WHICH family a bucket was filed under. A write route filed as
// `authenticated-read` would be in the map, would have a bucket behind it, would
// silently run at 600/min instead of 120/min — five times its intended ceiling —
// and would pass every assertion this file had.
//
// That is the SAME defect this file was written about, one level up. The prose
// in `public-token-throttle.ts` miscounted a set; a set assertion that ignores
// the labels miscounts the mapping. "The fence" has to fence the misdeclared
// route and not only the undeclared one, so two more things are derived from
// source rather than trusted:
//
//   CEILING → FAMILY. Every CGNAT-family call site passes a shared constant
//     (`API_V1_AUTHENTICATED_READ_IP_LIMIT` and its three siblings) as the third
//     argument to its limiter. That identifier says what the route ACTUALLY
//     spends, so the declared family must be the one that constant belongs to. A
//     route-local constant (`PET_DETAIL_IP_LIMIT` and friends) means the route
//     owns its own number, which is exactly what `pre-cgnat` declares.
//
//   HTTP METHOD → FAMILY. A bucket spent inside `export async function GET`
//     cannot belong to a write family and vice versa. This is the half that
//     catches the review's scenario at its source: mislabelling a POST route as
//     `authenticated-read` requires ALSO handing it the read constant, and the
//     handler it sits in gives that away. `pre-cgnat` is exempt — it contains
//     both reads and writes by construction — but it is not exempt from the
//     ceiling check, so a `pre-cgnat` bucket cannot quietly pick up a CGNAT
//     ceiling while still reading as out of scope.
//
// HOW A BUCKET IS RECOGNISED AS PER-IP, and the blind spot that comes with it.
// The `api_v1_*` bucket literals in a route are collected, then partitioned by
// what they are KEYED on at the call site: `callerIp(` in the same call means
// per-IP, anything else (a `live.user.id`) means per-user. That is a regex over
// source, so it is defeated by a call whose arguments span a shape this does not
// parse — which is a real limit and is why the NON-VACUITY floor below exists:
// a parser that silently stops matching produces an empty set, and an empty set
// passes every equality assertion in this file.

import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  API_V1_ACCOUNT_SECURITY_IP_LIMIT,
  API_V1_AUTHENTICATED_READ_IP_LIMIT,
  API_V1_AUTHENTICATED_WRITE_IP_LIMIT,
  API_V1_AUTHENTICATED_WRITE_USER_LIMIT,
  API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE,
  API_V1_INBOX_STATE_IP_LIMIT,
  API_V1_INBOX_STATE_USER_LIMIT,
  API_V1_IP_BUCKET_FAMILIES,
  API_V1_IP_FAMILIES,
  API_V1_PUBLIC_REFERENCE_IP_LIMIT,
  type ApiV1IpFamily,
} from "@/lib/infra/api-v1-limits";

const ROUTE_GLOB = "app/api/v1/**/route.ts";

/**
 * NON-VACUITY FLOOR. A glob that stops matching, or a regex that stops parsing,
 * yields an empty set — and an empty set is equal to nothing at all, which reads
 * exactly like a clean run. Raise this when the surface grows; that is the whole
 * job of the number, and `check-api-v1-envelope.ts` has two written paragraphs
 * about the two times its own floor drifted instead.
 */
const MIN_IP_BUCKETS = 20;

/**
 * Collects `enforceRateLimit`-style bucket literals from a route's source and
 * says which are keyed on the caller IP.
 *
 * The routes use two spellings — `enforceRateLimit(bucket, callerIp(...), limit)`
 * directly, and a local `spendBudget(bucket, callerIp(...), limit)` helper — so
 * the match is on the ARGUMENT SHAPE rather than on the callee name. A bucket
 * literal followed by `callerIp(` before the next `)` of the call is per-IP.
 */
function ipBucketsIn(source: string): string[] {
  const found: string[] = [];
  const call = /"(api_v1_[a-z0-9_]+)"\s*,\s*([^;]{0,200}?)\)/gs;
  for (const match of source.matchAll(call)) {
    const [, bucket, rest] = match;
    if (rest.includes("callerIp(")) found.push(bucket);
  }
  return found;
}

function collectIpBuckets(): string[] {
  const files = globSync(ROUTE_GLOB);
  const buckets = new Set<string>();
  for (const file of files) {
    for (const bucket of ipBucketsIn(readFileSync(file, "utf8"))) buckets.add(bucket);
  }
  return [...buckets].sort();
}

// ---------------------------------------------------------------------------
// The assignment parser — a SECOND, stricter read of the same call sites
// ---------------------------------------------------------------------------

/**
 * Which family a shared ceiling constant belongs to.
 *
 * Keyed by IDENTIFIER, because the identifier is what appears at the call site
 * and the call site is the only place that says what a route really spends.
 * Renaming an export therefore fails this file loudly instead of silently
 * dropping a route into the `pre-cgnat` bucket below — which is the failure
 * this table would otherwise introduce.
 */
const FAMILY_OF_SHARED_CEILING: Readonly<Record<string, ApiV1IpFamily>> = {
  API_V1_AUTHENTICATED_READ_IP_LIMIT: "authenticated-read",
  API_V1_AUTHENTICATED_WRITE_IP_LIMIT: "authenticated-write",
  API_V1_ACCOUNT_SECURITY_IP_LIMIT: "account-security",
  API_V1_INBOX_STATE_IP_LIMIT: "inbox-state",
  API_V1_PUBLIC_REFERENCE_IP_LIMIT: "public-reference",
};

/**
 * Families whose buckets may only be spent by a read handler, and vice versa.
 *
 * EVERY FAMILY EXCEPT `pre-cgnat` HAS TO BE IN ONE OF THESE TWO, or the method
 * fence below silently stops applying to it — a family missing from both lists
 * is exempt from the check that catches a write route wearing a read ceiling,
 * which is the failure this whole describe block exists for. The exhaustiveness
 * test underneath is what makes that impossible to do by omission.
 */
const READ_FAMILIES: readonly ApiV1IpFamily[] = ["authenticated-read", "public-reference"];
const WRITE_FAMILIES: readonly ApiV1IpFamily[] = [
  "authenticated-write",
  "account-security",
  "inbox-state",
];

type IpBucketSite = {
  readonly bucket: string;
  readonly file: string;
  /** The identifier passed as the ceiling — shared constant or route-local. */
  readonly ceiling: string;
  /** The exported handler the call sits inside, or null if it sits outside one. */
  readonly method: string | null;
};

/**
 * Every per-IP limiter CALL SITE, with the ceiling it spends and the handler it
 * lives in.
 *
 * Deliberately stricter than `ipBucketsIn` above: it requires the three-argument
 * shape `(bucketLiteral, callerIp(...), CEILING)` rather than merely finding
 * `callerIp(` somewhere in the argument list. A stricter parser has a bigger
 * blind spot, so the two are cross-checked for EQUALITY below instead of one
 * being trusted — a parser that quietly stops matching produces a smaller set,
 * and a smaller set satisfies every "is it in the map" assertion in this file.
 *
 * The handler is resolved by position: the last `export [async] function METHOD(`
 * before the call. That is a lexical approximation and it is fine for these
 * files, where every route is a flat list of exported handlers — but it is why
 * `method` is nullable and why a null is treated as a failure rather than as
 * "exempt".
 */
function collectIpBucketSites(): IpBucketSite[] {
  const call =
    /"(api_v1_[a-z0-9_]+)"\s*,\s*(callerIp\([^)]*\)|[A-Za-z0-9_.]+)\s*,\s*([A-Za-z0-9_.]+)\s*[,)]/gs;
  const handler = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;

  const sites: IpBucketSite[] = [];
  for (const file of globSync(ROUTE_GLOB)) {
    const source = readFileSync(file, "utf8");
    const handlers = [...source.matchAll(handler)].map((m) => ({
      at: m.index ?? 0,
      method: m[1],
    }));

    for (const match of source.matchAll(call)) {
      const [, bucket, keyedOn, ceiling] = match;
      if (!keyedOn.startsWith("callerIp(")) continue; // per-user bucket, not ours
      const at = match.index ?? 0;
      const enclosing = handlers.filter((h) => h.at < at).at(-1) ?? null;
      sites.push({
        bucket,
        file: file.replaceAll("\\", "/"),
        ceiling,
        method: enclosing?.method ?? null,
      });
    }
  }
  return sites;
}

/** The family a call site's ceiling identifier implies. */
function familyFromCeiling(ceiling: string): ApiV1IpFamily {
  // A route-local constant IS the declaration that the route owns its own
  // number, which is what `pre-cgnat` means. Nothing else in this file has to
  // enumerate them, which matters: the ten of them are out of scope precisely
  // because nobody re-derived their ceilings, and a list here would be an
  // eleventh place to keep in step.
  return FAMILY_OF_SHARED_CEILING[ceiling] ?? "pre-cgnat";
}

describe("/api/v1 per-IP rate-limit buckets — every one has a declared family", () => {
  const buckets = collectIpBuckets();

  it("finds enough buckets that an equality assertion means something", () => {
    // Vacuity first: every other assertion in this file is an equality against a
    // set this function produced, so a function that produced nothing would make
    // all of them pass.
    expect(buckets.length).toBeGreaterThanOrEqual(MIN_IP_BUCKETS);
  });

  it("declares a family for every per-IP bucket the routes actually spend", () => {
    const undeclared = buckets.filter((b) => !(b in API_V1_IP_BUCKET_FAMILIES));
    expect(
      undeclared,
      "a per-IP bucket with no family is a route that landed without anybody " +
        "deciding what its ceiling should be — add it to API_V1_IP_BUCKET_FAMILIES",
    ).toEqual([]);
  });

  it("has no family entry for a bucket that no longer exists", () => {
    const orphaned = Object.keys(API_V1_IP_BUCKET_FAMILIES).filter((b) => !buckets.includes(b));
    expect(
      orphaned,
      "an inventory that still lists a removed bucket reads as complete while " +
        "describing a surface that changed",
    ).toEqual([]);
  });
});

describe("/api/v1 per-IP buckets — every one is filed under the RIGHT family", () => {
  const sites = collectIpBucketSites();
  const buckets = collectIpBuckets();

  it("sees the same buckets the membership parser sees", () => {
    // CROSS-CHECK BEFORE ANY VERDICT. Everything below is derived from the
    // stricter three-argument parser, which can stop matching a call whose shape
    // drifts — an argument split across a helper, a ceiling built inline. It
    // would then examine FEWER call sites and report a clean run, exactly the
    // vacuity failure MIN_IP_BUCKETS exists for one parser up. Two independent
    // reads of the same files must agree, or neither is evidence.
    expect(
      [...new Set(sites.map((s) => s.bucket))].sort(),
      "the assignment parser and the membership parser disagree about which " +
        "buckets exist — one of them stopped matching a call site, and the " +
        "assertions below are only meaningful over the set they share",
    ).toEqual(buckets);
  });

  it("resolves an enclosing handler for every call site", () => {
    // A null method is not "exempt from the method fence"; it is the fence
    // failing to see. Said out loud so a future limiter hoisted into a shared
    // helper fails here instead of quietly opting itself out below.
    const orphaned = sites.filter((s) => s.method === null).map((s) => `${s.bucket} (${s.file})`);
    expect(
      orphaned,
      "a per-IP limiter that does not sit inside an exported handler cannot be " +
        "checked against its family's direction — move it into the handler or " +
        "teach this file how to resolve it",
    ).toEqual([]);
  });

  it("files every bucket under the family whose ceiling it actually spends", () => {
    // THE REVIEW'S SCENARIO, asserted at the only place that cannot lie about
    // it: the argument the route hands the limiter. A bucket declared
    // `authenticated-read` while spending API_V1_AUTHENTICATED_WRITE_IP_LIMIT —
    // or the reverse, which is the dangerous direction because it is a 5×
    // LOOSENING — fails here even though it is present in the map, has a bucket
    // behind it, and satisfies both set assertions above.
    const mismatched = sites
      .map((s) => ({
        bucket: s.bucket,
        file: s.file,
        declared: API_V1_IP_BUCKET_FAMILIES[s.bucket],
        spends: familyFromCeiling(s.ceiling),
        ceiling: s.ceiling,
      }))
      .filter((s) => s.declared !== s.spends)
      .map(
        (s) => `${s.bucket}: declared ${s.declared}, spends ${s.ceiling} (${s.spends}) — ${s.file}`,
      );
    expect(
      mismatched,
      "a bucket's declared family and the ceiling constant its route passes " +
        "disagree; the map is a claim about which ceiling applies, so the call " +
        "site wins and the map is what has to change",
    ).toEqual([]);
  });

  it("never spends a read family's ceiling from a write handler, or the reverse", () => {
    // The second half, and the one that catches the mislabelling BEFORE the
    // ceiling constant is chosen to match it. `pre-cgnat` is exempt by
    // construction — it holds both `api_v1_shares_read_ip` (GET) and
    // `api_v1_shares_write_ip` (POST) and always will.
    const wrongDirection = sites
      .filter((s) => {
        const family = API_V1_IP_BUCKET_FAMILIES[s.bucket];
        if (!family || family === "pre-cgnat") return false;
        return s.method === "GET"
          ? WRITE_FAMILIES.includes(family)
          : READ_FAMILIES.includes(family);
      })
      .map(
        (s) => `${s.bucket}: ${s.method} handler declared ${API_V1_IP_BUCKET_FAMILIES[s.bucket]}`,
      );
    expect(
      wrongDirection,
      "a write handler wearing a read family's ceiling runs at five times its " +
        "intended limit and reads as deliberate in the map — the family must " +
        "match the direction of the handler that spends it",
    ).toEqual([]);
  });
});

describe("/api/v1 rate-limit families — the numbers the derivation committed to", () => {
  it("keeps the authenticated write IP ceiling at 12× its per-user anchor", () => {
    // This is the load-bearing relationship in the write family: the IP ceiling
    // exists to stay far enough above the per-user one that the USER bucket is
    // the binding constraint for any plausible number of simultaneous legitimate
    // writers behind one carrier gateway. At the old 20/min, TWO people at their
    // own ceiling exhausted the gateway — the wrong bucket doing the refusing.
    expect(API_V1_AUTHENTICATED_WRITE_IP_LIMIT.maxPerMinute).toBe(
      (API_V1_AUTHENTICATED_WRITE_USER_LIMIT.maxPerMinute ?? 0) * 12,
    );
  });

  it("keeps the hourly write ceiling at THIRTY of its per-user anchor, not twelve", () => {
    // THE HALF NOBODY PINNED, and the docblock on the constant asserted the
    // wrong number for it until 2026-08-26 — "12× the per-user ceiling", flat,
    // when 1,200/hr is 30 × 40/hr and only the per-minute side is 12×.
    //
    // Pinned SEPARATELY and with the multiple spelled out, because the corrected
    // prose creates its own hazard: a reader who now sees two different factors
    // may read them as an inconsistency to tidy and "fix" 1,200 down to 480.
    // They differ on purpose. The per-user pair is 10/min and 40/hr — an hourly
    // cap deliberately far below a sustained per-minute rate — so carrying 12×
    // onto both windows would propagate that narrowing into the IP ceiling and
    // make the IP bucket the binding one again in the hour, which is the exact
    // inversion this family was re-derived to remove.
    expect(API_V1_AUTHENTICATED_WRITE_IP_LIMIT.maxPerHour).toBe(
      (API_V1_AUTHENTICATED_WRITE_USER_LIMIT.maxPerHour ?? 0) * 30,
    );
  });

  it("keeps account-security flat at 12× on BOTH windows", () => {
    // The contrast that makes the line above readable rather than arbitrary:
    // this family's per-user pair (5/min, 20/hr) is already proportionate, so
    // 12× preserves it on both windows — 60 and 240. Asserted so "the write
    // family's rule" in its docblock cannot silently become a third multiple.
    expect(API_V1_ACCOUNT_SECURITY_IP_LIMIT.maxPerMinute).toBe(60);
    expect(API_V1_ACCOUNT_SECURITY_IP_LIMIT.maxPerHour).toBe(240);
  });

  it("keeps account-security an order of magnitude below the read family", () => {
    // The half of `/me/revoke-sessions`'s original argument that survived: the
    // act really is rare. If this ever inverts, the family stopped meaning what
    // its docblock says it means.
    expect(API_V1_ACCOUNT_SECURITY_IP_LIMIT.maxPerMinute ?? 0).toBeLessThan(
      (API_V1_AUTHENTICATED_READ_IP_LIMIT.maxPerMinute ?? 0) / 5,
    );
  });

  it("gives the public reference read the same ceiling as an authenticated one", () => {
    // Not a coincidence to be tidied away later: `/api/v1/localities` has no
    // identity to fall back on, so its per-IP bucket is the ONLY bucket it has.
    // Tightening it below the authenticated family would put the strictest limit
    // on the surface with the weakest instrument.
    expect(API_V1_PUBLIC_REFERENCE_IP_LIMIT).toEqual(API_V1_AUTHENTICATED_READ_IP_LIMIT);
  });

  it("computes the CGNAT-family per-IP aggregate rather than asserting it in prose", () => {
    // Buckets are separate on purpose, so a per-IP ceiling is ADDITIVE across
    // them and the honest figure is the sum. §1.1 of api-invariants.md records
    // what happened when this number lived only in prose: an hourly figure was
    // transplanted into the per-minute slot and overstated the ceiling by 2.2×
    // in the paragraph that existed to state it honestly.
    //
    // THE TERMS USED TO BE TRANSCRIBED HERE ("5 × 600 … + 1 × 60 = 3.300/min")
    // and WU-Q-1 made them wrong: two buckets landed, the sum moved to 4.140,
    // and the arithmetic in this comment described a surface that no longer
    // existed. A comment that enumerates a set is a second copy of the set. The
    // list that cannot lie is `API_V1_IP_BUCKET_FAMILIES` next to the five
    // ceiling constants; what stays here is the PIN, which is the only part a
    // test can hold. `pre-cgnat` buckets are deliberately not in the sum.
    expect(API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE).toBe(4_140);
  });

  it("keeps inbox-state flat at 12× on BOTH windows, like account-security", () => {
    // The new family's own relationship, pinned for the reason the two above are:
    // its per-user pair (20/min, 200/hr) is already proportionate, so 12× carries
    // onto both windows without propagating a deliberate narrowing.
    expect(API_V1_INBOX_STATE_IP_LIMIT.maxPerMinute).toBe(
      (API_V1_INBOX_STATE_USER_LIMIT.maxPerMinute ?? 0) * 12,
    );
    expect(API_V1_INBOX_STATE_IP_LIMIT.maxPerHour).toBe(
      (API_V1_INBOX_STATE_USER_LIMIT.maxPerHour ?? 0) * 12,
    );
  });

  it("lets a person clear an inbox faster than they can hand over an animal", () => {
    // THE REASON THIS FAMILY EXISTS AT ALL, as an assertion rather than a
    // paragraph. If the inbox ceiling ever falls to the authenticated-write
    // family's, the eleventh tap on a screen whose entire purpose is to be tapped
    // through gets a 429 — and the web, which limits these writes not at all,
    // becomes strictly better at the thing both surfaces are for.
    expect(API_V1_INBOX_STATE_USER_LIMIT.maxPerMinute ?? 0).toBeGreaterThan(
      API_V1_AUTHENTICATED_WRITE_USER_LIMIT.maxPerMinute ?? 0,
    );
  });
});

describe("/api/v1 rate-limit families — the method fence covers every family", () => {
  it("classifies every non-pre-cgnat family as read-only or write-only", () => {
    // THE FENCE'S OWN BLIND SPOT, closed. The method check above skips any family
    // that is in neither READ_FAMILIES nor WRITE_FAMILIES — so a family added to
    // the union and forgotten in those two lists is silently exempt from the
    // check that catches a write route wearing a read ceiling. That is the very
    // defect this describe block was extended to catch, reintroduced one level up
    // by omission.
    //
    // `API_V1_IP_FAMILIES` is complete by construction (a `satisfies` in
    // api-v1-limits.ts fails the build if a member is missing), which is what
    // makes this assertion mean something.
    const unclassified = API_V1_IP_FAMILIES.filter(
      (family) =>
        family !== "pre-cgnat" &&
        !READ_FAMILIES.includes(family) &&
        !WRITE_FAMILIES.includes(family),
    );
    expect(
      unclassified,
      "a family in neither list is exempt from the read/write direction check — " +
        "add it to READ_FAMILIES or WRITE_FAMILIES",
    ).toEqual([]);
  });

  it("never puts a family in both lists", () => {
    const both = API_V1_IP_FAMILIES.filter(
      (family) => READ_FAMILIES.includes(family) && WRITE_FAMILIES.includes(family),
    );
    expect(both).toEqual([]);
  });
});
