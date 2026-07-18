// Role-specific nav presets for Sidebar and AppHeader.
// Pure module — no side effects, no React, no async.
// All three operator portals (gob, admin, org) use grouped NavSection[].
// Flat derivations are kept for callers that still need NavItem[] (mobile drawer, link-integrity test).

import type { NavSection } from "@/components/ui/dashboard";
import type { NavItem } from "./HeaderNav";

// ---------------------------------------------------------------------------
// Public portal nav — shared by all unauthenticated-accessible portals.
// Intentionally excludes "Mi libreta" (requires auth) and "Inicio" (landing).
// ---------------------------------------------------------------------------

export const PUBLIC_NAV: NavItem[] = [
  { href: "/adoptar", label: "Adoptar", matchPrefix: "/adoptar" },
  { href: "/perdidas", label: "Mascotas perdidas", matchPrefix: "/perdidas" },
  { href: "/refugios", label: "Refugios", matchPrefix: "/refugios" },
  { href: "/denuncias", label: "Denuncias", matchPrefix: "/denuncias" },
];

// ---------------------------------------------------------------------------
// Owner portal
// ---------------------------------------------------------------------------

// Owner nav — 2 items (PO ronda 4, 2026-07-15). The former "Inicio" tab is
// GONE. /inicio is now only a server redirect INTO the most-urgent pet's
// credential (the carousel lives under /mis-mascotas/[token]), so the tab never
// lit up — the carousel marks "Mis mascotas" active (matchPrefix /mis-mascotas),
// leaving "Inicio" perpetually dark — and it created a vet-gating asymmetry
// (/inicio bypassed the vet-landing gate). Removing the tab (SUPERSEDING the
// 2026-07-02 three-item split, decision #645) leaves the two REAL owner
// destinations. The /inicio ROUTE stays (post-login landing + old bookmarks +
// the Asentar fallback target); only its nav entry dies. Identity (Cuenta) is
// the account pill and notifications are the bell — neither is a nav peer.
export const OWNER_NAV: NavItem[] = [
  { href: "/mis-mascotas", label: "Mis mascotas", matchPrefix: "/mis-mascotas" },
  // "Denuncias", not "Denunciar" (flow audit 2026-07-03, PO decision): an
  // action verb pointing at a LIST promised the create flow and delivered
  // status. The noun matches the destination; the list's own "Nueva
  // denuncia" CTA covers the action.
  { href: "/denuncias/mias", label: "Denuncias", matchPrefix: "/denuncias" },
];

// ---------------------------------------------------------------------------
// Org portal
// Sections model: capability-filtered items partitioned into NavSection[].
// Sections that end up empty after filtering are dropped.
// ---------------------------------------------------------------------------

export type OrgNavOptions = {
  /**
   * Capabilities granted to the viewing member (from getGrantedCapabilities).
   * Capability-gated items (Mascotas, Agenda, Ingresos, Tránsitos, Voluntarios,
   * Operaciones, Check-ins, Servicios, Mordeduras, Permisos, Transferencias,
   * Casos, Miembros) only render when their capability is present. Omit to
   * build the near-empty baseline nav (Panel only, plus any role-gated items).
   */
  granted?: ReadonlySet<string>;
  /**
   * The organization's type (organizations.orgType). A clinic OR
   * sanitary_authority admin implicitly holds every capability, so capability
   * gating alone can't hide the shelter-only modules (Tránsitos, Voluntarios,
   * Adopciones, Check-ins) — they are noise on any non-rehoming org type.
   * Passing orgType filters them out for every type except shelter /
   * rescue_network, mirroring the page-level `capabilityAppliesToOrgType` /
   * SHELTER_ONLY_CAPABILITIES used by the org home cards (UX gate M2, preverify
   * #10).
   */
  orgType?: string;
  /**
   * The viewing member's membership role (organization_memberships.role).
   * Three nav items gate on ROLE, not capability, because their pages do:
   * Maltrato (welfare reports — page restricts to
   * admin/coordinator/member/vet_individual), Configuración (admin-only — the
   * page redirects everyone else), and Cobertura (no dedicated capability
   * exists — the page's own `canManage` check is admin/coordinator-only).
   * Omit to hide all three. QA histórico 2026-07-08 #81 and #2: the sidebar
   * over-exposed modules a zero-capability foster could not actually use,
   * contradicting the panel copy "Cada permiso habilita su módulo en el menú".
   */
  role?: string;
};

