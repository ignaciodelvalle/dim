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

// C6a nav regroup (2026-07-22, docs/reviews/results/2026-07-22-plan-maestro-integridad.md
// §C6): regroups the 26 EXISTING routes under the operator mental model
// (BRIEFING → SITUACIÓN → PROGRAMA → INTERVENCIÓN → PROFUNDIDAD, plus the
// cross-cutting BANDEJA OPERATIVA for queue-shaped work) instead of mirroring
// the module tree. PO-locked: regroup only — no route moves/renames. The one
// new href is /gob/denuncias (the Denuncias hub, see app/gob/denuncias/page.tsx),
// which is additive: Moderación/Maltrato keep their own nav entries too.
//
// Judgment calls (reported alongside this change):
//  - Adopciones: not named in any C6a layer bullet. It is an outcome-vs-target
//    program dashboard (KPI row + funnel + trend, "¿funciona el ciclo de
//    colocación?"), not a review queue — placed in Programa, next to
//    Censo/Población/Campañas/Mortalidad which share that shape.
//  - RUPGA: originally kept in Intervención as a per-row ACTION console
//    (revocar credencial), not a passive registry view — SUPERSEDED by the
//    F3+F7 fusion below, which absorbs it into the Directorio hub instead.
//  - /gob/sistema has no nav entry today (folded into /gob/programa,
//    2026-07-09 audit; route survives only as a deep-link redirect) — nothing
//    to regroup, so Profundidad's "Sistema" is a no-op here.
export const GOB_NAV_SECTIONS: NavSection[] = [
  // Unlabeled/top — Panel only. This is the future Briefing's home; every
  // other top-level surface now lives in one of the five layers below.
  {
    label: "",
    items: [{ href: "/gob", label: "Panel" }],
  },
  {
    // Situational/risk surfaces — "what does the map look like right now".
    label: "Situación",
    items: [
      { href: "/gob/panorama", label: "Panorama", matchPrefix: "/gob/panorama" },
      { href: "/gob/vigilancia", label: "Vigilancia", matchPrefix: "/gob/vigilancia" },
      { href: "/gob/perdidas", label: "Pérdidas", matchPrefix: "/gob/perdidas" },
    ],
  },
  {
    // Outcome-vs-target program surfaces.
    label: "Programa",
    items: [
      // Paquete gov-vis — exec summary (highest-level view, leads the layer)
      { href: "/gob/programa", label: "Programa", matchPrefix: "/gob/programa" },
      { href: "/gob/poblacion", label: "Población", matchPrefix: "/gob/poblacion" },
      { href: "/gob/censo", label: "Censo", matchPrefix: "/gob/censo" },
      { href: "/gob/mortalidad", label: "Mortalidad", matchPrefix: "/gob/mortalidad" },
      // Judgment call: custody/adoption pipeline dashboard (KPI+funnel+trend),
      // not a review queue — grouped with the other outcome dashboards.
      { href: "/gob/adopciones", label: "Adopciones", matchPrefix: "/gob/adopciones" },
    ],
  },
  {
    // Field/action surfaces — the operator DOES something to a specific target.
    // F2 fusion (2026-07-22, PO-approved route unification — same worker,
    // same weekly planning moment): Operativos ABSORBS Campañas (formerly in
    // Programa) and Alcance comunitario as tabbed views
    // (`?vista=campanas|alcance`) of ONE screen — "¿dónde y cómo intervengo
    // esta semana?". /gob/campanas and /gob/outreach survive only as
    // permanent redirects into /gob/operativos?vista=... for old links/
    // bookmarks; neither has its own nav entry anymore.
    //
    // F3+F7 fusion (2026-07-22): RUPGA's standalone entry is ALSO absorbed —
    // it becomes the Directorio hub's "Credenciales" tab (Profundidad
    // section below), so Intervención now holds only the two genuine field-
    // action surfaces. /gob/rupga survives as a permanent redirect into
    // /gob/directorio?registro=credenciales.
    label: "Intervención",
    items: [
      { href: "/gob/operativos", label: "Operativos", matchPrefix: "/gob/operativos" },
      { href: "/gob/decomisos", label: "Decomisos", matchPrefix: "/gob/decomisos" },
    ],
  },
  {
    // Queue-shaped work: inbox → tomar → actuar → cerrar. F1 fusion
    // (2026-07-22, PO-approved route unification — same worker, same daily
    // moment, same decision family): Denuncias ABSORBS Moderación and
    // Maltrato as tabbed stages (`?etapa=moderacion|triage`) of ONE screen —
    // superseding the earlier C6a additive hub (which kept them as separate
    // nav siblings). /gob/moderacion and /gob/maltrato survive only as
    // permanent redirects into /gob/denuncias?etapa=... for old links/
    // bookmarks; neither has its own nav entry anymore.
    label: "Bandeja operativa",
    items: [
      { href: "/gob/denuncias", label: "Denuncias", matchPrefix: "/gob/denuncias" },
      { href: "/gob/cola", label: "Cola", matchPrefix: "/gob/cola" },
      { href: "/gob/casos", label: "Casos", matchPrefix: "/gob/casos" },
      { href: "/gob/disputas", label: "Disputas", matchPrefix: "/gob/disputas" },
      // /gob/sistema deliberately EXCLUDED — folded into /gob/programa for govt
      // operators (2026-07-09 audit). Route still exists as a redirect for deep
      // links but is no longer in nav.
      { href: "/gob/outbox", label: "Bandeja de salida", matchPrefix: "/gob/outbox" },
      // Promoted out of the /gob/programa "Alertas y suscripciones" sub-panel
      // (2026-07-21) — threshold alert subscription management now has its
      // own destination. Admin twin: /admin/suscripciones.
      {
        href: "/gob/suscripciones",
        label: "Alertas y suscripciones",
        matchPrefix: "/gob/suscripciones",
      },
    ],
  },
  {
    // Analyst/admin-config surfaces — deep-dive, not day-to-day triage.
    // F3+F7 fusion (2026-07-22, PO-approved route unification — registry-
    // entity management, identical roster grammar): Directorio ABSORBS
    // Organizaciones, Usuarios, Servicios, and RUPGA (the "Credenciales" tab)
    // as tabbed registers (`?registro=organizaciones|usuarios|servicios|
    // credenciales`) of ONE screen. /gob/organizaciones, /gob/usuarios,
    // /gob/servicios and /gob/rupga survive only as permanent redirects into
    // /gob/directorio?registro=... for old links/bookmarks; none has its own
    // nav entry anymore — RUPGA's former Intervención entry (above) is GONE
    // too, its revocation console body relocated as-is into the
    // "Credenciales" tab.
    label: "Profundidad",
    items: [
      { href: "/gob/analytics", label: "Analítica", matchPrefix: "/gob/analytics" },
      { href: "/gob/historial", label: "Mi actividad", matchPrefix: "/gob/historial" },
      { href: "/gob/reglas", label: "Reglas", matchPrefix: "/gob/reglas" },
      { href: "/gob/directorio", label: "Directorio", matchPrefix: "/gob/directorio" },
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

// C6a nav regroup (2026-07-22) — mirrors the GOB_NAV_SECTIONS regroup above
// where the same screens exist. Admin has no Intervención-layer screens
// (no outreach/decomisos/rupga routes under /admin), so that layer is simply
// absent here rather than shipped empty. Judgment calls:
//  - /admin/observaciones (rabies-observation follow-up tracking, in_progress/
//    completed status) is the admin-only epidemiological surveillance surface
//    — admin has no dedicated "Vigilancia" screen, so this fills that role.
//    Placed in Situación, mirroring the plan's "vigilancia se parte:
//    epidemiología→Situación" split.
//  - /admin/inteligencia (territorial composite index, policy→outcome,
//    per-province data quality) is a deep analyst surface, not a day-to-day
//    program dashboard — Profundidad, not Programa.
//  - /admin/sistema, /admin/auditoria, /admin/libro, /admin/govts,
//    /admin/admins: admin-only config/identity/audit surfaces with no gob
//    twin — all Profundidad (analyst/admin-config), same layer as their
//    closest gob relatives (Reglas/Directorio).
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [{ href: "/admin", label: "Panel" }],
  },
  {
    label: "Situación",
    items: [
      { href: "/admin/panorama", label: "Panorama", matchPrefix: "/admin/panorama" },
      { href: "/admin/observaciones", label: "Observaciones", matchPrefix: "/admin/observaciones" },
    ],
  },
  {
    label: "Programa",
    items: [
      // Paquete H — exec summary / programa (top of section: highest-level view first)
      { href: "/admin/programa", label: "Programa", matchPrefix: "/admin/programa" },
      { href: "/admin/censo", label: "Censo", matchPrefix: "/admin/censo" },
      { href: "/admin/adopciones", label: "Adopciones", matchPrefix: "/admin/adopciones" },
      { href: "/admin/poblacion", label: "Población", matchPrefix: "/admin/poblacion" },
    ],
  },
  {
    label: "Bandeja operativa",
    items: [
      // Cola/Usuarios/Organizaciones/Reglas/Servicios exist under BOTH /admin
      // and /gob (portal-follows-viewer, 2026-07-02) — thin /admin/* wrappers
      // re-export the /gob page; chrome comes from each segment's layout. The
      // admin nav links to the /admin/* copy so an admin never leaves the
      // admin chrome. The old /admin→/gob 308s for these paths are GONE.
      { href: "/admin/cola", label: "Cola", matchPrefix: "/admin/cola" },
      { href: "/admin/alertas", label: "Alertas", matchPrefix: "/admin/alertas" },
      // Promoted out of the /admin/programa "Alertas y suscripciones"
      // sub-panel (2026-07-21) — thin wrapper over /gob/suscripciones
      // (portal-follows-viewer). Sits next to the alert INBOX (/admin/alertas)
      // since both are part of the same threshold-alert domain.
      {
        href: "/admin/suscripciones",
        label: "Alertas y suscripciones",
        matchPrefix: "/admin/suscripciones",
      },
      { href: "/admin/casos", label: "Casos", matchPrefix: "/admin/casos" },
      { href: "/admin/moderacion", label: "Moderación", matchPrefix: "/admin/moderacion" },
      { href: "/admin/outbox", label: "Bandeja de salida", matchPrefix: "/admin/outbox" },
    ],
  },
  {
    // F3+F7 fusion (2026-07-22): Usuarios/Organizaciones/Servicios (each a
    // dual-portal thin wrapper, portal-follows-viewer) collapse into ONE
    // /admin/directorio entry — the admin-scoped mirror of the gob Directorio
    // hub (thin re-export, same registry tabs, admin chrome). The admin
    // wrappers (app/admin/usuarios, app/admin/organizaciones,
    // app/admin/servicios) now redirect into /admin/directorio?registro=...
    // rather than rendering inline — same relocation shape as the gob side,
    // just staying inside /admin so an admin viewer never bounces into gob
    // chrome (portal-follows-viewer).
    label: "Profundidad",
    items: [
      { href: "/admin/inteligencia", label: "Inteligencia", matchPrefix: "/admin/inteligencia" },
      { href: "/admin/sistema", label: "Sistema", matchPrefix: "/admin/sistema" },
      { href: "/admin/auditoria", label: "Auditoría", matchPrefix: "/admin/auditoria" },
      { href: "/admin/govts", label: "Gobiernos", matchPrefix: "/admin/govts" },
      { href: "/admin/admins", label: "Administradores", matchPrefix: "/admin/admins" },
      { href: "/admin/directorio", label: "Directorio", matchPrefix: "/admin/directorio" },
      // Reglas exists under both portals (portal-follows-viewer,
      // admin-rules-console) — admin nav points at the /admin/* copy so an
      // admin drilling into a jurisdiction or a rule form stays in /admin
      // chrome. Only the renamed /admin/jurisdicciones bookmark still 308s
      // (to /admin/reglas).
      { href: "/admin/reglas", label: "Reglas", matchPrefix: "/admin/reglas" },
      { href: "/admin/historial", label: "Historial", matchPrefix: "/admin/historial" },
      // WS-L — Libro de eventos (event-sourcing visible; read-only).
      { href: "/admin/libro", label: "Libro de eventos", matchPrefix: "/admin/libro" },
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
