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
import { buildSwitcher } from "@/lib/ui/shell-nav";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Frozen href snapshots — exactly matching nav-presets.test.ts snapshots.
// These are intentionally hard-coded (not derived from GOB_NAV_SECTIONS) so
// that a dropped href in the source shrinks the union but NOT this set.
// ---------------------------------------------------------------------------

const GOB_HREF_SNAPSHOT = new Set([
  "/gob",
  "/gob/panorama", // Centro de Situación Nacional — flagship console
  "/gob/programa", // gov-vis — exec summary scoped to jurisdiction
  "/gob/cola",
  "/gob/vigilancia",
  "/gob/mortalidad",
  "/gob/casos",
  "/gob/moderacion", // Phase 0 placeholder — jurisdiction-scoped denuncia moderation
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
  "/gob/censo", // Paquete E — censo poblacional & salud del registro
  "/gob/poblacion", // Paquete G — control poblacional (North Star)
  "/gob/adopciones", // Paquete F — pipeline de custodia & adopción
  "/gob/sistema", // gov-vis — operational health scoped to jurisdiction
  "/gob/outbox", // gov-vis — ENO SLA / notification monitor scoped to jurisdiction
]);

const ADMIN_HREF_SNAPSHOT = new Set([
  "/admin",
  "/admin/panorama", // Centro de Situación Nacional — flagship console
  // portal-follows-viewer (2026-07-02): the admin rail points at the /admin
  // copies of every shared surface — the earlier AC3 /gob/* repoints were
  // superseded when the shared pages got served under /admin too.
  "/admin/cola",
  "/admin/usuarios",
  "/admin/organizaciones",
  "/admin/reglas",
  "/admin/servicios",
  "/admin/historial",
  "/admin/auditoria",
  "/admin/outbox",
  "/admin/sistema",
  "/admin/govts",
  "/admin/admins",
  "/admin/observaciones",
  "/admin/moderacion",
  "/admin/casos",
  "/admin/alertas", // WS-K — bandeja de alertas + triage
  "/admin/censo", // Paquete E — censo poblacional & salud del registro
  "/admin/adopciones", // Paquete F — pipeline de custodia & adopción
  "/admin/poblacion", // Paquete G — control poblacional (North Star)
  "/admin/programa", // Paquete H — resumen ejecutivo del programa
  "/admin/libro", // WS-L — Libro de eventos (event-sourcing visible)
  "/admin/inteligencia", // Task #44 — inteligencia operativa territorial
]);

// Every capability the org nav gates on — must track nav-presets.test.ts's
// ALL_GATED_CAPS (appointment.manage gates Agenda; bite.report gates
// Mordeduras since QA 2026-07-03).
const ALL_ORG_CAPS = new Set([
  "appointment.manage",
  "intake.create",
  "adoption.review",
  "capability.grant",
  "bite.report",
  // QA histórico 2026-07-08 #81 — these now gate their nav modules too.
  "foster.assign",
  "pet.read_held",
  "service_offering.create",
]);

// Full nav also needs an admin role: Maltrato + Configuración gate on role.
const FULL_ORG_NAV = { granted: ALL_ORG_CAPS, role: "admin" } as const;

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

  it("has at least 24 items (matches GOB_HREF_SNAPSHOT cardinality — includes gov-vis routes)", () => {
    expect(allHrefs.length).toBeGreaterThanOrEqual(24);
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
  // Live routes only — deferred sentinels (#defer-…) are presentation, not routes,
  // and must be excluded from the frozen-snapshot route invariants (D6).
  const allHrefs = ADMIN_NAV_SECTIONS.flatMap((s) =>
    s.items.filter((i) => !i.deferred).map((i) => i.href),
  );

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
    expect(outbox?.label).toBe("Bandeja de salida");
    // No badge property set statically — badge is runtime-injected in admin layout
    expect(outbox?.badge).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Parity: org operator rail (buildOrgNav is the same source used in layout)
// ---------------------------------------------------------------------------

describe("Phase B operator parity — org", () => {
  const sections = buildOrgNav("ORG-ABC", FULL_ORG_NAV);
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
    const flat = buildOrgNavFlat("ORG-ABC", FULL_ORG_NAV);
    expect(flat.map((i) => i.href)).toEqual(allHrefs);
  });
});

