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
  API_V1_IP_BUCKET_FAMILIES,
  API_V1_PUBLIC_REFERENCE_IP_LIMIT,
} from "@/lib/infra/api-v1-limits";

const ROUTE_GLOB = "app/api/v1/**/route.ts";

/**
 * NON-VACUITY FLOOR. A glob that stops matching, or a regex that stops parsing,
 * yields an empty set — and an empty set is equal to nothing at all, which reads
 * exactly like a clean run. Raise this when the surface grows; that is the whole
 * job of the number, and `check-api-v1-envelope.ts` has two written paragraphs
 * about the two times its own floor drifted instead.
 */
const MIN_IP_BUCKETS = 18;

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
    // 5 × 600 (four authenticated reads + localities) + 2 × 120 (the writes)
    // + 1 × 60 (revoke-sessions) = 3.300/min. The ten `pre-cgnat` buckets are
    // deliberately not in the sum.
    expect(API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE).toBe(3_300);
  });
});