// Roles allowed to open the org welfare inbox (mirrors ALLOWED_ROLES in
// app/org/[orgToken]/maltrato/recibidos/page.tsx — sensitive PII surface).
const WELFARE_NAV_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "coordinator",
  "member",
  "vet_individual",
]);

// Roles allowed to manage coverage zones (mirrors `canManage` in
// app/org/[orgToken]/cobertura/page.tsx — the page has no dedicated
// capability, gating is role-only). QA histórico 2026-07-08 #2: nav must
// match that gate, not leave Cobertura in the un-gated baseline.
const COVERAGE_MANAGE_ROLES: ReadonlySet<string> = new Set(["admin", "coordinator"]);

type OrgNavItem = NavItem & {
  requiredCapability?: string;
  /**
   * Item shown when the member holds ANY of these capabilities (Transferencias —
   * a member can hold org.transfer.propose, org.transfer.accept, or both, since
   * they're independently grantable per admin/permisos).
   */
  requiredAnyCapability?: readonly string[];
  shelterOnly?: boolean;
  /** Item shown only when the member's role is in this set (Maltrato, Configuración, Cobertura). */
  requiredRoles?: ReadonlySet<string>;
};

/**
 * Returns the org nav as grouped NavSection[].
 * Sections are built after capability filtering, so any section left empty
 * (all its items were gated and none were granted) is dropped entirely.
 */