// ---------------------------------------------------------------------------
// ContextSwitcher entitlements — drives the ContextSwitcher component (D6).
// buildSwitcher is the pure entitlement kernel; ContextSwitcher renders it.
// ---------------------------------------------------------------------------

describe("ContextSwitcher entitlements — buildSwitcher (surface-aware)", () => {
  // Owner: no org memberships → no switcher (single-context user, D6 not shown)
  it("plain owner with no memberships → empty switcher (not rendered)", () => {
    expect(buildSwitcher({ role: "owner", displayName: "Ana" }, "/inicio")).toEqual([]);
  });

  // Owner: org memberships → org destinations, never gob/admin
  it("owner with org memberships → only org destinations listed", () => {
    const targets = buildSwitcher(
      {
        role: "owner",
        displayName: "Ana",
        orgMemberships: [
          { token: "ORG-1", name: "Refugio Norte" },
          { token: "ORG-2", name: "Refugio Sur" },
        ],
      },
      "/inicio",
    );
    expect(targets.map((t) => t.key)).toEqual(["org", "org"]);
    expect(targets.map((t) => t.href)).toEqual(["/org/ORG-1", "/org/ORG-2"]);
    // NEVER exposes gob or admin to an owner (D6 security invariant)
    expect(targets.map((t) => t.key)).not.toContain("gob");
    expect(targets.map((t) => t.key)).not.toContain("admin");
  });

  // B2: govt is institutional — no owner identity, cannot own pets (DB-enforced),
  // so NO "volver a ciudadano". govt only ever operates /gob → empty switcher.
  it("govt → empty switcher (single operator context, no citizen escape) [B2]", () => {
    expect(buildSwitcher({ role: "govt", displayName: "Inspector" }, "/gob")).toEqual([]);
  });

  it("govt never sees citizen, gob or admin in the switcher [B2]", () => {
    const keys = buildSwitcher({ role: "govt", displayName: "Inspector" }, "/gob").map(
      (t) => t.key,
    );
    expect(keys).not.toContain("citizen");
    expect(keys).not.toContain("gob");
    expect(keys).not.toContain("admin");
  });

  // B1: admin ⇄ gob is surface-aware. From /admin (entitled) → hop to gob,
  // and NEVER a citizen escape (B2).
  it("admin on /admin with govtAssignments → gob hop only, never citizen [B1/B2]", () => {
    const targets = buildSwitcher(
      { role: "admin", displayName: "Root", govtAssignments: true },
      "/admin/casos",
    );
    expect(targets.map((t) => t.key)).toEqual(["gob"]);
    expect(targets[0].href).toBe("/gob");
  });

  // B1: from /gob the admin can always return to /admin — this was the bug
  // (the switcher was built from role alone, so there was no way back).
  it("admin on /gob → 'Volver a Admin' → /admin, never citizen [B1/B2]", () => {
    const targets = buildSwitcher(
      { role: "admin", displayName: "Root", govtAssignments: true },
      "/gob/disputas",
    );
    expect(targets.map((t) => t.key)).toEqual(["admin"]);
    expect(targets[0].href).toBe("/admin");
    expect(targets[0].label).toBe("Volver a Admin");
  });

  // The return-to-admin from /gob does not depend on govtAssignments: an admin
  // operating in /gob is universal-scope and must always have a way back.
  it("admin on /gob without govtAssignments still gets 'Volver a Admin' [B1]", () => {
    const targets = buildSwitcher(
      { role: "admin", displayName: "Root", govtAssignments: false },
      "/gob",
    );
    expect(targets.map((t) => t.key)).toEqual(["admin"]);
  });

  // Without govtAssignments and on /admin, there is no second portal to offer.
  it("admin on /admin without govtAssignments → empty switcher", () => {
    const targets = buildSwitcher(
      { role: "admin", displayName: "Root", govtAssignments: false },
      "/admin",
    );
    expect(targets).toEqual([]);
  });

  // anon: empty (no session → no switcher)
  it("null session → empty switcher", () => {
    expect(buildSwitcher(null, "/gob")).toEqual([]);
  });

  // single-context user never exposes gob to a plain owner
  it("never exposes gob or admin to a plain owner (D6 security invariant)", () => {
    const targets = buildSwitcher({ role: "owner", displayName: "Owner" }, "/inicio");
    expect(targets.map((t) => t.key)).not.toContain("gob");
    expect(targets.map((t) => t.key)).not.toContain("admin");
  });
});
