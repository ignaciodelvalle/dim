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

// Owner nav — 3 items (wave-3 P6, PO decision #645 point 5, 2026-07-02).
// This SUPERSEDES the four-actor lean IA critique §2 "two duties + identity
// + a bell" 2-item redesign (2026-07-01, decision #559): that version
// collapsed "Mis mascotas" into "Inicio" (one item, matchPrefixes covering
// both /inicio and /mis-mascotas) on the reasoning that dropping the tab
// orphaned nothing (/inicio already links to /mis-mascotas). The PO
// reviewed with fresh eyes and decided the two destinations are distinct
// enough to deserve separate nav items: **Inicio** (the compliance-register
// home — capture, vencimientos, reminders) and **Mis mascotas** (the pet
// list/management surface). Each item now owns a
// single, disjoint matchPrefix — no matchPrefixes array needed since the
// two owner destinations no longer share a highlight zone.
export const OWNER_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", matchPrefix: "/inicio" },
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
   * Capability-gated items (Agenda, Ingresos, Check-ins, Permisos) only render
   * when their capability is present. Omit to build the membership-only nav.
   */
  granted?: ReadonlySet<string>;
  /**
   * The organization's type (organizations.orgType). A clinic admin implicitly
   * holds every capability, so capability gating alone can't hide the
   * shelter-only modules (Tránsitos, Voluntarios, Adopciones, Check-ins) — they
   * are noise on a veterinary clinic. Passing orgType filters them out for a
   * clinic, mirroring the page-level `capabilityAppliesToOrgType` used by the
   * org home cards (UX gate M2).
   */
  orgType?: string;
};

type OrgNavItem = NavItem & { requiredCapability?: string; shelterOnly?: boolean };

/**
 * Returns the org nav as grouped NavSection[].
 * Sections are built after capability filtering, so any section left empty
 * (all its items were gated and none were granted) is dropped entirely.
 */
export function buildOrgNav(orgToken: string, opts: OrgNavOptions = {}): NavSection[] {
  const granted = opts.granted ?? new Set<string>();
  const isClinic = opts.orgType === "clinic";

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
      section: "Operación",
      shelterOnly: true,
    },
    {
      href: `/org/${orgToken}/voluntarios`,
      label: "Voluntarios",
      matchPrefix: `/org/${orgToken}/voluntarios`,
      section: "Operación",
      shelterOnly: true,
    },
    // Animales
    {
      href: `/org/${orgToken}/mascotas`,
      label: "Mascotas",
      matchPrefix: `/org/${orgToken}/mascotas`,
      section: "Animales",
    },
    {
      href: `/org/${orgToken}/transferencias`,
      label: "Transferencias",
      matchPrefix: `/org/${orgToken}/transferencias`,
      section: "Animales",
    },
    // Adopciones
    {
      href: `/org/${orgToken}/adopciones`,
      label: "Operaciones",
      matchPrefix: `/org/${orgToken}/adopciones`,
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
      href: `/org/${orgToken}/casos`,
      label: "Casos",
      matchPrefix: `/org/${orgToken}/casos`,
      section: "Casos",
    },
    {
      href: `/org/${orgToken}/maltrato/recibidos`,
      label: "Maltrato",
      matchPrefix: `/org/${orgToken}/maltrato`,
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
      section: "Administración",
    },
    {
      href: `/org/${orgToken}/miembros`,
      label: "Miembros",
      matchPrefix: `/org/${orgToken}/miembros`,
      section: "Administración",
    },
    {
      href: `/org/${orgToken}/cobertura`,
      label: "Cobertura",
      matchPrefix: `/org/${orgToken}/cobertura`,
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
    .filter((item) => !(item.shelterOnly && isClinic))
    .map(({ requiredCapability: _cap, shelterOnly: _so, section: _sec, ...item }) => ({
      ...item,
      section: _sec,
    }));

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
      // Phase 0 placeholder — jurisdiction-scoped denuncia moderation (roadmap:
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
      { href: "/gob/reglas", label: "Reglas", matchPrefix: "/gob/reglas" },
    ],
  },
  {
    // Mirrors the "Confiabilidad" section in ADMIN_NAV_SECTIONS for operational views.
    label: "Confiabilidad",
    items: [
      // Paquete gov-vis — operational health + notification SLA monitor
      { href: "/gob/sistema", label: "Sistema", matchPrefix: "/gob/sistema" },
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
      { href: "/admin", label: "Dashboard" },
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
      { href: "/admin/govts", label: "Govts", matchPrefix: "/admin/govts" },
      { href: "/admin/admins", label: "Admins", matchPrefix: "/admin/admins" },
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
