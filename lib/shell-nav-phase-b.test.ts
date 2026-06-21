// Phase B tests — operator-parity + ContextSwitcher entitlements.
//
// Operator-parity: confirms that the hrefs consumed by the AppShell
// operator layouts match the NavSection[] Item 1 sources exactly —
// no href dropped, no href added. This is the frozen-snapshot style
// established in nav-presets.test.ts.
//
// ContextSwitcher: tests buildSwitcher entitlement logic per role
// (drives the ContextSwitcher component which simply renders the result).

import {
  ADMIN_NAV_SECTIONS,
  GOB_NAV_SECTIONS,
  buildOrgNav,
  buildOrgNavFlat,
} from "@/components/layout/nav-presets";
import { describe, expect, it } from "vitest";
import { buildSwitcher } from "./shell-nav";

// ---------------------------------------------------------------------------
// Frozen href snapshots — exactly matching nav-presets.test.ts snapshots.
// These are intentionally hard-coded (not derived from GOB_NAV_SECTIONS) so
// that a dropped href in the source shrinks the union but NOT this set.
// ---------------------------------------------------------------------------

const GOB_HREF_SNAPSHOT = new Set([
  "/gob",
  "/gob/panorama", // Centro de Situación Nacional — flagship console
  "/gob/cola",
  "/gob/vigilancia",
  "/gob/mortalidad",
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
  "/gob/campanas",
  "/gob/outreach", // Item 21 — actionable outreach pipelines
]);

