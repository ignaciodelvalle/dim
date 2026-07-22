// Unit tests for nav-presets — pure module, no React required.

import { describe, expect, it } from "vitest";
import {
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

// Every capability that gates a nav item. QA histórico 2026-07-08 #81 widened
// the gating: Mascotas (pet.read_held), Tránsitos/Voluntarios (foster.assign),
// Operaciones (adoption.review), Servicios (service_offering.create) are now
// capability-gated so a zero-capability member's sidebar matches the panel copy
// "Cada permiso habilita su módulo en el menú". QA histórico 2026-07-08 #2
// closed the remaining gap: Transferencias (org.transfer.propose OR
// org.transfer.accept), Casos (pet.read_held), Miembros (member.invite) are
// now also capability-gated (Cobertura gates on role — see FULL_NAV below).
const ALL_GATED_CAPS = new Set([
  "appointment.manage",
  "intake.create",
  "adoption.review",
  "capability.grant",
  "bite.report",
  "foster.assign",
  "pet.read_held",
  "service_offering.create",
  "member.invite",
  "org.transfer.propose",
  "org.transfer.accept",
]);

// Full nav = every capability granted AND an admin role (Maltrato +
// Configuración + Cobertura gate on role, not capability). Use for the "all
// sections present" invariants.
const FULL_NAV = { granted: ALL_GATED_CAPS, role: "admin" } as const;

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
  it("produces exactly Panel when no capabilities/role are passed (zero-capability member)", () => {
    // QA histórico 2026-07-08 #81 gated the operational modules; #2 (round 2)
    // closed the remaining gap — Transferencias, Casos, Miembros and Cobertura
    // were still un-gated "membership-level" items, so a zero-capability
    // foster still saw them. All four are now gated (capability or role), so
    // the true zero-grant baseline is just Panel.
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(labels).toEqual(["Panel"]);
  });

  it("produces 18 items when all capabilities are granted and role is admin", () => {
    expect(buildOrgNavFlat("ORG-ABC", FULL_NAV)).toHaveLength(18);
  });

  it("hides Agenda, Ingresos, Check-ins, Mordeduras and Permisos without their capabilities", () => {
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(labels).not.toContain("Agenda");
    expect(labels).not.toContain("Ingresos");
    expect(labels).not.toContain("Check-ins");
    expect(labels).not.toContain("Mordeduras");
    expect(labels).not.toContain("Permisos");
  });

  it("shows each gated item only with its own capability", () => {
    const intakeOnly = buildOrgNavFlat("ORG-ABC", { granted: new Set(["intake.create"]) }).map(
      (i) => i.label,
    );
    expect(intakeOnly).toContain("Ingresos");
    expect(intakeOnly).not.toContain("Agenda");
    expect(intakeOnly).not.toContain("Check-ins");
    expect(intakeOnly).not.toContain("Permisos");

    const agendaOnly = buildOrgNavFlat("ORG-ABC", {
      granted: new Set(["appointment.manage"]),
    }).map((i) => i.label);
    expect(agendaOnly).toContain("Agenda");
    expect(agendaOnly).not.toContain("Ingresos");
    expect(agendaOnly).not.toContain("Check-ins");
    expect(agendaOnly).not.toContain("Permisos");
  });

  it("gates Transferencias behind org.transfer.propose OR org.transfer.accept (QA #2)", () => {
    const baseline = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(baseline).not.toContain("Transferencias");

    const withPropose = buildOrgNavFlat("ORG-ABC", {
      granted: new Set(["org.transfer.propose"]),
    }).map((i) => i.label);
    expect(withPropose).toContain("Transferencias");

    const withAccept = buildOrgNavFlat("ORG-ABC", {
      granted: new Set(["org.transfer.accept"]),
    }).map((i) => i.label);
    expect(withAccept).toContain("Transferencias");
  });

  it("gates Casos behind pet.read_held (QA #2)", () => {
    const baseline = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(baseline).not.toContain("Casos");

    const withRead = buildOrgNavFlat("ORG-ABC", { granted: new Set(["pet.read_held"]) }).map(
      (i) => i.label,
    );
    expect(withRead).toContain("Casos");
  });

  it("gates Miembros behind member.invite (QA #2)", () => {
    const baseline = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(baseline).not.toContain("Miembros");

    const withInvite = buildOrgNavFlat("ORG-ABC", { granted: new Set(["member.invite"]) }).map(
      (i) => i.label,
    );
    expect(withInvite).toContain("Miembros");
  });

  it("gates Cobertura behind role admin/coordinator, not capability (QA #2)", () => {
    // Every capability granted, still no role → hidden.
    const capsOnly = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS }).map((i) => i.label);
    expect(capsOnly).not.toContain("Cobertura");

    // A foster (no manage role) still doesn't see it, even with every capability.
    const foster = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS, role: "foster" }).map(
      (i) => i.label,
    );
    expect(foster).not.toContain("Cobertura");

    // admin / coordinator do, matching the page's own `canManage` check.
    const admin = buildOrgNavFlat("ORG-ABC", { role: "admin" }).map((i) => i.label);
    expect(admin).toContain("Cobertura");
    const coordinator = buildOrgNavFlat("ORG-ABC", { role: "coordinator" }).map((i) => i.label);
    expect(coordinator).toContain("Cobertura");
  });

  it("gates Tránsitos/Voluntarios behind foster.assign (QA #81)", () => {
    const labels = buildOrgNavFlat("ORG-ABC").map((i) => i.label);
    expect(labels).not.toContain("Tránsitos");
    expect(labels).not.toContain("Voluntarios");
    const withFoster = buildOrgNavFlat("ORG-ABC", { granted: new Set(["foster.assign"]) }).map(
      (i) => i.label,
    );
    expect(withFoster).toContain("Tránsitos");
    expect(withFoster).toContain("Voluntarios");
  });

  it("gates Mascotas behind pet.read_held (QA #81)", () => {
    expect(buildOrgNavFlat("ORG-ABC").map((i) => i.label)).not.toContain("Mascotas");
    const withRead = buildOrgNavFlat("ORG-ABC", { granted: new Set(["pet.read_held"]) }).map(
      (i) => i.label,
    );
    expect(withRead).toContain("Mascotas");
  });

  it("gates Maltrato + Configuración by role, not capability (QA #81)", () => {
    // No role → both hidden even with every capability granted.
    const capsOnly = buildOrgNavFlat("ORG-ABC", { granted: ALL_GATED_CAPS }).map((i) => i.label);
    expect(capsOnly).not.toContain("Maltrato");
    expect(capsOnly).not.toContain("Configuración");
    // A foster is not a welfare role and is not admin → still hidden.
    const foster = buildOrgNavFlat("ORG-ABC", { role: "foster" }).map((i) => i.label);
    expect(foster).not.toContain("Maltrato");
    expect(foster).not.toContain("Configuración");
    // A member sees Maltrato (welfare role) but not Configuración (admin-only).
    const member = buildOrgNavFlat("ORG-ABC", { role: "member" }).map((i) => i.label);
    expect(member).toContain("Maltrato");
    expect(member).not.toContain("Configuración");
    // Admin sees both.
    const admin = buildOrgNavFlat("ORG-ABC", { role: "admin" }).map((i) => i.label);
    expect(admin).toContain("Maltrato");
    expect(admin).toContain("Configuración");
  });

  it("shows Mordeduras only with bite.report, pointing at the report form", () => {
    const items = buildOrgNavFlat("ORG-ABC", { granted: new Set(["bite.report"]) });
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

  it("does not leak requiredCapability / requiredAnyCapability / requiredRoles into the returned NavItem objects", () => {
    const items = buildOrgNavFlat("ORG-ABC", FULL_NAV);
    for (const item of items) {
      expect("requiredCapability" in item).toBe(false);
      expect("requiredAnyCapability" in item).toBe(false);
      expect("requiredRoles" in item).toBe(false);
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

  it("contains Mascotas, Servicios, Operaciones, Miembros, Cobertura, Configuración, Maltrato entries (full nav)", () => {
    const labels = buildOrgNavFlat("ORG-ABC", FULL_NAV).map((i) => i.label);
    expect(labels).toContain("Mascotas");
    expect(labels).toContain("Servicios");
    expect(labels).toContain("Operaciones");
    expect(labels).toContain("Miembros");
    expect(labels).toContain("Cobertura");
    expect(labels).toContain("Configuración");
    expect(labels).toContain("Maltrato");
  });

  it("Cobertura entry points to /org/<orgToken>/cobertura", () => {
    // Cobertura is role-gated (admin/coordinator, QA #2) — pass role: "admin".
    const items = buildOrgNavFlat("ORG-ABC", { role: "admin" });
    const cobertura = items.find((i) => i.label === "Cobertura");
    expect(cobertura).toBeDefined();
    expect(cobertura?.href).toBe("/org/ORG-ABC/cobertura");
  });

  it("Configuración entry points to /org/<orgToken>/configuracion", () => {
    const items = buildOrgNavFlat("ORG-ABC", { role: "admin" });
    const config = items.find((i) => i.label === "Configuración");
    expect(config).toBeDefined();
    expect(config?.href).toBe("/org/ORG-ABC/configuracion");
  });

  it("Maltrato entry points to /org/<orgToken>/maltrato/recibidos", () => {
    const items = buildOrgNavFlat("ORG-ABC", { role: "member" });
    const maltrato = items.find((i) => i.label === "Maltrato");
    expect(maltrato).toBeDefined();
    expect(maltrato?.href).toBe("/org/ORG-ABC/maltrato/recibidos");
  });

  it("Maltrato entry matchPrefix covers /org/<orgToken>/maltrato (highlights both recibidos and nuevo)", () => {
    const items = buildOrgNavFlat("ORG-ABC", { role: "member" });
    const maltrato = items.find((i) => i.label === "Maltrato");
    expect(maltrato?.matchPrefix).toBe("/org/ORG-ABC/maltrato");
  });

  // Org-type gating of the shelter-only modules (task #18, preverify #10). A
  // clinic AND a sanitary_authority admin implicitly hold every capability, so
  // the org-type gate — not capability — is what drops Tránsitos / Voluntarios /
  // Operaciones / Check-ins for non-rehoming types.
  const SHELTER_ONLY_NAV = ["Tránsitos", "Voluntarios", "Operaciones", "Check-ins"];

  it("hides shelter-only modules for a clinic (org-type gate)", () => {
    const labels = buildOrgNavFlat("ORG-ABC", {
      granted: ALL_GATED_CAPS,
      role: "admin",
      orgType: "clinic",
    }).map((i) => i.label);
    for (const label of SHELTER_ONLY_NAV) expect(labels).not.toContain(label);
  });

  it("hides shelter-only modules for a sanitary_authority (preverify #10 — was still leaking)", () => {
    const labels = buildOrgNavFlat("ORG-ABC", {
      granted: ALL_GATED_CAPS,
      role: "admin",
      orgType: "sanitary_authority",
    }).map((i) => i.label);
    for (const label of SHELTER_ONLY_NAV) expect(labels).not.toContain(label);
    // But universal modules still show for a sanitary authority.
    expect(labels).toContain("Casos");
    expect(labels).toContain("Maltrato");
    expect(labels).toContain("Permisos");
  });

  it("keeps shelter-only modules for shelter and rescue_network", () => {
    for (const orgType of ["shelter", "rescue_network"]) {
      const labels = buildOrgNavFlat("ORG-ABC", {
        granted: ALL_GATED_CAPS,
        role: "admin",
        orgType,
      }).map((i) => i.label);
      for (const label of SHELTER_ONLY_NAV) expect(labels).toContain(label);
    }
  });

  it("hides shelter-only modules for org type 'other'", () => {
    const labels = buildOrgNavFlat("ORG-ABC", {
      granted: ALL_GATED_CAPS,
      role: "admin",
      orgType: "other",
    }).map((i) => i.label);
    for (const label of SHELTER_ONLY_NAV) expect(labels).not.toContain(label);
  });
});

describe("OWNER_NAV", () => {
  // PO ronda 4 (2026-07-15): 2 items. The former "Inicio" tab was removed —
  // /inicio is only a server redirect into the most-urgent pet's credential
  // (the carousel under /mis-mascotas/[token]), so the tab never lit up and it
  // bypassed the vet-landing gate. This SUPERSEDES the 2026-07-02 three-item
  // split (decision #645). Identity (Cuenta) is still the account pill and
  // notifications are still the bell — neither is a nav peer.
  it("has exactly 2 items", () => {
    expect(OWNER_NAV).toHaveLength(2);
  });

  it("no longer surfaces an 'Inicio' tab (the /inicio route stays; only the nav entry died)", () => {
    const inicio = OWNER_NAV.find((i) => i.label === "Inicio");
    expect(inicio).toBeUndefined();
    expect(OWNER_NAV.map((i) => i.href)).not.toContain("/inicio");
  });

  it("leads with 'Mis mascotas' → /mis-mascotas, active on pet pages via matchPrefix", () => {
    const misMascotas = OWNER_NAV.find((i) => i.label === "Mis mascotas");
    expect(misMascotas).toBeDefined();
    expect(misMascotas?.href).toBe("/mis-mascotas");
    expect(misMascotas?.matchPrefix).toBe("/mis-mascotas");
  });

  it("contains Denuncias tab pointing to /denuncias/mias", () => {
    // "Denuncias" (noun), not "Denunciar" (verb) — an action label pointing
    // at a list misled nav-first users (flow audit 2026-07-03, PO decision);
    // the list's own "Nueva denuncia" CTA carries the action.
    const denuncias = OWNER_NAV.find((i) => i.label === "Denuncias");
    expect(denuncias).toBeDefined();
    expect(denuncias?.href).toBe("/denuncias/mias");
  });

  it("is in order Mis mascotas → Denuncias", () => {
    expect(OWNER_NAV.map((i) => i.label)).toEqual(["Mis mascotas", "Denuncias"]);
  });

  it("no longer surfaces Notificaciones, Adopciones or Turnos as nav peers", () => {
    const hrefs = OWNER_NAV.map((i) => i.href);
    expect(hrefs).not.toContain("/notificaciones"); // still the bell
    expect(hrefs).not.toContain("/adoptar");
    expect(hrefs).not.toContain("/mis-turnos");
  });
});

// NOTE (test-suite audit 2026-07): the former per-route "GOB_NAV / ADMIN_NAV —
// no route regression" blocks (one `it` per href + a >=N length floor) were
// deleted as fully subsumed: GOB_NAV === GOB_NAV_FLAT === flatten(GOB_NAV_SECTIONS)
// (same for ADMIN_*), and the frozen-snapshot invariant pairs below assert set
// EQUALITY in both directions against hard-coded snapshots — strictly stronger
// than per-route containment plus a length floor.

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
  "/gob/panorama", // Centro de Situación Nacional — flagship console
  "/gob/programa", // gov-vis — exec summary scoped to jurisdiction
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
  "/gob/rupga", // RUPGA service-dog credential revocation console
  "/gob/perdidas",
  "/gob/disputas",
  "/gob/maltrato",
  "/gob/moderacion", // Phase 0 placeholder — jurisdiction-scoped denuncia moderation
  "/gob/decomisos",
  "/gob/campanas", // Item 20 — campaign performance
  "/gob/outreach", // Item 21 — actionable outreach pipelines
  "/gob/censo", // Paquete E — censo poblacional & salud del registro
  "/gob/poblacion", // Paquete G — control poblacional (North Star)
  "/gob/adopciones", // Paquete F — pipeline de custodia & adopción
  // /gob/sistema deliberately EXCLUDED — folded into /gob/programa for govt
  // operators (2026-07-09 audit). Route still exists as a redirect for deep
  // links but is no longer in nav.
  "/gob/outbox", // gov-vis — ENO SLA / notification monitor scoped to jurisdiction
  "/gob/suscripciones", // promoted out of /gob/programa's alert sub-panel (2026-07-21)
  "/gob/denuncias", // C6a — Denuncias hub (Moderación → Triage → Caso front door)
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

  // C6a (2026-07-22) — Casos y cumplimiento / Vigilancia sanitaria / Registro y
  // aprobaciones / Confiabilidad / Referencia were regrouped into the 5-layer
  // model (Situación/Programa/Intervención/Bandeja operativa/Profundidad).
  // These tests now encode the NEW grouping, not the old module-mirroring one.

  it("includes /gob/denuncias and /gob/moderacion in the Bandeja operativa section (C6a hub)", () => {
    const bandejaSection = GOB_NAV_SECTIONS.find((s) => s.label === "Bandeja operativa");
    const hrefs = bandejaSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/gob/denuncias");
    expect(hrefs).toContain("/gob/moderacion");
    expect(hrefs).toContain("/gob/maltrato");
    const denuncias = bandejaSection?.items.find((i) => i.href === "/gob/denuncias");
    expect(denuncias?.label).toBe("Denuncias");
    const moderacion = bandejaSection?.items.find((i) => i.href === "/gob/moderacion");
    expect(moderacion?.label).toBe("Moderación");
    expect(moderacion?.matchPrefix).toBe("/gob/moderacion");
  });

  it("includes /gob/mortalidad and /gob/poblacion in the Programa section (C6a — outcome dashboards)", () => {
    const progSection = GOB_NAV_SECTIONS.find((s) => s.label === "Programa");
    const hrefs = progSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/gob/mortalidad");
    expect(hrefs).toContain("/gob/poblacion");
    // Judgment call: Adopciones (outcome-vs-target dashboard) also lives here.
    expect(hrefs).toContain("/gob/adopciones");
  });

  it("includes /gob/programa in the Programa section, not the unlabeled top (C6a — top holds only Panel)", () => {
    const unlabeled = GOB_NAV_SECTIONS.find((s) => s.label === "");
    expect(unlabeled?.items.map((i) => i.href)).toEqual(["/gob"]);
    const progSection = GOB_NAV_SECTIONS.find((s) => s.label === "Programa");
    expect(progSection?.items.map((i) => i.href)).toContain("/gob/programa");
  });

  it("does NOT include /gob/sistema anywhere (folded into /gob/programa)", () => {
    const allHrefs = GOB_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/gob/sistema");
  });

  it("includes /gob/outbox in the Bandeja operativa section (gov-vis, C6a)", () => {
    const bandejaSection = GOB_NAV_SECTIONS.find((s) => s.label === "Bandeja operativa");
    expect(bandejaSection?.items.map((i) => i.href)).toContain("/gob/outbox");
  });

  it("includes /gob/rupga in the Intervención section (C6a — action console judgment)", () => {
    const intervSection = GOB_NAV_SECTIONS.find((s) => s.label === "Intervención");
    const hrefs = intervSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/gob/rupga");
    expect(hrefs).toContain("/gob/outreach");
    expect(hrefs).toContain("/gob/decomisos");
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

  it("sections follow the C6a layer order: Situación → Programa → Intervención → Bandeja operativa → Profundidad", () => {
    const labels = GOB_NAV_SECTIONS.map((s) => s.label);
    expect(labels).toEqual([
      "",
      "Situación",
      "Programa",
      "Intervención",
      "Bandeja operativa",
      "Profundidad",
    ]);
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
  "/admin/panorama", // Centro de Situación Nacional — flagship console
  // portal-follows-viewer (2026-07-02) — Cola/Usuarios/Organizaciones exist
  // under both /admin and /gob; admin nav points at the /admin/* copy.
  "/admin/cola",
  "/admin/usuarios",
  "/admin/organizaciones",
  "/admin/historial",
  "/admin/auditoria",
  "/admin/outbox",
  "/admin/sistema",
  "/admin/govts",
  "/admin/admins",
  // admin-rules-console — Reglas/Servicios exist under both portals; admin
  // nav points at the /admin/* copy.
  "/admin/reglas",
  "/admin/servicios",
  "/admin/observaciones",
  "/admin/moderacion",
  "/admin/casos",
  "/admin/alertas", // WS-K — bandeja de alertas + triage
  "/admin/suscripciones", // promoted out of /admin/programa's alert sub-panel (2026-07-21)
  "/admin/censo", // Paquete E — censo poblacional & salud del registro
  "/admin/adopciones", // Paquete F — pipeline de custodia & adopción
  "/admin/poblacion", // Paquete G — control poblacional (North Star)
  "/admin/programa", // Paquete H — resumen ejecutivo del programa
  "/admin/libro", // WS-L — Libro de eventos (event-sourcing visible)
  "/admin/inteligencia", // Task #44 — inteligencia operativa territorial
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
    // Deferred sentinels (#defer-…) are presentation affordances, not routes —
    // exclude them from the live-route invariant (D6).
    const sectionHrefs = ADMIN_NAV_SECTIONS.flatMap((s) =>
      s.items.filter((i) => !i.deferred).map((i) => i.href),
    );
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

  // C6a (2026-07-22) — Analítica/Operaciones/Confiabilidad/Identidad y
  // acceso/Gobernanza were regrouped into the 5-layer model, mirroring
  // GOB_NAV_SECTIONS where the same screens exist. These tests now encode
  // the NEW grouping (superseding the C26/C27 taxonomy split below).

  it("includes /admin/poblacion and /admin/programa in the Programa section (C6a)", () => {
    const progSection = ADMIN_NAV_SECTIONS.find((s) => s.label === "Programa");
    const hrefs = progSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/admin/poblacion");
    expect(hrefs).toContain("/admin/programa");
    // Programa leads the layer (highest-level view first).
    expect(progSection?.items[0]?.href).toBe("/admin/programa");
  });

  it("Situación is the first labeled section (C6a — Panorama leads, mirrors gob)", () => {
    // index 0 is the unlabeled Panel-only top; the first NAMED group is
    // where the eye lands next.
    const firstLabeled = ADMIN_NAV_SECTIONS.find((s) => s.label !== "");
    expect(firstLabeled?.label).toBe("Situación");
  });

  it("Situación holds Panorama + Observaciones (C6a — epidemiological surveillance judgment)", () => {
    const situSection = ADMIN_NAV_SECTIONS.find((s) => s.label === "Situación");
    expect(situSection?.items.map((i) => i.href)).toEqual([
      "/admin/panorama",
      "/admin/observaciones",
    ]);
  });

  it("includes /admin/alertas and /admin/moderacion in the Bandeja operativa section (C6a)", () => {
    const bandejaSection = ADMIN_NAV_SECTIONS.find((s) => s.label === "Bandeja operativa");
    const hrefs = bandejaSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/admin/alertas");
    expect(hrefs).toContain("/admin/moderacion");
    expect(hrefs).toContain("/admin/casos");
    expect(hrefs).toContain("/admin/outbox");
    const alertas = bandejaSection?.items.find((i) => i.href === "/admin/alertas");
    expect(alertas?.label).toBe("Alertas");
    expect(alertas?.matchPrefix).toBe("/admin/alertas");
    // No analytics/program routes leaked into the queue layer.
    expect(hrefs).not.toContain("/admin/programa");
    expect(hrefs).not.toContain("/admin/poblacion");
  });

  it("includes /admin/libro and /admin/inteligencia in the Profundidad section (C6a)", () => {
    const profSection = ADMIN_NAV_SECTIONS.find((s) => s.label === "Profundidad");
    const hrefs = profSection?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/admin/libro");
    expect(hrefs).toContain("/admin/inteligencia");
    expect(hrefs).toContain("/admin/sistema");
    expect(hrefs).toContain("/admin/auditoria");
    const libro = profSection?.items.find((i) => i.href === "/admin/libro");
    expect(libro?.label).toBe("Libro de eventos");
    expect(libro?.matchPrefix).toBe("/admin/libro");
  });

  it("admin has no Intervención layer (no outreach/decomisos/rupga routes)", () => {
    const labels = ADMIN_NAV_SECTIONS.map((s) => s.label);
    expect(labels).not.toContain("Intervención");
  });

  it("sections follow the C6a layer order: Situación → Programa → Bandeja operativa → Profundidad", () => {
    const labels = ADMIN_NAV_SECTIONS.map((s) => s.label);
    expect(labels).toEqual(["", "Situación", "Programa", "Bandeja operativa", "Profundidad"]);
  });

  it("C6a regroup is href-preserving: section union equals the frozen snapshot exactly", () => {
    // The split MUST NOT lose or gain any LIVE href — only regroup. The union of
    // all live section hrefs must equal ADMIN_HREF_SNAPSHOT as a set (both
    // directions). Deferred sentinels (#defer-…) are excluded — not routes (D6).
    const union = new Set(
      ADMIN_NAV_SECTIONS.flatMap((s) => s.items.filter((i) => !i.deferred).map((i) => i.href)),
    );
    expect(union).toEqual(ADMIN_HREF_SNAPSHOT);
  });

  // portal-follows-viewer (2026-07-02) — no admin nav href may point at
  // /gob/*. The 5 shared work surfaces (cola, usuarios, organizaciones,
  // reglas, servicios) now have a real /admin/* copy (thin wrapper re-
  // exporting the /gob page; chrome from the admin layout), so an admin nav
  // href landing on /gob/* would silently eject the viewer into gob chrome —
  // exactly what portal-follows-viewer exists to prevent.
  it("no ADMIN_NAV_SECTIONS href points at /gob/* (portal-follows-viewer)", () => {
    const hrefs = ADMIN_NAV_SECTIONS.flatMap((s) =>
      s.items.filter((i) => !i.deferred).map((i) => i.href),
    );
    for (const href of hrefs) {
      expect(href.startsWith("/gob/")).toBe(false);
    }
    // And the live /admin/* targets ARE present (the repoint actually happened).
    expect(hrefs).toContain("/admin/cola");
    expect(hrefs).toContain("/admin/usuarios");
    expect(hrefs).toContain("/admin/organizaciones");
    expect(hrefs).toContain("/admin/reglas");
    expect(hrefs).toContain("/admin/servicios");
  });

  // The old AC3-era /admin/{cola,usuarios,organizaciones} → /gob/* redirects
  // are GONE (portal-follows-viewer serves real pages at those paths now).
  // Only the renamed /admin/jurisdicciones bookmark still remaps, to
  // /admin/reglas — verify the admin nav doesn't link to that dead alias.
  it("no ADMIN_NAV_SECTIONS href points at the legacy /admin/jurisdicciones alias", () => {
    const hrefs = ADMIN_NAV_SECTIONS.flatMap((s) =>
      s.items.filter((i) => !i.deferred).map((i) => i.href),
    );
    for (const href of hrefs) {
      expect(href.startsWith("/admin/jurisdicciones")).toBe(false);
    }
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
 * 18 hrefs total (13 ungated + 5 gated).
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
    const sections = buildOrgNav("ORG-ABC", FULL_NAV);
    const sectionHrefs = new Set(sections.flatMap((s) => s.items.map((i) => i.href)));
    for (const href of ORG_HREF_SNAPSHOT) {
      expect(sectionHrefs).toContain(href);
    }
  });

  it("no href is gained: sections contain only hrefs from the frozen snapshot (union ⊆ snapshot)", () => {
    const sections = buildOrgNav("ORG-ABC", FULL_NAV);
    const sectionHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    for (const href of sectionHrefs) {
      expect(ORG_HREF_SNAPSHOT).toContain(href);
    }
  });

  it("no href is duplicated across sections", () => {
    const sections = buildOrgNav("ORG-ABC", FULL_NAV);
    const sectionHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    const unique = new Set(sectionHrefs);
    expect(sectionHrefs.length).toBe(unique.size);
  });

  it("with no capabilities, gated items (Agenda, Ingresos, Check-ins, Permisos) are absent from all sections", () => {
    const sections = buildOrgNav("ORG-ABC", { granted: new Set() });
    const allItems = sections.flatMap((s) => s.items);
    const labels = allItems.map((i) => i.label);
    expect(labels).not.toContain("Agenda");
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
    const sections = buildOrgNav("ORG-ABC", FULL_NAV);
    expect(sections.map((s) => s.label)).toEqual([
      "Operación",
      "Animales",
      "Adopciones",
      "Casos",
      "Administración",
    ]);
  });

  it("buildOrgNavFlat equals sections.flatMap(s => s.items) for full grants", () => {
    const sections = buildOrgNav("ORG-ABC", FULL_NAV);
    const flat = buildOrgNavFlat("ORG-ABC", FULL_NAV);
    expect(flat).toEqual(sections.flatMap((s) => s.items));
  });
});

// ---------------------------------------------------------------------------
// UX 1.4 — label rename: /gob/historial "Histórico" → "Mi actividad"
// Route is unchanged (href preserved); only the surface label is updated.
// ---------------------------------------------------------------------------

describe("UX 1.4 — gob /historial label rename", () => {
  it("/gob/historial href is preserved in GOB_NAV (no route loss)", () => {
    const hrefs = GOB_NAV.map((i) => i.href);
    expect(hrefs).toContain("/gob/historial");
  });

  it('/gob/historial item label is "Mi actividad" (not "Histórico")', () => {
    const allItems = GOB_NAV_SECTIONS.flatMap((s) => s.items);
    const item = allItems.find((i) => i.href === "/gob/historial");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Mi actividad");
    expect(item?.label).not.toBe("Histórico");
  });

  it('/admin/historial retains its original "Historial" label (only gob label changed)', () => {
    const allAdminItems = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    const item = allAdminItems.find((i) => i.href === "/admin/historial");
    expect(item).toBeDefined();
    expect(item?.label).toBe("Historial");
  });
});
