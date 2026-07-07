// Public "stateful" cache policy — privacy-class regression tests (2026-07-07).
//
// Guards the fix for the CDN/full-route-cache privacy leak where a REVOKED
// libreta share and a FOUND pet's owner phone were served stale at the exact
// public URL. Two layers are asserted:
//   1. The middleware allowlist (isPublicNoStoreRoute) covers every privacy-
//      sensitive public route and excludes static/owner routes.
//   2. Each of those pages still declares `export const dynamic = "force-dynamic"`
//      (defense-in-depth beneath the no-store header).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NO_STORE_CACHE_CONTROL, isPublicNoStoreRoute } from "@/lib/infra/public-cache-policy";

describe("isPublicNoStoreRoute — privacy-sensitive public surface", () => {
  it.each([
    // QR credential + finder/sighting subpaths + OG image
    "/p/DIM-ABCD-1234",
    "/p/DIM-ABCD-1234/encontre",
    "/p/DIM-ABCD-1234/sighting",
    "/p/DIM-ABCD-1234/opengraph-image",
    // revocable Tier-2 medical share
    "/libreta/compartir/some-share-token",
    // lost-pet public listing (exact)
    "/perdidas",
    // adoption listing + detail + apply
    "/adoptar",
    "/adoptar/DIM-ABCD-1234",
    "/adoptar/DIM-ABCD-1234/postular",
    // public denuncia status (viewer-gated PII)
    "/casos/CAS-ABCD-1234",
  ])("marks %s as no-store", (pathname) => {
    expect(isPublicNoStoreRoute(pathname)).toBe(true);
  });

  it.each([
    // static public pages — safe to cache
    "/",
    "/ayuda",
    "/privacidad",
    "/terminos",
    "/leyes",
    "/acerca",
    "/refugios",
    // owner / operator surfaces are auth-gated, not part of this public allowlist
    "/mis-mascotas/DIM-ABCD-1234",
    "/gob/casos/CAS-ABCD-1234",
    "/admin/censo",
  ])("does NOT mark %s as no-store", (pathname) => {
    expect(isPublicNoStoreRoute(pathname)).toBe(false);
  });

  it("emits an explicit no-store Cache-Control value", () => {
    expect(NO_STORE_CACHE_CONTROL).toContain("no-store");
    expect(NO_STORE_CACHE_CONTROL).toContain("private");
  });
});

describe("force-dynamic defense-in-depth on public stateful pages", () => {
  const repoRoot = join(__dirname, "..");
  const pages = [
    "app/(public)/p/[publicToken]/page.tsx",
    "app/(public)/p/[publicToken]/encontre/page.tsx",
    "app/(public)/p/[publicToken]/sighting/page.tsx",
    "app/libreta/compartir/[shareToken]/page.tsx",
    "app/(public)/perdidas/page.tsx",
    "app/(public)/adoptar/page.tsx",
    "app/(public)/adoptar/[petToken]/page.tsx",
    "app/(public)/casos/[publicCode]/page.tsx",
  ];

  it.each(pages)("%s declares dynamic = force-dynamic", (relPath) => {
    const src = readFileSync(join(repoRoot, relPath), "utf8");
    expect(src).toMatch(/export const dynamic\s*=\s*["']force-dynamic["']/);
  });
});
