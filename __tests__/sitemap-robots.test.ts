// app/sitemap.ts is an anonymous, force-dynamic route that reads three feeds
// from the database. These tests pin what bounds that work (audit 2026-09-fresh,
// A03-G2/G3/G8).
//
// WHAT WAS WRONG. Every GET /sitemap.xml ran a three-way fan-out with no
// deadline, no cache window and no `.limit()` on the organizations select, and
// the lost feed was handed a page size its reader multiplies by five: 5,000
// became a 25,000-row ordered scan, under a comment claiming both feeds were
// "already bounded". No test imported the module, so nothing could have seen
// any of it.
//
// Every expected number below is written out here rather than imported: a test
// that reads the constant it is checking agrees with any value the constant
// takes.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheRegistration, mockQueryAdoption, mockQueryLost, orgQuery } = vi.hoisted(() => ({
  cacheRegistration: {
    keys: null as unknown,
    options: null as { revalidate?: unknown; tags?: unknown } | null,
  },
  mockQueryAdoption: vi.fn(),
  mockQueryLost: vi.fn(),
  orgQuery: {
    limitCalls: [] as number[],
    rows: [] as Array<{ token: string; updatedAt: Date }>,
  },
}));

// The Data Cache needs a Next request context; here it is a pass-through that
// records how it was registered, which is the part under test.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, keys: unknown, options: { revalidate?: unknown }) => {
    cacheRegistration.keys = keys;
    cacheRegistration.options = options;
    return fn;
  },
}));

vi.mock("@/src/modules/adoption/infrastructure/adoption-listing-read", () => ({
  queryAdoptionListing: mockQueryAdoption,
}));

vi.mock("@/src/modules/lost/infrastructure/lost-listing-read", () => ({
  queryLostListing: mockQueryLost,
}));

// The real schema under a mocked client, so `organizations` is the real table
// object and only the query chain is fake. `.limit()` is the chain's terminal
// call: a select that loses it resolves to the chain object, not to rows, and
// the render fails on `.map` — so removing the bound cannot pass quietly.
vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async (n: number) => {
      orgQuery.limitCalls.push(n);
      return orgQuery.rows;
    },
  };
  return { ...schema, db: { select: () => chain } };
});

// loadWithTimeout reports a missed deadline; the report itself is not the
// subject here.
vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
  buildErrorReport: vi.fn(),
}));

import * as sitemapModule from "@/app/sitemap";

const sitemap = sitemapModule.default;

const LISTED_AT = new Date("2026-09-01T12:00:00.000Z");
const LOST_AT = new Date("2026-09-10T08:30:00.000Z");
const ORG_UPDATED_AT = new Date("2026-08-20T00:00:00.000Z");

beforeEach(() => {
  vi.useRealTimers();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mimar.example.ar");
  mockQueryAdoption.mockReset().mockResolvedValue({
    items: [{ petPublicToken: "DIM-ADPT-2345", adoptionListedAt: LISTED_AT }],
    nextCursor: null,
  });
  mockQueryLost.mockReset().mockResolvedValue({
    items: [{ petPublicToken: "DIM-LOST-2345", markedLostAt: LOST_AT }],
    nextCursor: null,
  });
  orgQuery.limitCalls = [];
  orgQuery.rows = [{ token: "ORG-REFU-2345", updatedAt: ORG_UPDATED_AT }];
});

describe("app/sitemap.ts — every read is bounded", () => {
  it("hands the lost feed its cap as the FOURTH argument, so 5,000 stays 5,000", async () => {
    // queryLostListing's superset cap is max(500, pageSize * 5) unless the
    // fourth argument overrides it. With three arguments this call scanned
    // 25,000 rows.
    await sitemap();
    expect(mockQueryLost).toHaveBeenCalledTimes(1);
    expect(mockQueryLost).toHaveBeenCalledWith({}, null, 5000, 5000);
  });

  it("keeps the adoption feed at the same ceiling (its reader already limits by page size)", async () => {
    await sitemap();
    expect(mockQueryAdoption).toHaveBeenCalledWith({}, null, 5000);
  });

  it("limits the organizations select, which had no bound at all", async () => {
    await sitemap();
    expect(orgQuery.limitCalls).toEqual([5000]);
  });

  it("caches the reads with a real revalidate window, and declares none on the route", async () => {
    // `export const revalidate` beside `dynamic = "force-dynamic"` is ignored by
    // Next — the route stays revalidate 0 — so the window has to live on the
    // data. Asserting the route export is ABSENT is what stops somebody adding
    // the fictional one and reading it as a cache.
    expect(cacheRegistration.options?.revalidate).toBe(900);
    expect(sitemapModule.dynamic).toBe("force-dynamic");
    expect((sitemapModule as Record<string, unknown>).revalidate).toBeUndefined();
  });

  it("fails the route when the reads miss their deadline, instead of shipping four URLs", async () => {
    // A crawler that gets a 5xx keeps the sitemap it already has; one that gets
    // a 200 with only the static entries takes it as the new truth.
    vi.useFakeTimers();
    mockQueryLost.mockReturnValue(new Promise(() => {}));

    const pending = sitemap();
    const settled = pending.then(
      () => "resolved",
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(10_000);

    const outcome = await settled;
    expect(outcome).toBeInstanceOf(Error);
    expect(String((outcome as Error).message)).toMatch(/sitemap: listing reads unavailable/);
  });

  it("still emits one URL per row, from the contract's deep-link shapes", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("https://mimar.example.ar/adoptar/DIM-ADPT-2345");
    expect(urls).toContain("https://mimar.example.ar/p/DIM-LOST-2345");
    expect(urls).toContain("https://mimar.example.ar/refugios/ORG-REFU-2345");
    // Four static entries plus one per row.
    expect(entries).toHaveLength(7);

    // lastModified survives as the same instant whether it arrived as a Date
    // (a cache miss) or as the JSON string a cache hit returns.
    const lost = entries.find((e) => e.url.endsWith("/p/DIM-LOST-2345"));
    expect(new Date(String(lost?.lastModified)).toISOString()).toBe(LOST_AT.toISOString());
  });
});
