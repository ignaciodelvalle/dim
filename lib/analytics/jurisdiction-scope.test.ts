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

import type { Locality, LocalityOption } from "@/lib/infra/ar-localidades";
import type { DashboardJurisdiction } from "@/lib/metrics";

// --- Stub the two catalog reads (the only I/O in the primitive). -----------
vi.mock("@/lib/infra/ar-localidades", () => ({
  listLocalitiesByProvince: vi.fn(),
  localityByName: vi.fn(),
}));

import { GOB_ALL_PROVINCES } from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { listLocalitiesByProvince, localityByName } from "@/lib/infra/ar-localidades";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkLoc(provinceCode: string, localityName: string, localitySlug: string): Locality {
  return {
    id: `id-${provinceCode}-${localitySlug}`,
    indecId: `${provinceCode}-${localitySlug}`,
    provinceCode: provinceCode as Locality["provinceCode"],
    departmentName: null,
    departmentCode: null,
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
  it("A_MULTI_LOCALITY (single-province, 2 localities): filteredJurisdictions unchanged, selectedProvince/selectedLocality stay null, BUT localities now resolves for the switcher (finding #10 fix)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: {},
    });
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
    // selectedProvince/selectedLocality — unaffected by the fix. They only
    // reflect an EXPLICIT ?province=/?locality= param, never an implied one;
    // map-drill/choropleth-zoom/adminSelected* consumers stay byte-identical.
    expect(scope.selectedProvince).toBeNull();
    expect(scope.selectedLocality).toBeNull();
    // Bug fix (qa-triage-2026-07-23 finding #10): this operator has exactly
    // ONE assigned province (Buenos Aires, via two locality assignments), so
    // the Provincia switcher offers no real choice ("Todas" is hidden — see
    // JurisdictionSwitcher's showNationalOption) and no onChange could ever
    // fire to populate `?province=`. Before the fix, `localities` stayed []
    // forever, permanently disabling the Localidad <select> with no
    // explanation. It now resolves the sole province's localities so the
    // control is actually usable.
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
  });

  it("A_MULTI_PROVINCE (2 DIFFERENT provinces): still [] — no single implied province to resolve, switcher's real 'Todas' choice must not be pre-empted", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_PROVINCE,
      params: {},
    });
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_PROVINCE);
    expect(scope.selectedProvince).toBeNull();
    expect(scope.localities).toStrictEqual([]);
  });

  it("admin, no province selected: never implies a sole province (admin has 24, not 1)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: {},
    });
    expect(scope.localities).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B3 — govt, province-only
// ---------------------------------------------------------------------------

describe("B3 — govt, province-only", () => {
  it("filters to that province; dropdown offers ONLY the assigned locality (finding #2 fix)", async () => {
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
    // Red-team finding #2: only "La Plata" is assigned in AR-B, so the
    // Localidad dropdown must not offer "Mar del Plata" (an out-of-mandate
    // pick that would fail-closed to an empty set with no signal).
    expect(scope.localities).toStrictEqual([{ slug: "la-plata", name: "La Plata" }]);
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
// B3b — mandate-scoped Localidad dropdown (red-team 2026-07 finding #2)
// ---------------------------------------------------------------------------

describe("B3b — mandate-scoped locality dropdown (finding #2)", () => {
  it("govt with every provincial locality assigned keeps the full dropdown", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY, // La Plata + Mar del Plata = all of AR-B's catalog
      params: { province: "AR-B" },
    });
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
  });

  it("whole-province assignment ('' sentinel) keeps every locality of that province", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: [{ province: "Buenos Aires", locality: "" }],
      params: { province: "AR-B" },
    });
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
  });

  it("govt selecting a province with NO assignments in it ⇒ empty dropdown (fail-closed)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_SINGLE, // only Buenos Aires / La Plata assigned
      params: { province: "AR-X" }, // Córdoba — outside the mandate
    });
    expect(scope.localities).toStrictEqual([]);
  });

  it("admin is universal: dropdown always offers the province's FULL locality list", async () => {
    const scope = await resolveJurisdictionScope({
      role: "admin",
      jurisdictions: [],
      params: { province: "AR-B" },
    });
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
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
  it("province null ⇒ selectedProvince/selectedLocality stay null, narrowing no-op (localities still resolves for the sole-province switcher, finding #10 fix)", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_LOCALITY,
      params: { locality: "la-plata" },
    });
    expect(scope.selectedProvince).toBeNull();
    // A_MULTI_LOCALITY is single-province (Buenos Aires) — the implied-sole-
    // province fix resolves its localities for the switcher dropdown, same as
    // B2. This is orthogonal to the stray-?locality downgrade below: narrowing
    // stays a no-op regardless of what the switcher offers to pick FROM.
    expect(scope.localities).toStrictEqual(LOCALITIES_BY_PROVINCE["AR-B"]);
    expect(scope.selectedLocality).toBeNull();
    // Stray locality is silently downgraded, never applied.
    expect(scope.filteredJurisdictions).toStrictEqual(A_MULTI_LOCALITY);
    // localityByName must never be consulted without a resolved province.
    expect(localityByName).not.toHaveBeenCalled();
  });

  it("A_MULTI_PROVINCE (no single implied province) ⇒ localities stays []", async () => {
    const scope = await resolveJurisdictionScope({
      role: "govt",
      jurisdictions: A_MULTI_PROVINCE,
      params: { locality: "la-plata" },
    });
    expect(scope.localities).toStrictEqual([]);
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