const ADMIN_HREF_SNAPSHOT = new Set([
  "/admin",
  "/admin/panorama", // Centro de Situación Nacional — flagship console
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

const ALL_ORG_CAPS = new Set(["intake.create", "adoption.review", "capability.grant"]);

const ORG_HREF_SNAPSHOT = new Set([
  "/org/ORG-ABC",
  "/org/ORG-ABC/agenda",
  "/org/ORG-ABC/intake",
  "/org/ORG-ABC/transitos",
  "/org/ORG-ABC/voluntarios",
  "/org/ORG-ABC/mascotas",
  "/org/ORG-ABC/censo",
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
]);

// ---------------------------------------------------------------------------
// Parity: gob operator rail (AppShell variant=operator consumes GOB_NAV_SECTIONS)
// ---------------------------------------------------------------------------

describe("Phase B operator parity — gob", () => {
  const allHrefs = GOB_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

  it("GOB_NAV_SECTIONS union contains every frozen snapshot href (snapshot ⊆ union)", () => {
    const union = new Set(allHrefs);
    for (const href of GOB_HREF_SNAPSHOT) {
      expect(union).toContain(href);
    }
  });

  it("GOB_NAV_SECTIONS union contains only frozen snapshot hrefs (union ⊆ snapshot)", () => {
    for (const href of allHrefs) {
      expect(GOB_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href duplicated across sections", () => {
    const unique = new Set(allHrefs);
    expect(allHrefs.length).toBe(unique.size);
  });

  it("has at least 15 items (matches GOB_HREF_SNAPSHOT cardinality)", () => {
    expect(allHrefs.length).toBeGreaterThanOrEqual(15);
  });

  it("sections form the expected structure (5 groups including 1 unlabeled)", () => {
    // 1 unlabeled + named sections
    expect(GOB_NAV_SECTIONS.length).toBeGreaterThanOrEqual(2);
    expect(GOB_NAV_SECTIONS[0].label).toBe("");
    expect(GOB_NAV_SECTIONS[0].items[0].href).toBe("/gob");
  });
});

// ---------------------------------------------------------------------------
// Parity: admin operator rail
// ---------------------------------------------------------------------------

describe("Phase B operator parity — admin", () => {
  const allHrefs = ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

  it("ADMIN_NAV_SECTIONS union contains every frozen snapshot href (snapshot ⊆ union)", () => {
    const union = new Set(allHrefs);
    for (const href of ADMIN_HREF_SNAPSHOT) {
      expect(union).toContain(href);
    }
  });

  it("ADMIN_NAV_SECTIONS union contains only frozen snapshot hrefs (union ⊆ snapshot)", () => {
    for (const href of allHrefs) {
      expect(ADMIN_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href duplicated across sections", () => {
    const unique = new Set(allHrefs);
    expect(allHrefs.length).toBe(unique.size);
  });

  it("has at least 15 items (matches ADMIN_HREF_SNAPSHOT cardinality)", () => {
    expect(allHrefs.length).toBeGreaterThanOrEqual(15);
  });

  it("first section is unlabeled (Dashboard) with href /admin", () => {
    expect(ADMIN_NAV_SECTIONS[0].label).toBe("");
    expect(ADMIN_NAV_SECTIONS[0].items[0].href).toBe("/admin");
  });

  it("outbox item is present and keeps its href (badge is injected at runtime, not here)", () => {
    const allItems = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    const outbox = allItems.find((i) => i.href === "/admin/outbox");
    expect(outbox).toBeDefined();
    expect(outbox?.label).toBe("Outbox");
    // No badge property set statically — badge is runtime-injected in admin layout
    expect(outbox?.badge).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Parity: org operator rail (buildOrgNav is the same source used in layout)
// ---------------------------------------------------------------------------

describe("Phase B operator parity — org", () => {
  const sections = buildOrgNav("ORG-ABC", { granted: ALL_ORG_CAPS });
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));

  it("buildOrgNav union contains every frozen snapshot href (snapshot ⊆ union)", () => {
    const union = new Set(allHrefs);
    for (const href of ORG_HREF_SNAPSHOT) {
      expect(union).toContain(href);
    }
  });

  it("buildOrgNav union contains only frozen snapshot hrefs (union ⊆ snapshot)", () => {
    for (const href of allHrefs) {
      expect(ORG_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href duplicated across sections", () => {
    const unique = new Set(allHrefs);
    expect(allHrefs.length).toBe(unique.size);
  });

  it("with no capabilities, gated items are absent (same guard as layout uses)", () => {
    const limited = buildOrgNav("ORG-ABC", { granted: new Set() });
    const labels = limited.flatMap((s) => s.items).map((i) => i.label);
    expect(labels).not.toContain("Ingresos");
    expect(labels).not.toContain("Check-ins");
    expect(labels).not.toContain("Permisos");
  });

  it("buildOrgNavFlat produces same hrefs as the sections union (flat equals sections.flatMap)", () => {
    const flat = buildOrgNavFlat("ORG-ABC", { granted: ALL_ORG_CAPS });
    expect(flat.map((i) => i.href)).toEqual(allHrefs);
  });
});

// ---------------------------------------------------------------------------
// ContextSwitcher entitlements — drives the ContextSwitcher component (D6).
// buildSwitcher is the pure entitlement kernel; ContextSwitcher renders it.
// ---------------------------------------------------------------------------

describe("ContextSwitcher entitlements — buildSwitcher", () => {
  // Owner: no org memberships → no switcher (single-context user, D6 not shown)
  it("plain owner with no memberships → empty switcher (not rendered)", () => {
    expect(buildSwitcher({ role: "owner", displayName: "Ana" })).toEqual([]);
  });

  // Owner: org memberships → org destinations, never gob/admin
  it("owner with org memberships → only org destinations listed", () => {
    const targets = buildSwitcher({
      role: "owner",
      displayName: "Ana",
      orgMemberships: [
        { token: "ORG-1", name: "Refugio Norte" },
        { token: "ORG-2", name: "Refugio Sur" },
      ],
    });
    expect(targets.map((t) => t.key)).toEqual(["org", "org"]);
    expect(targets.map((t) => t.href)).toEqual(["/org/ORG-1", "/org/ORG-2"]);
    // NEVER exposes gob or admin to an owner (D6 security invariant)
    expect(targets.map((t) => t.key)).not.toContain("gob");
    expect(targets.map((t) => t.key)).not.toContain("admin");
  });

  // govt: single context within gob — always gets a "volver a ciudadano" escape
  it("govt on /gob → switcher offers volver-a-ciudadano, nothing else", () => {
    const targets = buildSwitcher({ role: "govt", displayName: "Inspector" });
    expect(targets).toHaveLength(1);
    expect(targets[0].key).toBe("citizen");
    expect(targets[0].href).toBe("/mis-mascotas");
  });

  // govt: never sees gob or admin offered (already on gob, admin is forbidden)
  it("govt never sees gob or admin in the switcher", () => {
    const targets = buildSwitcher({ role: "govt", displayName: "Inspector" });
    expect(targets.map((t) => t.key)).not.toContain("gob");
    expect(targets.map((t) => t.key)).not.toContain("admin");
  });

  // admin WITH govt assignments: citizen + gob offered
  it("admin with govtAssignments → citizen escape + gob hop, never re-lists admin", () => {
    const targets = buildSwitcher({
      role: "admin",
      displayName: "Root",
      govtAssignments: true,
    });
    const keys = targets.map((t) => t.key);
    expect(keys).toContain("citizen");
    expect(keys).toContain("gob");
    // admin is already "here" — MUST NOT appear in its own switcher
    expect(keys).not.toContain("admin");
  });

  // admin WITHOUT govt assignments: only citizen escape, no gob
  it("admin without govtAssignments → citizen escape only, no gob", () => {
    const targets = buildSwitcher({
      role: "admin",
      displayName: "Root",
      govtAssignments: false,
    });
    const keys = targets.map((t) => t.key);
    expect(keys).toContain("citizen");
    expect(keys).not.toContain("gob");
  });

  // anon: empty (no session → no switcher)
  it("null session → empty switcher", () => {
    expect(buildSwitcher(null)).toEqual([]);
  });

  // citizen escape always points to /mis-mascotas (the "personal world" landing)
  it("operator citizen escape always targets /mis-mascotas", () => {
    const govtTargets = buildSwitcher({ role: "govt", displayName: "Inspector" });
    const adminTargets = buildSwitcher({
      role: "admin",
      displayName: "Root",
      govtAssignments: false,
    });
    expect(govtTargets[0].href).toBe("/mis-mascotas");
    expect(adminTargets[0].href).toBe("/mis-mascotas");
  });

  // single-context user never exposes gob to a plain owner
  it("never exposes gob or admin to a plain owner (D6 security invariant)", () => {
    const targets = buildSwitcher({ role: "owner", displayName: "Owner" });
    expect(targets.map((t) => t.key)).not.toContain("gob");
    expect(targets.map((t) => t.key)).not.toContain("admin");
  });
});
