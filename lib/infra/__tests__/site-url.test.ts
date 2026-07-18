import { afterEach, describe, expect, it, vi } from "vitest";

import { credentialQrUrl, resolveSiteUrl } from "@/lib/infra/site-url";

const CANONICAL = "https://mimar.ar";

describe("resolveSiteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the canonical domain when the var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined as unknown as string);
    expect(resolveSiteUrl()).toBe(CANONICAL);
  });

  it("falls back to the canonical domain for a set-but-empty value (the QR bug)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveSiteUrl()).toBe(CANONICAL);
  });

  it("falls back to the canonical domain for a whitespace-only value", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "   ");
    expect(resolveSiteUrl()).toBe(CANONICAL);
  });

  it("returns a valid value unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mimar.gob.ar");
    expect(resolveSiteUrl()).toBe("https://www.mimar.gob.ar");
  });

  it("trims surrounding whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "  https://mimar.gob.ar  ");
    expect(resolveSiteUrl()).toBe("https://mimar.gob.ar");
  });

  it("strips a trailing slash so callers can append a path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mimar.gob.ar/");
    expect(resolveSiteUrl()).toBe("https://mimar.gob.ar");
  });

  it("strips multiple trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mimar.gob.ar///");
    expect(resolveSiteUrl()).toBe("https://mimar.gob.ar");
  });
});

describe("credentialQrUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("composes host + /p/{token} when the env var is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mimar.gob.ar");
    expect(credentialQrUrl("DIM-XXXX-XXXX")).toBe("https://www.mimar.gob.ar/p/DIM-XXXX-XXXX");
  });

  it("stays ABSOLUTE when the env var is set-but-empty (the unscannable-QR bug)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const url = credentialQrUrl("DIM-XXXX-XXXX");
    expect(url.startsWith("http")).toBe(true);
    expect(url).toBe("https://mimar.ar/p/DIM-XXXX-XXXX");
  });

  it("never doubles the slash when the env var carries a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mimar.gob.ar/");
    expect(credentialQrUrl("DIM-PAMP-0001")).toBe("https://mimar.gob.ar/p/DIM-PAMP-0001");
  });
});
