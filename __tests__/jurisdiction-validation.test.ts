// Integration tests for lib/jurisdiction-validation — strict resolver.
//
// Requires a running local Supabase stack (pnpm supabase start) with the
// INDEC catalog and CABA barrios imported (pnpm db:bootstrap step 4).
//
// Covers:
//   1. resolveCanonicalJurisdiction — resolves known localities (INDEC + CABA barrios)
//   2. resolveCanonicalJurisdiction — throws JurisdictionValidationError for unknown inputs
//   3. tryResolveCanonicalJurisdiction — soft fallback (kept for service-offerings)
//   4. CABA barrios round-trip: "CABA" + "Palermo" resolves, canonical name is preserved

import { and, count as countFn, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { arLocalities, db } from "@/db";
import {
  JurisdictionValidationError,
  resolveCanonicalJurisdiction,
  tryResolveCanonicalJurisdiction,
} from "@/lib/jurisdiction-validation";

let catalogPopulated = false;
let cabaBarriosPopulated = false;

beforeAll(async () => {
  const [total] = await db
    .select({ count: countFn() })
    .from(arLocalities)
    .where(isNull(arLocalities.removedAt));
  catalogPopulated = Number(total?.count ?? 0) > 100;

  const [caba] = await db
    .select({ count: countFn() })
    .from(arLocalities)
    .where(and(eq(arLocalities.provinceCode, "AR-C"), isNull(arLocalities.removedAt)));
  // CABA barrios (48 barrios, Ley CABA 1.777) are present only after bootstrap step 4.
  cabaBarriosPopulated = Number(caba?.count ?? 0) > 0;
});

// ---------------------------------------------------------------------------
// 1. resolveCanonicalJurisdiction — happy paths
// ---------------------------------------------------------------------------

describe("resolveCanonicalJurisdiction — resolvable inputs", () => {
  it("resolves a well-known INDEC locality (Buenos Aires / La Plata)", async () => {
    if (!catalogPopulated) return;
    const result = await resolveCanonicalJurisdiction({
      rawProvince: "Buenos Aires",
      rawLocality: "La Plata",
    });
    expect(result.province.name).toBe("Buenos Aires");
    expect(result.locality.localityName).toBe("La Plata");
    expect(result.locality.provinceCode).toBe("AR-B");
  });

  it("accepts province by ISO code (AR-B)", async () => {
    if (!catalogPopulated) return;
    const result = await resolveCanonicalJurisdiction({
      rawProvince: "AR-B",
      rawLocality: "La Plata",
    });
    expect(result.province.code).toBe("AR-B");
    expect(result.locality.localityName).toBe("La Plata");
  });

  it("resolves a CABA barrio — Palermo", async () => {
    if (!cabaBarriosPopulated) return;
    const result = await resolveCanonicalJurisdiction({
      rawProvince: "CABA",
      rawLocality: "Palermo",
    });
    expect(result.province.name).toBe("CABA");
    expect(result.province.code).toBe("AR-C");
    expect(result.locality.localityName).toBe("Palermo");
  });

  it("resolves a CABA barrio — Boedo", async () => {
    if (!cabaBarriosPopulated) return;
    const result = await resolveCanonicalJurisdiction({
      rawProvince: "AR-C",
      rawLocality: "Boedo",
    });
    expect(result.locality.localityName).toBe("Boedo");
  });

  it("resolves a CABA barrio with accent — Núñez", async () => {
    if (!cabaBarriosPopulated) return;
    const result = await resolveCanonicalJurisdiction({
      rawProvince: "CABA",
      rawLocality: "Núñez",
    });
    expect(result.locality.localityName).toBe("Núñez");
  });
});

// ---------------------------------------------------------------------------
// 2. resolveCanonicalJurisdiction — error paths (strict)
// ---------------------------------------------------------------------------

describe("resolveCanonicalJurisdiction — unresolvable inputs throw JurisdictionValidationError", () => {
  it("throws INVALID_PROVINCE for an unrecognized province string", async () => {
    await expect(
      resolveCanonicalJurisdiction({ rawProvince: "Narnia", rawLocality: "Cualquier cosa" }),
    ).rejects.toMatchObject({
      code: "INVALID_PROVINCE",
      name: "JurisdictionValidationError",
    });
  });

  it("throws INVALID_PROVINCE for an empty province string", async () => {
    await expect(
      resolveCanonicalJurisdiction({ rawProvince: "", rawLocality: "La Plata" }),
    ).rejects.toMatchObject({ code: "INVALID_PROVINCE" });
  });

  it("throws INVALID_LOCALITY for a valid province but non-catalog locality", async () => {
    if (!catalogPopulated) return;
    await expect(
      resolveCanonicalJurisdiction({
        rawProvince: "Buenos Aires",
        rawLocality: "Localidad Inventada XYZ",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_LOCALITY",
      name: "JurisdictionValidationError",
    });
  });

  it("throws INVALID_LOCALITY for a CABA province with a non-barrio free-text", async () => {
    if (!cabaBarriosPopulated) return;
    await expect(
      resolveCanonicalJurisdiction({
        rawProvince: "CABA",
        rawLocality: "Barrio Inexistente 404",
      }),
    ).rejects.toMatchObject({ code: "INVALID_LOCALITY" });
  });

  it("error message is in Spanish", async () => {
    await expect(
      resolveCanonicalJurisdiction({ rawProvince: "NoExiste", rawLocality: "foo" }),
    ).rejects.toThrow(/Provincia/);
  });
});

// ---------------------------------------------------------------------------
// 3. tryResolveCanonicalJurisdiction — soft fallback (service-offerings path)
// ---------------------------------------------------------------------------

describe("tryResolveCanonicalJurisdiction — soft fallback (not strict)", () => {
  it("returns canonical=true when the locality resolves", async () => {
    if (!catalogPopulated) return;
    const r = await tryResolveCanonicalJurisdiction({
      rawProvince: "Buenos Aires",
      rawLocality: "La Plata",
    });
    expect(r.canonical).toBe(true);
    expect(r.locality).toBe("La Plata");
  });

  it("returns canonical=false for an unresolvable locality (does NOT throw)", async () => {
    if (!catalogPopulated) return;
    const r = await tryResolveCanonicalJurisdiction({
      rawProvince: "Buenos Aires",
      rawLocality: "Localidad Inventada XYZ",
    });
    expect(r.canonical).toBe(false);
    // Falls back to trimmed raw input instead of throwing.
    expect(r.locality).toBe("Localidad Inventada XYZ");
  });

  it("returns canonical=false with empty strings when both inputs are empty", async () => {
    const r = await tryResolveCanonicalJurisdiction({ rawProvince: "", rawLocality: "" });
    expect(r.canonical).toBe(false);
    expect(r.province).toBe("");
    expect(r.locality).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 4. JurisdictionValidationError is instanceof-able
// ---------------------------------------------------------------------------

describe("JurisdictionValidationError", () => {
  it("is an instanceof Error", async () => {
    await expect(
      resolveCanonicalJurisdiction({ rawProvince: "Nowhere", rawLocality: "NoCity" }),
    ).rejects.toBeInstanceOf(JurisdictionValidationError);
  });

  it("has a code property matching the failure reason", async () => {
    try {
      await resolveCanonicalJurisdiction({ rawProvince: "Nowhere", rawLocality: "NoCity" });
    } catch (err) {
      expect(err).toBeInstanceOf(JurisdictionValidationError);
      if (err instanceof JurisdictionValidationError) {
        expect(err.code).toBe("INVALID_PROVINCE");
      }
    }
  });
});
