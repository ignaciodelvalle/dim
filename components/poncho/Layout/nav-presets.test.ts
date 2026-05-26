// Unit tests for nav-presets — pure module, no React required.

import { describe, expect, it } from "vitest";
import { ADMIN_NAV, GOB_NAV, OWNER_NAV, buildOrgNav } from "./nav-presets";

describe("buildOrgNav", () => {
  it("produces exactly 6 items", () => {
    expect(buildOrgNav("ORG-ABC")).toHaveLength(6);
  });

  it("all hrefs start with /org/<orgToken>/... (or are the exact panel root)", () => {
    const items = buildOrgNav("ORG-ABC");
    for (const item of items) {
      expect(item.href).toMatch(/^\/org\/ORG-ABC/);
    }
  });

  it("uses the provided orgToken in every href", () => {
    const items = buildOrgNav("MY-ORG-42");
    for (const item of items) {
      expect(item.href).toContain("MY-ORG-42");
    }
  });

  it("panel item href is exactly /org/<orgToken> (no trailing slash)", () => {
    const [panel] = buildOrgNav("ORG-ABC");
    expect(panel.href).toBe("/org/ORG-ABC");
  });
});

describe("OWNER_NAV", () => {
  it("has exactly 5 items", () => {
    expect(OWNER_NAV).toHaveLength(5);
  });

  it("contains /mis-mascotas", () => {
    expect(OWNER_NAV.map((i) => i.href)).toContain("/mis-mascotas");
  });
});

describe("GOB_NAV — no route regression", () => {
  const hrefs = GOB_NAV.map((i) => i.href);

  const expectedRoutes = [
    "/gob",
    "/gob/cola",
    "/gob/usuarios",
    "/gob/organizaciones",
    "/gob/servicios",
    "/gob/vigilancia",
    "/gob/perdidas",
    "/gob/disputas",
    "/gob/maltrato",
    "/gob/casos",
    "/gob/historial",
    "/gob/reglas",
  ];

  for (const route of expectedRoutes) {
    it(`covers route ${route}`, () => {
      expect(hrefs).toContain(route);
    });
  }

  it("has at least 12 items (no silent drops)", () => {
    expect(GOB_NAV.length).toBeGreaterThanOrEqual(12);
  });
});

describe("ADMIN_NAV — no route regression", () => {
  const hrefs = ADMIN_NAV.map((i) => i.href);

  const expectedRoutes = [
    "/admin",
    "/admin/cola",
    "/admin/usuarios",
    "/admin/organizaciones",
    "/admin/historial",
    "/admin/auditoria",
    "/admin/outbox",
    "/admin/sistema",
    "/admin/govts",
    "/admin/admins",
    "/admin/servicios",
    "/admin/observaciones",
    "/admin/moderacion",
    "/admin/casos",
    "/admin/jurisdicciones",
  ];

  for (const route of expectedRoutes) {
    it(`covers route ${route}`, () => {
      expect(hrefs).toContain(route);
    });
  }

  it("has at least 15 items (no silent drops)", () => {
    expect(ADMIN_NAV.length).toBeGreaterThanOrEqual(15);
  });
});