export function buildOrgNav(orgToken: string, opts: OrgNavOptions = {}): NavSection[] {
  const granted = opts.granted ?? new Set<string>();
  const orgType = opts.orgType;
  // Hide the shelter-only modules (Tránsitos, Voluntarios, Operaciones,
  // Check-ins) for org types that don't run the custody-rehoming lifecycle.
  // Mirrors the capability model's SHELTER_ONLY_CAPABILITIES / REHOMING_ORG_TYPES
  // (capabilities.ts): only shelter + rescue_network keep them. A clinic admin
  // AND a sanitary_authority admin implicitly hold every capability, so
  // capability gating alone can't drop these — the org-type gate is the right
  // filter. Preverify #10: the old clinic-only gate left sanitary_authority
  // still surfacing them. When orgType is omitted (link-integrity / full-nav
  // callers), nothing is hidden.
  const hideShelterOnly =
    orgType !== undefined && orgType !== "shelter" && orgType !== "rescue_network";
  const role = opts.role;

  // All candidate items with their section assignment and optional capability gate.
  const allItems: Array<OrgNavItem & { section: string }> = [
    // Operación
    { href: `/org/${orgToken}`, label: "Panel", section: "Operación" },
    {
      href: `/org/${orgToken}/agenda`,
      label: "Agenda",
      matchPrefix: `/org/${orgToken}/agenda`,
      requiredCapability: "appointment.manage",
      section: "Operación",
    },
    {
      href: `/org/${orgToken}/intake`,
      label: "Ingresos",
      matchPrefix: `/org/${orgToken}/intake`,
      requiredCapability: "intake.create",
      section: "Operación",
    },
    {
      href: `/org/${orgToken}/censo`,
      label: "Censo",
      matchPrefix: `/org/${orgToken}/censo`,
      requiredCapability: "intake.create",
      section: "Operación",
    },
    {
      href: `/org/${orgToken}/transitos`,
      label: "Tránsitos",
      matchPrefix: `/org/${orgToken}/transitos`,
      requiredCapability: "foster.assign",
      section: "Operación",
      shelterOnly: true,
    },
    {
      href: `/org/${orgToken}/voluntarios`,
      label: "Voluntarios",
      matchPrefix: `/org/${orgToken}/voluntarios`,
      requiredCapability: "foster.assign",
      section: "Operación",
      shelterOnly: true,
    },
    // Animales
    {
      href: `/org/${orgToken}/mascotas`,
      label: "Mascotas",
      matchPrefix: `/org/${orgToken}/mascotas`,
      requiredCapability: "pet.read_held",
      section: "Animales",
    },
    {
      // Gated on the cross-org handshake capabilities (spec
      // 2026-05-19-cross-org-transfer-ux): org.transfer.propose covers the
      // sender flow (/transferencias, /transferencias/nueva) and
      // org.transfer.accept covers the receiver flow (/transferencias/recibidas).
      // They're independently grantable (admin/permisos), so a member with
      // either one has a real reason to see this module — OR, not AND.
      // QA histórico 2026-07-08 #2: was un-gated ("membership-level"), which
      // over-exposed the module to zero-capability fosters.
      href: `/org/${orgToken}/transferencias`,
      label: "Transferencias",
      matchPrefix: `/org/${orgToken}/transferencias`,
      requiredAnyCapability: ["org.transfer.propose", "org.transfer.accept"],
      section: "Animales",
    },
    // Adopciones
    {
      href: `/org/${orgToken}/adopciones`,
      label: "Operaciones",
      matchPrefix: `/org/${orgToken}/adopciones`,
      requiredCapability: "adoption.review",
      section: "Adopciones",
      shelterOnly: true,
    },
    {
      href: `/org/${orgToken}/checkins`,
      label: "Check-ins",
      matchPrefix: `/org/${orgToken}/checkins`,
      requiredCapability: "adoption.review",
      section: "Adopciones",
      shelterOnly: true,
    },
    // Casos
    {
      // The case queue (listCasesForOrg) surfaces intake/custody/transfer
      // activity on animals the org holds — same read surface as Mascotas, so
      // it's gated on the same capability. QA histórico 2026-07-08 #2: was
      // un-gated ("membership-level"), over-exposing it to zero-capability
      // fosters.
      href: `/org/${orgToken}/casos`,
      label: "Casos",
      matchPrefix: `/org/${orgToken}/casos`,
      requiredCapability: "pet.read_held",
      section: "Casos",
    },
    {
      href: `/org/${orgToken}/maltrato/recibidos`,
      label: "Maltrato",
      matchPrefix: `/org/${orgToken}/maltrato`,
      requiredRoles: WELFARE_NAV_ROLES,
      section: "Casos",
    },
    {
      // No index page under /mordedura — the report form is the entry point.
      href: `/org/${orgToken}/mordedura/nuevo`,
      label: "Mordeduras",
      matchPrefix: `/org/${orgToken}/mordedura`,
      requiredCapability: "bite.report",
      section: "Casos",
    },
    // Administración
    {
      href: `/org/${orgToken}/servicios`,
      label: "Servicios",
      matchPrefix: `/org/${orgToken}/servicios`,
      requiredCapability: "service_offering.create",
      section: "Administración",
    },
    {
      // The members page itself is viewable by any member (roster), but the
      // page is only ACTIONABLE (invite/manage) with member.invite — gate
      // nav on that, matching the "member admin" module it represents. QA
      // histórico 2026-07-08 #2: was un-gated, over-exposing it to
      // zero-capability fosters.
      href: `/org/${orgToken}/miembros`,
      label: "Miembros",
      matchPrefix: `/org/${orgToken}/miembros`,
      requiredCapability: "member.invite",
      section: "Administración",
    },
    {
      // No dedicated capability exists for coverage — the page gates edit
      // access on role (`canManage` = admin/coordinator). Nav mirrors that
      // exact role gate. QA histórico 2026-07-08 #2: was un-gated, over-
      // exposing it to zero-capability fosters.
      href: `/org/${orgToken}/cobertura`,
      label: "Cobertura",
      matchPrefix: `/org/${orgToken}/cobertura`,
      requiredRoles: COVERAGE_MANAGE_ROLES,
      section: "Administración",
    },
    {
      href: `/org/${orgToken}/admin/permisos`,
      label: "Permisos",
      matchPrefix: `/org/${orgToken}/admin`,
      requiredCapability: "capability.grant",
      section: "Administración",
    },
    {
      href: `/org/${orgToken}/configuracion`,
      label: "Configuración",
      matchPrefix: `/org/${orgToken}/configuracion`,
      requiredRoles: new Set(["admin"]),
      section: "Administración",
    },
  ];

  // Section order determines render order — must match the spec exactly.
  const SECTION_ORDER = ["Operación", "Animales", "Adopciones", "Casos", "Administración"] as const;

  // Filter by capability AND org type (a clinic admin implicitly holds every
  // capability, so the shelter-only modules must be dropped by org type — not
  // capability), then strip internal fields.
  const filtered = allItems
    .filter((item) => !item.requiredCapability || granted.has(item.requiredCapability))
    .filter(
      (item) =>
        !item.requiredAnyCapability || item.requiredAnyCapability.some((cap) => granted.has(cap)),
    )
    .filter((item) => !item.requiredRoles || (role !== undefined && item.requiredRoles.has(role)))
    .filter((item) => !(item.shelterOnly && hideShelterOnly))
    .map(
      ({
        requiredCapability: _cap,
        requiredAnyCapability: _anyCap,
        requiredRoles: _rr,
        shelterOnly: _so,
        section: _sec,
        ...item
      }) => ({
        ...item,
        section: _sec,
      }),
    );

  // Partition into sections, preserving order. Drop empty sections.
  const sections: NavSection[] = [];
  for (const sectionLabel of SECTION_ORDER) {
    const items = filtered
      .filter((item) => item.section === sectionLabel)
      .map(({ section: _sec, ...item }) => item);
    if (items.length > 0) {
      sections.push({ label: sectionLabel, items });
    }
  }

  return sections;
}

