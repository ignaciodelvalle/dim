import { describe, expect, it } from "vitest";
import { makeMemoryRateLimiter } from "@/lib/rate-limit";

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

describe("makeMemoryRateLimiter", () => {
  it("allows the first call for a new key", () => {
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    const result = limiter.check("key-a", 1000);
    expect(result).toEqual({ allowed: true });
  });

  it("blocks a second call within the window", () => {
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    const t0 = 1000;
    limiter.check("key-a", t0); // first — allowed
    const result = limiter.check("key-a", t0 + 30_000); // 30s later — still within 5min
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      // Should report ~4.5 minutes remaining (270_000 ms)
      expect(result.retryAfterMs).toBe(WINDOW_MS - 30_000);
    }
  });

  it("allows a call after the window expires", () => {
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    const t0 = 1000;
    limiter.check("key-a", t0);
    // Advance past the full window
    const result = limiter.check("key-a", t0 + WINDOW_MS + 1);
    expect(result).toEqual({ allowed: true });
  });

  it("tracks different keys independently", () => {
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    const t0 = 1000;
    limiter.check("key-a", t0);
    // key-b should be unaffected by key-a's state
    const result = limiter.check("key-b", t0 + 10_000);
    expect(result).toEqual({ allowed: true });
  });

  it("allows key-a again after expiry without affecting key-b", () => {
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    const t0 = 0;
    limiter.check("key-a", t0);
    limiter.check("key-b", t0);
    // Only advance key-a past its window
    const resultA = limiter.check("key-a", t0 + WINDOW_MS + 1);
    const resultB = limiter.check("key-b", t0 + WINDOW_MS + 1);
    expect(resultA.allowed).toBe(true);
    expect(resultB.allowed).toBe(true);
  });

  it("defaults now to Date.now() when not provided", () => {
    // Just verify the API doesn't throw when now is omitted
    const limiter = makeMemoryRateLimiter(WINDOW_MS);
    expect(() => limiter.check("key-default")).not.toThrow();
    const result = limiter.check("key-default");
    expect(result.allowed).toBe(false); // second call — blocked
  });
});
