// Characterization net for resolveJurisdictionScope — the jurisdiction-scope
// primitive. Pins the full ResolvedJurisdictionScope across the branch matrix
// (B1–B10 of docs/plans/jurisdiction-scope-primitive.md §2). The two DB reads
// (listLocalitiesByProvince, localityByName) are stubbed so the net is
// deterministic and server-free — the fence-critical narrowing it delegates to
// (resolveScopedJurisdictions) runs FOR REAL (already covered by gov-scope.test).
//
// The refactor is correct iff these snapshots stay green: every migrated site
// must produce byte-identical filteredJurisdictions + allowedProvinces.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardJurisdiction } from "@/lib/metrics";
import type { Locality, LocalityOption } from "@/lib/infra/ar-localidades";

// --- Stub the two catalog reads (the only I/O in the primitive). -----------
vi.mock("@/lib/infra/ar-localidades", () => ({
  listLocalitiesByProvince: vi.fn(),
  localityByName: vi.fn(),
}));

import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { GOB_ALL_PROVINCES } from "@/lib/analytics/govt-dashboards";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkLoc(provinceCode: string, localityName: string, localitySlug: string): Locality {
  return {
    indecId: `${provinceCode}-${localitySlug}`,
    provinceCode: provinceCode as Locality["provinceCode"],
    departmentName: null,
    localityName,
    localitySlug,
    category: "localidad" as Locality["category"],
  };
}

// Province localities returned by the switcher dropdown fetch.
const LOCALITIES_BY_PROVINCE: Record<string, LocalityOption[]> = {
  "AR-B": [
    { slug: "la-plata", name: "La Plata" },
    { slug: "mar-del-plata", name: "Mar del Plata" },
  ],
  "AR-X": [{ slug: "cordoba", name: "Córdoba" }],
};

// Slug → canonical Locality resolution, per province. Note "rosario" RESOLVES
// under AR-B here (a canonical name that simply isn't in a given operator's
// assignments) so we can characterize B5 (resolved pair not in assignments → empty).
const LOCALITY_RESOLUTION: Record<string, Record<string, Locality>> = {
  "AR-B": {
    "la-plata": mkLoc("AR-B", "La Plata", "la-plata"),
    "mar-del-plata": mkLoc("AR-B", "Mar del Plata", "mar-del-plata"),
    rosario: mkLoc("AR-B", "Rosario", "rosario"),
  },
  "AR-X": {
    cordoba: mkLoc("AR-X", "Córdoba", "cordoba"),
  },
};

// Assignment-set fixtures (the operator's fenced scope).
const A_SINGLE: DashboardJurisdiction[] = [{ province: "Buenos Aires", locality: "La Plata" }];
const A_MULTI_LOCALITY: DashboardJurisdiction[] = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "Buenos Aires", locality: "Mar del Plata" },
];
const A_MULTI_PROVINCE: DashboardJurisdiction[] = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "Córdoba", locality: "Córdoba" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listLocalitiesByProvince).mockImplementation(async (code: string) =>
    structuredClone(LOCALITIES_BY_PROVINCE[code] ?? []),
  );
  vi.mocked(localityByName).mockImplementation(async (code: string, name?: string | null) => {
    if (!name) return null;
    return LOCALITY_RESOLUTION[code]?.[name] ?? null;
  });
});

// ---------------------------------------------------------------------------
// B1 — admin widening guard: narrowing is a no-op for admin
// ---------------------------------------------------------------------------

describe("B1 — admin widening guard", () => {
  it("admin: filteredJurisdictions returned unchanged regardless of selection", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [], // admin = universal
      params: { province: "AR-B", locality: "la-plata" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual([]);
  });

  it("admin with (impossible) assignments still passes them through untouched", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: A_MULTI_PROVINCE,
      params: { province: "AR-B", locality: "la-plata" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_PROVINCE);
  });
});

// ---------------------------------------------------------------------------
// B2 — govt, no province selected → all assignments
// ---------------------------------------------------------------------------

describe("B2 — govt, no province selected", () => {
  it("returns all assignments unchanged", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: {},
    });
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
    expect(scope.selectedProvince).toBeNull();
    expect(scope.selectedLocality).toBeNull();
    expect(scope.localities).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B3 — govt, province-only
// ---------------------------------------------------------------------------

describe("B3 — govt, province-only", () => {
  it("filters to that province, keeps every assigned locality within it", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_PROVINCE,
      params: { province: "AR-B" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual([
      { province: "Buenos Aires", locality: "La Plata" },
    ]);
    expect(scope.selectedProvince?.name).toBe("Buenos Aires");
    expect(scope.selectedLocality).toBeNull();
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
  });

  it("whole-province subsumption: N assigned localities all survive province-only", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
  });
});

// ---------------------------------------------------------------------------
// B4 — govt, province + locality (exact pair)
// ---------------------------------------------------------------------------

describe("B4 — govt, province + locality", () => {
  it("filters to the exact assigned pair", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B", locality: "la-plata" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual([
      { province: "Buenos Aires", locality: "La Plata" },
    ]);
    expect(scope.selectedLocality?.localityName).toBe("La Plata");
  });
});