/**
 * Flat derived list — use where NavItem[] is required
 * (e.g. link-integrity tests, mobile drawer fallback).
 */
export function buildOrgNavFlat(orgToken: string, opts: OrgNavOptions = {}): NavItem[] {
  return buildOrgNav(orgToken, opts).flatMap((s) => s.items);
}

// ---------------------------------------------------------------------------
// Gobierno (/gob)
// Sections model: grouped NavSection[]. GOB_NAV (flat) is derived from
// GOB_NAV_SECTIONS and kept for backward compatibility with existing tests.
// ---------------------------------------------------------------------------

export const GOB_NAV_SECTIONS: NavSection[] = [
  // Unlabeled — the Panel root + the Panorama console sit above the groups.
  {
    label: "",
    items: [
      { href: "/gob", label: "Panel" },
      { href: "/gob/panorama", label: "Panorama", matchPrefix: "/gob/panorama" },
      // Paquete gov-vis — exec summary (highest-level view, mirrors /admin/programa placement)
      { href: "/gob/programa", label: "Programa", matchPrefix: "/gob/programa" },
    ],
  },
  {
    label: "Vigilancia sanitaria",
    items: [
      { href: "/gob/vigilancia", label: "Vigilancia", matchPrefix: "/gob/vigilancia" },
      { href: "/gob/mortalidad", label: "Mortalidad", matchPrefix: "/gob/mortalidad" },
      { href: "/gob/analytics", label: "Analítica", matchPrefix: "/gob/analytics" },
      { href: "/gob/campanas", label: "Campañas", matchPrefix: "/gob/campanas" },
      { href: "/gob/outreach", label: "Alcance comunitario", matchPrefix: "/gob/outreach" },
      { href: "/gob/poblacion", label: "Población", matchPrefix: "/gob/poblacion" },
    ],
  },
  {
    label: "Casos y cumplimiento",
    items: [
      { href: "/gob/casos", label: "Casos", matchPrefix: "/gob/casos" },
      // Jurisdiction-scoped denuncia moderation queue (spec:
      // docs/design/handoffs/2026-07-07-govt-jurisdiction-moderation-sdd.md).
      { href: "/gob/moderacion", label: "Moderación", matchPrefix: "/gob/moderacion" },
      { href: "/gob/maltrato", label: "Maltrato", matchPrefix: "/gob/maltrato" },
      { href: "/gob/decomisos", label: "Decomisos", matchPrefix: "/gob/decomisos" },
      { href: "/gob/disputas", label: "Disputas", matchPrefix: "/gob/disputas" },
      { href: "/gob/perdidas", label: "Pérdidas", matchPrefix: "/gob/perdidas" },
    ],
  },
  {
    label: "Registro y aprobaciones",
    items: [
      { href: "/gob/censo", label: "Censo", matchPrefix: "/gob/censo" },
      { href: "/gob/adopciones", label: "Adopciones", matchPrefix: "/gob/adopciones" },
      { href: "/gob/cola", label: "Cola", matchPrefix: "/gob/cola" },
      { href: "/gob/organizaciones", label: "Organizaciones", matchPrefix: "/gob/organizaciones" },
      { href: "/gob/usuarios", label: "Usuarios", matchPrefix: "/gob/usuarios" },
      { href: "/gob/rupga", label: "Credenciales RUPGA", matchPrefix: "/gob/rupga" },
      { href: "/gob/reglas", label: "Reglas", matchPrefix: "/gob/reglas" },
    ],
  },
  {
    // Mirrors the "Confiabilidad" section in ADMIN_NAV_SECTIONS for operational views.
    label: "Confiabilidad",
    items: [
      // /gob/sistema folded into /gob/programa (2026-07-09 audit): its KPIs
      // (ENO SLA, scoped queue aging) duplicated fetchers already on Programa;
      // the one unique figure (total ENO notifications) moved into Programa's
      // SLA KPI. /gob/sistema still exists as a redirect for deep links.
      { href: "/gob/outbox", label: "Bandeja de salida", matchPrefix: "/gob/outbox" },
    ],
  },
  {
    label: "Referencia",
    items: [
      { href: "/gob/servicios", label: "Servicios", matchPrefix: "/gob/servicios" },
      { href: "/gob/historial", label: "Mi actividad", matchPrefix: "/gob/historial" },
    ],
  },
];

