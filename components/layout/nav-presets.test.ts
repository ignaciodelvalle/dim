// Unit tests for nav-presets — pure module, no React required.

import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  ADMIN_NAV_FLAT,
  ADMIN_NAV_SECTIONS,
  GOB_NAV,
  GOB_NAV_FLAT,
  GOB_NAV_SECTIONS,
  OWNER_NAV,
  PUBLIC_NAV,
  buildOrgNav,
  buildOrgNavFlat,
} from "./nav-presets";

const ALL_GATED_CAPS = new Set(["intake.create", "adoption.review", "capability.grant"]);

describe("PUBLIC_NAV", () => {
  it("has exactly 4 items", () => {
    expect(PUBLIC_NAV).toHaveLength(4);
  });

  it("contains Adoptar, Mascotas perdidas, Refugios, Denuncias", () => {
    const labels = PUBLIC_NAV.map((i) => i.label);
    expect(labels).toContain("Adoptar");
    expect(labels).toContain("Mascotas perdidas");
    expect(labels).toContain("Refugios");
    expect(labels).toContain("Denuncias");
  });

  it("does not include Mi libreta (requires auth)", () => {
    const labels = PUBLIC_NAV.map((i) => i.label);
    expect(labels).not.toContain("Mi libreta");
    expect(labels).not.toContain("Libreta");
  });

  it("all hrefs point to public portal routes", () => {
    const hrefs = PUBLIC_NAV.map((i) => i.href);
    expect(hrefs).toContain("/adoptar");
    expect(hrefs).toContain("/perdidas");
    expect(hrefs).toContain("/refugios");
    expect(hrefs).toContain("/denuncias");
  });
});

describe("buildOrgNav (section structure)", () => {
  it("returns an array of NavSection objects (not flat NavItem[])", () => {
    const result = buildOrgNav("ORG-ABC");
    expect(Array.isArray(result)).toBe(true);
    // Each element must have a `label` string and `items` array (NavSection shape).
    for (const section of result) {
      expect(typeof section.label).toBe("string");
      expect(Array.isArray(section.items)).toBe(true);
    }
  });

  it("returns exactly 5 sections when all gated capabilities are granted", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    expect(sections).toHaveLength(5);
  });

  it("section labels are Operación, Animales, Adopciones, Casos, Administración (in order)", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    expect(sections.map((s) => s.label)).toEqual([
      "Operación",
      "Animales",
      "Adopciones",
      "Casos",
      "Administración",
    ]);
  });

  it("first section is Operación", () => {
    const [first] = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    expect(first.label).toBe("Operación");
  });
});