// ---------------------------------------------------------------------------
// B5 — whole-province subsumption / cannot widen
// ---------------------------------------------------------------------------

describe("B5 — cannot widen (locality not in assignments)", () => {
  it("selecting a resolved locality not in assignments → empty list", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B", locality: "rosario" },
    });
    // "Rosario" resolves to a canonical name but is not assigned → cannot widen.
    expect(scope.filteredJurisdictions).toStrictEqual([]);
    expect(scope.selectedLocality?.localityName).toBe("Rosario");
  });
});

// ---------------------------------------------------------------------------
// B6 — MAP-5 fallback: lone ?locality with no ?province → downgraded, ignored
// ---------------------------------------------------------------------------

describe("B6 — lone ?locality with no ?province", () => {
  it("province null ⇒ localities [], selectedLocality null, narrowing no-op", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { locality: "la-plata" },
    });
    expect(scope.selectedProvince).toBeNull();
    expect(scope.localities).toStrictEqual([]);
    expect(scope.selectedLocality).toBeNull();
    // Stray locality is silently downgraded, never applied.
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
    // localityByName must never be consulted without a resolved province.
    expect(localityByName).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B7 — admin SQL drill names
// ---------------------------------------------------------------------------

describe("B7 — admin SQL drill names", () => {
  it("admin ⇒ resolved canonical names in adminSelected*", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: { province: "AR-B", locality: "la-plata" },
    });
    expect(scope.adminSelectedProvince).toBe("Buenos Aires");
    expect(scope.adminSelectedLocality).toBe("La Plata");
  });

  it("admin, province-only ⇒ province name, locality null", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: { province: "AR-X" },
    });
    expect(scope.adminSelectedProvince).toBe("Córdoba");
    expect(scope.adminSelectedLocality).toBeNull();
  });

  it("govt ⇒ adminSelected* are ALWAYS null (never a govt widening vector)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B", locality: "la-plata" },
    });
    expect(scope.adminSelectedProvince).toBeNull();
    expect(scope.adminSelectedLocality).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B8 — fail-closed on invalid / unknown ISO
// ---------------------------------------------------------------------------

describe("B8 — fail-closed on invalid ISO", () => {
  it("govt, bad ISO ⇒ national (all assignments), never widened", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_PROVINCE,
      params: { province: "AR-ZZ", locality: "la-plata" },
    });
    expect(scope.selectedProvince).toBeNull();
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_PROVINCE);
    expect(scope.localities).toStrictEqual([]);
    expect(scope.adminSelectedProvince).toBeNull();
  });

  it("admin, bad ISO ⇒ universal + null drill names", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: { province: "AR-ZZ" },
    });
    expect(scope.filteredJurisdictions).toStrictEqual([]);
    expect(scope.adminSelectedProvince).toBeNull();
    expect(scope.adminSelectedLocality).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B9 — null/absent locality slug → province-only
// ---------------------------------------------------------------------------

describe("B9 — absent locality slug", () => {
  it("govt, province + null locality ⇒ province-only branch", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B", locality: null },
    });
    expect(scope.selectedLocality).toBeNull();
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
  });
});

// ---------------------------------------------------------------------------
// B10 — allowedProvinces source (original assignments, never the narrowed set)
// ---------------------------------------------------------------------------

describe("B10 — allowedProvinces source", () => {
  it("admin ⇒ GOB_ALL_PROVINCES (same reference, all 24)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: { province: "AR-B" },
    });
    expect(scope.allowedProvinces).toBe(GOB_ALL_PROVINCES);
    expect(scope.allowedProvinces).toHaveLength(24);
  });

  it("govt ⇒ derived from ORIGINAL assignments, unaffected by a province selection", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_PROVINCE,
      params: { province: "AR-B", locality: "la-plata" }, // narrows to 1 province
    });
    // Switcher still offers BOTH provinces (does not trap the operator).
    expect(scope.allowedProvinces).toStrictEqual([
      { code: "AR-B", name: "Buenos Aires" },
      { code: "AR-X", name: "Córdoba" },
    ]);
  });

  it("govt, empty assignments ⇒ empty allowedProvinces", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: [],
      params: {},
    });
    expect(scope.allowedProvinces).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Full-object pin — one representative govt cell, all six outputs at once
// ---------------------------------------------------------------------------

describe("full ResolvedJurisdictionScope pin", () => {
  it("govt · multi-locality · province-only selection", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { province: "AR-B" },
    });
    expect(scope).toStrictEqual({
      selectedProvince: { code: "AR-B", name: "Buenos Aires", slug: "buenos-aires" },
      selectedLocality: null,
      localities: [
        { slug: "la-plata", name: "La Plata" },
        { slug: "mar-del-plata", name: "Mar del Plata" },
      ],
      filteredJurisdictions: A_MULTI_LOCALITY,
      allowedProvinces: [{ code: "AR-B", name: "Buenos Aires" }],
      adminSelectedProvince: null,
      adminSelectedLocality: null,
    });
  });
});