/** Flat derived list — use where a NavItem[] is required (e.g. mobile drawer). */
export const GOB_NAV_FLAT: NavItem[] = GOB_NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Backward-compatible flat constant kept for existing tests and any caller
 * that imports GOB_NAV directly.
 */
export const GOB_NAV: NavItem[] = GOB_NAV_FLAT;

// ---------------------------------------------------------------------------
// Admin (/admin)
// Sections model: grouped NavSection[]. ADMIN_NAV (flat) is derived from
// ADMIN_NAV_SECTIONS and kept for backward compatibility.
// The outbox badge is injected at runtime in app/admin/layout.tsx by mapping
// over ADMIN_NAV_SECTIONS directly — not stored here.
// ---------------------------------------------------------------------------

export const ADMIN_NAV_SECTIONS: NavSection[] = [
  // Unlabeled — the Dashboard root + the Panorama console sit above the groups.
  {
    label: "",
    items: [
      { href: "/admin", label: "Panel" },
      { href: "/admin/panorama", label: "Panorama", matchPrefix: "/admin/panorama" },
    ],
  },
  {
    // Analítica — population/program analytics (C27 split from Confiabilidad).
    // Placed first among labeled sections so the executive summary (Programa)
    // is the most prominent destination on the rail (C26: promote Programa).
    label: "Analítica",
    items: [
      // Paquete H — exec summary / programa (top of section: highest-level view first)
      { href: "/admin/programa", label: "Programa", matchPrefix: "/admin/programa" },
      { href: "/admin/censo", label: "Censo", matchPrefix: "/admin/censo" },
      { href: "/admin/adopciones", label: "Adopciones", matchPrefix: "/admin/adopciones" },
      { href: "/admin/poblacion", label: "Población", matchPrefix: "/admin/poblacion" },
      // Task #44 — territorial operational intelligence (composite index,
      // policy→outcome loop, per-province data quality).
      { href: "/admin/inteligencia", label: "Inteligencia", matchPrefix: "/admin/inteligencia" },
    ],
  },
  {
    label: "Operaciones",
    items: [
      // Cola/Usuarios/Organizaciones/Reglas/Servicios exist under BOTH /admin
      // and /gob (portal-follows-viewer, 2026-07-02) — thin /admin/* wrappers
      // re-export the /gob page; chrome comes from each segment's layout. The
      // admin nav links to the /admin/* copy so an admin never leaves the
      // admin chrome. The old /admin→/gob 308s for these paths are GONE.
      { href: "/admin/cola", label: "Cola", matchPrefix: "/admin/cola" },
      { href: "/admin/alertas", label: "Alertas", matchPrefix: "/admin/alertas" },
      { href: "/admin/casos", label: "Casos", matchPrefix: "/admin/casos" },
      { href: "/admin/moderacion", label: "Moderación", matchPrefix: "/admin/moderacion" },
      { href: "/admin/observaciones", label: "Observaciones", matchPrefix: "/admin/observaciones" },
    ],
  },
  {
    // Confiabilidad — operational health only (C27: analytics moved to Analítica).
    label: "Confiabilidad",
    items: [
      { href: "/admin/sistema", label: "Sistema", matchPrefix: "/admin/sistema" },
      { href: "/admin/outbox", label: "Bandeja de salida", matchPrefix: "/admin/outbox" },
      { href: "/admin/auditoria", label: "Auditoría", matchPrefix: "/admin/auditoria" },
    ],
  },
  {
    label: "Identidad y acceso",
    items: [
      // Usuarios/Organizaciones exist under both portals (portal-follows-
      // viewer) — admin nav points at the /admin/* copy.
      { href: "/admin/usuarios", label: "Usuarios", matchPrefix: "/admin/usuarios" },
      { href: "/admin/govts", label: "Gobiernos", matchPrefix: "/admin/govts" },
      { href: "/admin/admins", label: "Administradores", matchPrefix: "/admin/admins" },
      {
        href: "/admin/organizaciones",
        label: "Organizaciones",
        matchPrefix: "/admin/organizaciones",
      },
    ],
  },
  {
    label: "Gobernanza",
    items: [
      // Reglas/Servicios exist under both portals (portal-follows-viewer,
      // admin-rules-console) — admin nav points at the /admin/* copy so an
      // admin drilling into a jurisdiction or a rule form stays in /admin
      // chrome. Only the renamed /admin/jurisdicciones bookmark still 308s
      // (to /admin/reglas).
      { href: "/admin/reglas", label: "Reglas", matchPrefix: "/admin/reglas" },
      { href: "/admin/historial", label: "Historial", matchPrefix: "/admin/historial" },
      // WS-L — Libro de eventos (event-sourcing visible; read-only).
      { href: "/admin/libro", label: "Libro de eventos", matchPrefix: "/admin/libro" },
      { href: "/admin/servicios", label: "Servicios", matchPrefix: "/admin/servicios" },
    ],
  },
];

/** Flat derived list — use where a NavItem[] is required (e.g. mobile drawer or badge injection). */
export const ADMIN_NAV_FLAT: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Backward-compatible flat constant kept for existing tests and any caller
 * that imports ADMIN_NAV directly.
 */
export const ADMIN_NAV: NavItem[] = ADMIN_NAV_FLAT;
