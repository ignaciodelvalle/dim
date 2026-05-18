// Tests the server action wrapper. We mock requireUserOrRedirect so the test
// can drive the auth-gate path without spinning up a Next.js runtime.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-guards", () => ({
  requireUserOrRedirect: vi.fn(),
}));

import { __resetRateLimitForTests, searchLocalitiesAction } from "@/app/actions/localities";
import { requireUserOrRedirect } from "@/lib/auth-guards";

const mockAs = (userId: string) =>
  vi.mocked(requireUserOrRedirect).mockResolvedValue({
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the parts we touch
    user: { id: userId } as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the parts we touch
  } as any);

beforeEach(async () => {
  await __resetRateLimitForTests();
});

describe("searchLocalitiesAction", () => {
  it("returns [] for queries under 2 chars without hitting the lib", async () => {
    mockAs("user-a");
    expect(await searchLocalitiesAction({ query: "" })).toEqual({ results: [] });
    expect(await searchLocalitiesAction({ query: "x" })).toEqual({ results: [] });
  });

  it("returns invalid_province when an unknown province code is supplied", async () => {
    mockAs("user-b");
    const r = await searchLocalitiesAction({ provinceCode: "AR-Inventada", query: "la plata" });
    expect(r).toEqual({ error: "invalid_province" });
  });

  it("delegates to searchLocalities and returns the result envelope", async () => {
    mockAs("user-c");
    const r = await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" });
    expect("results" in r).toBe(true);
    if ("results" in r) {
      expect(r.results.length).toBeGreaterThan(0);
      expect(r.results[0].provinceCode).toBe("AR-B");
    }
  });

  it("returns rate_limited after 60 calls in the window", async () => {
    mockAs("user-d");
    for (let i = 0; i < 60; i++) {
      const r = await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" });
      expect("results" in r).toBe(true);
    }
    const r = await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" });
    expect(r).toEqual({ error: "rate_limited" });
  });

  it("rate limit is per user — different sessions share no budget", async () => {
    mockAs("user-e");
    for (let i = 0; i < 60; i++) {
      await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" });
    }
    expect(await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" })).toEqual({
      error: "rate_limited",
    });

    mockAs("user-f");
    const r = await searchLocalitiesAction({ provinceCode: "AR-B", query: "la plata" });
    expect("results" in r).toBe(true);
  });
});