describe("buildOrgNavFlat", () => {
  it("produces 14 membership-only items when no capabilities are passed", () => {
    expect(buildOrgNavFlat("ORG-ABC")).toHaveLength(14);
  });

  it("produces 18 items when all gated capabilities are granted", () => {
    expect(buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS })).toHaveLength(18);
  });

  it("hides Ingresos, Check-ins and Permisos without their capabilities", () => {
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(labels).not.toContain("Ingresos");
    expect(labels).not.toContain("Check-ins");
    expect(labels).not.toContain("Permisos");
  });

  it("shows each gated item only with its own capability", () => {
    const intakeOnly = buildOrgNavFlat("ORG-ABC", { granted: new Set(["intake.create"]) }).map(
      (i) => i.label,
    );
    expect(intakeOnly).toContain("Ingresos");
    expect(intakeOnly).not.toContain("Check-ins");
    expect(intakeOnly).not.toContain("Permisos");
  });

  it("contains the previously missing membership-level items", () => {
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(labels).toContain("Tránsitos");
    expect(labels).toContain("Voluntarios");
    expect(labels).toContain("Transferencias");
    expect(labels).toContain("Casos");
    expect(labels).toContain("Mordeduras");
  });

  it("Mordeduras entry points to the report form (no index page under /mordedura)", () => {
    const items = buildOrgNavFlat("ORG-ABC");
    const mordeduras = items.find((i) => i.label === "Mordeduras");
    expect(mordeduras?.href).toBe("/org/ORG-ABC/mordedura/nuevo");
    expect(mordeduras?.matchPrefix).toBe("/org/ORG-ABC/mordedura");
  });

  it("Permisos entry points to /admin/permisos and highlights the /admin segment", () => {
    const items = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS });
    const permisos = items.find((i) => i.label === "Permisos");
    expect(permisos?.href).toBe("/org/ORG-ABC/admin/permisos");
    expect(permisos?.matchPrefix).toBe("/org/ORG-ABC/admin");
  });

  it("does not leak requiredCapability into the returned NavItem objects", () => {
    const items = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS });
    for (const item of items) {
      expect("requiredCapability" in item).toBe(false);
    }
  });

  it("does not contain an equipo entry (broken nav — ADR-4: no roadmap signal → remove)", () => {
    const hrefs = buildOrgNavFlat("ORG-ABC").map((i) => i.href);
    expect(hrefs).not.toContain("/org/ORG-ABC/equipo");
  });

  it("all hrefs start with /org/<orgToken>/... (or are the exact panel root)", () => {
    const items = buildOrgNavFlat("ORG-ABC");
    for (const item of items) {
      expect(item.href).toMatch(/^\/org\/ORG-ABC/);
    }
  });

  it("uses the provided orgToken in every href", () => {
    const items = buildOrgNavFlat("MY-ORG-42");
    for (const item of items) {
      expect(item.href).toContain("MY-ORG-42");
    }
  });

  it("panel item href is exactly /org/<orgToken> (no trailing slash)", () => {
    const [panel] = buildOrgNavFlat("ORG-ABC");
    expect(panel.href).toBe("/org/ORG-ABC");
  });

  it("contains Agenda, Mascotas, Servicios, Operaciones, Miembros, Cobertura, Configuración, Maltrato entries", () => {
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
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
    const items = buildOrgNavFlat("ORG-ABC");
    const cobertura = items.find((i) => i.label === "Cobertura");
    expect(cobertura).toBeDefined();
    expect(cobertura?.href).toBe("/org/ORG-ABC/cobertura");
  });

  it("Configuración entry points to /org/<orgToken>/configuracion", () => {
    const items = buildOrgNavFlat("ORG-ABC");
    const config = items.find((i) => i.label === "Configuración");
    expect(config).toBeDefined();
    expect(config?.href).toBe("/org/ORG-ABC/configuracion");
  });

  it("Maltrato entry points to /org/<orgToken>/maltrato/recibidos", () => {
    const items = buildOrgNavFlat("ORG-ABC");
    const maltrato = items.find((i) => i.label === "Maltrato");
    expect(maltrato).toBeDefined();
    expect(maltrato?.href).toBe("/org/ORG-ABC/maltrato/recibidos");
  });

  it("Maltrato entry matchPrefix covers /org/<orgToken>/maltrato (highlights both recibidos and nuevo)", () => {
    const items = buildOrgNavFlat("ORG-ABC");
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

  it("contains /gob/campañas (Item 20 — campaign performance)", () => {
    expect(hrefs).toContain("/gob/campañas");
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

// ---------------------------------------------------------------------------
// GOB_NAV_SECTIONS — grouped nav invariants (Item 1 PR1)
// ---------------------------------------------------------------------------

/**
 * Frozen href snapshot derived from the pre-refactor flat GOB_NAV on develop.
 * Hard-coded so a dropped href shrinks the sections union but NOT this set,
 * making the test genuinely catch membership regressions.
 */
const GOB_HREF_SNAPSHOT = new Set([
  "/gob",
  "/gob/cola",
  "/gob/vigilancia",
  "/gob/mortalidad", // Item 2 — mortality & disposal dashboard
  "/gob/casos",
  "/gob/reglas",
  "/gob/servicios",
  "/gob/historial",
  "/gob/analytics",
  "/gob/usuarios",
  "/gob/organizaciones",
  "/gob/perdidas",
  "/gob/disputas",
  "/gob/maltrato",
  "/gob/decomisos",
  "/gob/campañas", // Item 20 — campaign performance
]);

describe("GOB_NAV_SECTIONS — section invariants", () => {
  it("exports GOB_NAV_SECTIONS as a non-empty array", () => {
    expect(Array.isArray(GOB_NAV_SECTIONS)).toBe(true);
    expect(GOB_NAV_SECTIONS.length).toBeGreaterThan(0);
  });

  it("no href is lost: every frozen-snapshot href appears in GOB_NAV_SECTIONS (snapshot ⊆ union)", () => {
    const sectionHrefs = new Set(GOB_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
    for (const href of GOB_HREF_SNAPSHOT) {
      expect(sectionHrefs).toContain(href);
    }
  });

  it("no href is gained: GOB_NAV_SECTIONS contains only hrefs from the frozen snapshot (union ⊆ snapshot)", () => {
    const sectionHrefs = GOB_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    for (const href of sectionHrefs) {
      expect(GOB_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("includes /gob/mortalidad in the Vigilancia sanitaria section (Item 2)", () => {
    const vigSection = GOB_NAV_SECTIONS.find((s) => s.label === "Vigilancia sanitaria");
    expect(vigSection?.items.map((i) => i.href)).toContain("/gob/mortalidad");
  });

  it("no href is duplicated across sections", () => {
    const sectionHrefs = GOB_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const unique = new Set(sectionHrefs);
    expect(sectionHrefs.length).toBe(unique.size);
  });

  it("first section is unlabeled (Panel)", () => {
    expect(GOB_NAV_SECTIONS[0].label).toBe("");
    expect(GOB_NAV_SECTIONS[0].items[0].href).toBe("/gob");
  });

  it('"Vigilancia sanitaria" section precedes "Casos y cumplimiento"', () => {
    const labels = GOB_NAV_SECTIONS.map((s) => s.label);
    const vigIdx = labels.indexOf("Vigilancia sanitaria");
    const casosIdx = labels.indexOf("Casos y cumplimiento");
    expect(vigIdx).toBeGreaterThanOrEqual(0);
    expect(casosIdx).toBeGreaterThanOrEqual(0);
    expect(vigIdx).toBeLessThan(casosIdx);
  });
});

describe("GOB_NAV_FLAT — derived flat list", () => {
  it("exports GOB_NAV_FLAT equal to GOB_NAV_SECTIONS.flatMap(s => s.items)", () => {
    const derived = GOB_NAV_SECTIONS.flatMap((s) => s.items);
    expect(GOB_NAV_FLAT).toEqual(derived);
  });

  it("GOB_NAV_FLAT preserves every href from GOB_NAV", () => {
    const flatHrefs = new Set(GOB_NAV_FLAT.map((i) => i.href));
    for (const href of GOB_HREF_SNAPSHOT) {
      expect(flatHrefs).toContain(href);
    }
  });
});

// ---------------------------------------------------------------------------
// ADMIN_NAV_SECTIONS — grouped nav invariants (Item 1 PR1)
// ---------------------------------------------------------------------------

/**
 * Frozen href snapshot derived from the pre-refactor flat ADMIN_NAV on develop.
 * Hard-coded so a dropped href shrinks the sections union but NOT this set,
 * making the test genuinely catch membership regressions.
 */
const ADMIN_HREF_SNAPSHOT = new Set([
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
]);

describe("ADMIN_NAV_SECTIONS — section invariants", () => {
  it("exports ADMIN_NAV_SECTIONS as a non-empty array", () => {
    expect(Array.isArray(ADMIN_NAV_SECTIONS)).toBe(true);
    expect(ADMIN_NAV_SECTIONS.length).toBeGreaterThan(0);
  });

  it("no href is lost: every frozen-snapshot href appears in ADMIN_NAV_SECTIONS (snapshot ⊆ union)", () => {
    const sectionHrefs = new Set(ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
    for (const href of ADMIN_HREF_SNAPSHOT) {
      expect(sectionHrefs).toContain(href);
    }
  });

  it("no href is gained: ADMIN_NAV_SECTIONS contains only hrefs from the frozen snapshot (union ⊆ snapshot)", () => {
    const sectionHrefs = ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    for (const href of sectionHrefs) {
      expect(ADMIN_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href is duplicated across sections", () => {
    const sectionHrefs = ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const unique = new Set(sectionHrefs);
    expect(sectionHrefs.length).toBe(unique.size);
  });

  it("first section is unlabeled (Dashboard) with href /admin", () => {
    expect(ADMIN_NAV_SECTIONS[0].label).toBe("");
    expect(ADMIN_NAV_SECTIONS[0].items[0].href).toBe("/admin");
  });
});

describe("ADMIN_NAV_FLAT — derived flat list", () => {
  it("exports ADMIN_NAV_FLAT equal to ADMIN_NAV_SECTIONS.flatMap(s => s.items)", () => {
    const derived = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    expect(ADMIN_NAV_FLAT).toEqual(derived);
  });

  it("ADMIN_NAV_FLAT preserves every href from ADMIN_NAV", () => {
    const flatHrefs = new Set(ADMIN_NAV_FLAT.map((i) => i.href));
    for (const href of ADMIN_HREF_SNAPSHOT) {
      expect(flatHrefs).toContain(href);
    }
  });
});

// ---------------------------------------------------------------------------
// buildOrgNav — grouped NavSection[] invariants (Item 1 PR2)
// ---------------------------------------------------------------------------

/**
 * Frozen href snapshot: the FULL set of org hrefs with ALL capabilities granted.
 * Hard-coded so a dropped href shrinks the sections union but NOT this set —
 * the invariant test genuinely catches membership regressions (non-tautological).
 * 18 hrefs total (14 ungated + 4 gated).
 */
const ORG_HREF_SNAPSHOT = new Set([
  "/org/ORG-ABC",
  "/org/ORG-ABC/agenda",
  "/org/ORG-ABC/intake",
  "/org/ORG-ABC/transitos",
  "/org/ORG-ABC/voluntarios",
  "/org/ORG-ABC/mascotas",
  "/org/ORG-ABC/transferencias",
  "/org/ORG-ABC/adopciones",
  "/org/ORG-ABC/checkins",
  "/org/ORG-ABC/casos",
  "/org/ORG-ABC/maltrato/recibidos",
  "/org/ORG-ABC/mordedura/nuevo",
  "/org/ORG-ABC/servicios",
  "/org/ORG-ABC/miembros",
  "/org/ORG-ABC/cobertura",
  "/org/ORG-ABC/admin/permisos",
  "/org/ORG-ABC/configuracion",
  "/org/ORG-ABC/censo",
]);

describe("buildOrgNav — section invariants", () => {
  it("no href is lost: every frozen-snapshot href appears in sections (snapshot ⊆ union)", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    const sectionHrefs = new Set(sections.flatMap((s) => s.items.map((i) => i.href)));
    for (const href of ORG_HREF_SNAPSHOT) {
      expect(sectionHrefs).toContain(href);
    }
  });

  it("no href is gained: sections contain only hrefs from the frozen snapshot (union ⊆ snapshot)", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    const sectionHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    for (const href of sectionHrefs) {
      expect(ORG_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href is duplicated across sections", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    const sectionHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    const unique = new Set(sectionHrefs);
    expect(sectionHrefs.length).toBe(unique.size);
  });

  it("with no capabilities, gated items (Ingresos, Check-ins, Permisos) are absent from all sections", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: new Set() });
    const allItems = sections.flatMap((s) => s.items);
    const labels = allItems.map((i) => i.label);
    expect(labels).not.toContain("Ingresos");
    expect(labels).not.toContain("Check-ins");
    expect(labels).not.toContain("Permisos");
  });

  it("with no capabilities, sections that become empty are dropped", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: new Set() });
    for (const section of sections) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("with full grants, exactly 5 sections are present and in order", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    expect(sections.map((s) => s.label)).toEqual([
      "Operación",
      "Animales",
      "Adopciones",
      "Casos",
      "Administración",
    ]);
  });

  it("buildOrgNavFlat equals sections.flatMap(s => s.items) for full grants", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: ALL_GATED_CAPS });
    const flat = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS });
    expect(flat).toEqual(sections.flatMap((s) => s.items));
  });
});
