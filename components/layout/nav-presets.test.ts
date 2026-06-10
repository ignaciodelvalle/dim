// Unit tests for nav-presets — pure module, no React required.

import { describe, expect, it } from "vitest";
import { ADMIN_NAV, GOB_NAV, OWNER_NAV, buildOrgNav } from "./nav-presets";

const ALL_GATED_CAPS = new Set(["intake.create", "adoption.review", "capability.grant"]);

describe("buildOrgNav", () => {
  it("produces 14 membership-only items when no capabilities are passed", () => {
    expect(buildOrgNav("ORG-ABC")).toHaveLength(14);
  });

  it("produces 17 items when all gated capabilities are granted", () => {
    expect(buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS })).toHaveLength(17);
  });

  it("hides Ingresos, Check-ins and Permisos without their capabilities", () => {
    const labels = buildOrgNav("ORG-ABC").map((i) => i.label);
    expect(labels).not.toContain("Ingresos");
    expect(labels).not.toContain("Check-ins");
    expect(labels).not.toContain("Permisos");
  });

  it("shows each gated item only with its own capability", () => {
    const intakeOnly = buildOrgNav("ORG-ABC", { granted: new Set(["intake.create"]) }).map(
      (i) => i.label,
    );
    expect(intakeOnly).toContain("Ingresos");
    expect(intakeOnly).not.toContain("Check-ins");
    expect(intakeOnly).not.toContain("Permisos");
  });

  it("contains the previously missing membership-level sections", () => {
    const labels = buildOrgNav("ORG-ABC").map((i) => i.label);
    expect(labels).toContain("Tránsitos");
    expect(labels).toContain("Voluntarios");
    expect(labels).toContain("Transferencias");
    expect(labels).toContain("Casos");
    expect(labels).toContain("Mordeduras");
  });

  it("Mordeduras entry points to the report form (no index page under /mordedura)", () => {
    const items = buildOrgNav("ORG-ABC");
    const mordeduras = items.find((i) => i.label === "Mordeduras");
    expect(mordeduras?.href).toBe("/org/ORG-ABC/mordedura/nuevo");
    expect(mordeduras?.matchPrefix).toBe("/org/ORG-ABC/mordedura");
  });

  it("Permisos entry points to /admin/permisos and highlights the /admin segment", () => {
    const items = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    const permisos = items.find((i) => i.label === "Permisos");
    expect(permisos?.href).toBe("/org/ORG-ABC/admin/permisos");
    expect(permisos?.matchPrefix).toBe("/org/ORG-ABC/admin");
  });

  it("does not leak requiredCapability into the returned NavItem objects", () => {
    const items = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    for (const item of items) {
      expect("requiredCapability" in item).toBe(false);
    }
  });

  it("does not contain an equipo entry (broken nav — ADR-4: no roadmap signal → remove)", () => {
    const hrefs = buildOrgNav("ORG-ABC").map((i) => i.href);
    expect(hrefs).not.toContain("/org/ORG-ABC/equipo");
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

  it("contains Agenda, Mascotas, Servicios, Operaciones, Miembros, Cobertura, Configuración, Maltrato entries", () => {
    const labels = buildOrgNav("ORG-ABC").map((i) => i.label);
    expect(labels).toContain("Agenda");
    expect(labels).toContain("Mascotas");
    expect(labels).toContain("Servicios");
    expect(labels).toContain("Operaciones");
    expect(labels).toContain("Miembros");
    expect(labels).toContain("Cobertura");
    expect(labels).toContain("Configuración");
    expect(labels).toContain("Maltrato");
  });

  it("Cobertura entry points to /org/<orgToken>/cobertura", () => {
    const items = buildOrgNav("ORG-ABC");
    const cobertura = items.find((i) => i.label === "Cobertura");
    expect(cobertura).toBeDefined();
    expect(cobertura?.href).toBe("/org/ORG-ABC/cobertura");
  });

  it("Configuración entry points to /org/<orgToken>/configuracion", () => {
    const items = buildOrgNav("ORG-ABC");
    const config = items.find((i) => i.label === "Configuración");
    expect(config).toBeDefined();
    expect(config?.href).toBe("/org/ORG-ABC/configuracion");
  });

  it("Maltrato entry points to /org/<orgToken>/maltrato/recibidos", () => {
    const items = buildOrgNav("ORG-ABC");
    const maltrato = items.find((i) => i.label === "Maltrato");
    expect(maltrato).toBeDefined();
    expect(maltrato?.href).toBe("/org/ORG-ABC/maltrato/recibidos");
  });

  it("Maltrato entry matchPrefix covers /org/<orgToken>/maltrato (highlights both recibidos and nuevo)", () => {
    const items = buildOrgNav("ORG-ABC");
    const maltrato = items.find((i) => i.label === "Maltrato");
    expect(maltrato?.matchPrefix).toBe("/org/ORG-ABC/maltrato");
  });
});

describe("OWNER_NAV", () => {
  it("has exactly 7 items", () => {
    expect(OWNER_NAV).toHaveLength(7);
  });

  it("contains /mis-mascotas", () => {
    expect(OWNER_NAV.map((i) => i.href)).toContain("/mis-mascotas");
  });

  it("contains Denuncias tab pointing to /denuncias/mias", () => {
    const denuncias = OWNER_NAV.find((i) => i.label === "Denuncias");
    expect(denuncias).toBeDefined();
    expect(denuncias?.href).toBe("/denuncias/mias");
  });

  it("contains Adopciones tab pointing to /adoptar", () => {
    const adopciones = OWNER_NAV.find((i) => i.label === "Adopciones");
    expect(adopciones).toBeDefined();
    expect(adopciones?.href).toBe("/adoptar");
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
    "/gob/analytics",
  ];

  for (const route of expectedRoutes) {
    it(`covers route ${route}`, () => {
      expect(hrefs).toContain(route);
    });
  }

  it("has at least 13 items (no silent drops)", () => {
    expect(GOB_NAV.length).toBeGreaterThanOrEqual(13);
  });

  it("contains /gob/analytics (wired to nav — was deferred in PR2)", () => {
    expect(hrefs).toContain("/gob/analytics");
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
