// Role-specific nav presets for Sidebar and AppHeader.
// Pure module — no side effects, no React, no async.

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

export const OWNER_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", matchPrefix: "/inicio" },
  { href: "/mis-mascotas", label: "Mis Mascotas", matchPrefix: "/mis-mascotas" },
  { href: "/mis-turnos", label: "Turnos", matchPrefix: "/mis-turnos" },
  { href: "/notificaciones", label: "Notificaciones", matchPrefix: "/notificaciones" },
  { href: "/adoptar", label: "Adopciones", matchPrefix: "/adoptar" },
  { href: "/denuncias/mias", label: "Denuncias", matchPrefix: "/denuncias" },
  { href: "/cuenta", label: "Tu cuenta", matchPrefix: "/cuenta" },
];

// ---------------------------------------------------------------------------
// Org portal
// ---------------------------------------------------------------------------

export type OrgNavOptions = {
  /**
   * Capabilities granted to the viewing member (from getGrantedCapabilities).
   * Capability-gated items (Ingresos, Check-ins, Permisos) only render when
   * their capability is present. Omit to build the membership-only nav.
   */
  granted?: ReadonlySet<string>;
};

type OrgNavItem = NavItem & { requiredCapability?: string };

export function buildOrgNav(orgToken: string, opts: OrgNavOptions = {}): NavItem[] {
  const granted = opts.granted ?? new Set<string>();
  const items: OrgNavItem[] = [
    { href: `/org/${orgToken}`, label: "Panel" },
    {
      href: `/org/${orgToken}/agenda`,
      label: "Agenda",
      matchPrefix: `/org/${orgToken}/agenda`,
    },
    {
      href: `/org/${orgToken}/mascotas`,
      label: "Mascotas",
      matchPrefix: `/org/${orgToken}/mascotas`,
    },
    {
      href: `/org/${orgToken}/intake`,
      label: "Ingresos",
      matchPrefix: `/org/${orgToken}/intake`,
      requiredCapability: "intake.create",
    },
    {
      href: `/org/${orgToken}/transitos`,
      label: "Tránsitos",
      matchPrefix: `/org/${orgToken}/transitos`,
    },
    {
      href: `/org/${orgToken}/voluntarios`,
      label: "Voluntarios",
      matchPrefix: `/org/${orgToken}/voluntarios`,
    },
    {
      href: `/org/${orgToken}/transferencias`,
      label: "Transferencias",
      matchPrefix: `/org/${orgToken}/transferencias`,
    },
    {
      href: `/org/${orgToken}/checkins`,
      label: "Check-ins",
      matchPrefix: `/org/${orgToken}/checkins`,
      requiredCapability: "adoption.review",
    },
    {
      href: `/org/${orgToken}/casos`,
      label: "Casos",
      matchPrefix: `/org/${orgToken}/casos`,
    },
    {
      href: `/org/${orgToken}/servicios`,
      label: "Servicios",
      matchPrefix: `/org/${orgToken}/servicios`,
    },
    {
      href: `/org/${orgToken}/adopciones`,
      label: "Operaciones",
      matchPrefix: `/org/${orgToken}/adopciones`,
    },
    {
      href: `/org/${orgToken}/miembros`,
      label: "Miembros",
      matchPrefix: `/org/${orgToken}/miembros`,
    },
    {
      href: `/org/${orgToken}/cobertura`,
      label: "Cobertura",
      matchPrefix: `/org/${orgToken}/cobertura`,
    },
    {
      href: `/org/${orgToken}/configuracion`,
      label: "Configuración",
      matchPrefix: `/org/${orgToken}/configuracion`,
    },
    {
      href: `/org/${orgToken}/maltrato/recibidos`,
      label: "Maltrato",
      matchPrefix: `/org/${orgToken}/maltrato`,
    },
    {
      // No index page under /mordedura — the report form is the entry point.
      href: `/org/${orgToken}/mordedura/nuevo`,
      label: "Mordeduras",
      matchPrefix: `/org/${orgToken}/mordedura`,
    },
    {
      href: `/org/${orgToken}/admin/permisos`,
      label: "Permisos",
      matchPrefix: `/org/${orgToken}/admin`,
      requiredCapability: "capability.grant",
    },
  ];

  return items
    .filter((item) => !item.requiredCapability || granted.has(item.requiredCapability))
    .map(({ requiredCapability: _requiredCapability, ...item }) => item);
}

// ---------------------------------------------------------------------------
// Gobierno (/gob)
// Preserves all top-level routes from app/gob/layout.tsx.
// ---------------------------------------------------------------------------

// Primary 7 match design spec (Panel · Cola · Vigilancia · Casos · Reglas · Catálogo · Histórico).
// Additional routes kept for completeness; sidebar renders all items but the spec's 7
// primaries are ordered first.
export const GOB_NAV: NavItem[] = [
  { href: "/gob", label: "Panel" },
  { href: "/gob/cola", label: "Cola", matchPrefix: "/gob/cola" },
  { href: "/gob/vigilancia", label: "Vigilancia", matchPrefix: "/gob/vigilancia" },
  { href: "/gob/casos", label: "Casos", matchPrefix: "/gob/casos" },
  { href: "/gob/reglas", label: "Reglas", matchPrefix: "/gob/reglas" },
  { href: "/gob/servicios", label: "Catálogo", matchPrefix: "/gob/servicios" },
  { href: "/gob/historial", label: "Histórico", matchPrefix: "/gob/historial" },
  { href: "/gob/analytics", label: "Analítica", matchPrefix: "/gob/analytics" },
  { href: "/gob/usuarios", label: "Usuarios", matchPrefix: "/gob/usuarios" },
  {
    href: "/gob/organizaciones",
    label: "Organizaciones",
    matchPrefix: "/gob/organizaciones",
  },
  { href: "/gob/perdidas", label: "Pérdidas", matchPrefix: "/gob/perdidas" },
  { href: "/gob/disputas", label: "Disputas", matchPrefix: "/gob/disputas" },
  { href: "/gob/maltrato", label: "Maltrato", matchPrefix: "/gob/maltrato" },
  { href: "/gob/decomisos", label: "Decomisos", matchPrefix: "/gob/decomisos" },
];

// ---------------------------------------------------------------------------
// Admin (/admin)
// Preserves all top-level routes from app/admin/layout.tsx.
// The outbox badge is rendered separately in the meta-strip (not via NavItem)
// because its value is async and context-dependent.
// ---------------------------------------------------------------------------

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/cola", label: "Cola", matchPrefix: "/admin/cola" },
  { href: "/admin/usuarios", label: "Usuarios", matchPrefix: "/admin/usuarios" },
  {
    href: "/admin/organizaciones",
    label: "Organizaciones",
    matchPrefix: "/admin/organizaciones",
  },
  { href: "/admin/historial", label: "Historial", matchPrefix: "/admin/historial" },
  { href: "/admin/auditoria", label: "Auditoría", matchPrefix: "/admin/auditoria" },
  { href: "/admin/outbox", label: "Outbox", matchPrefix: "/admin/outbox" },
  { href: "/admin/sistema", label: "Sistema", matchPrefix: "/admin/sistema" },
  { href: "/admin/govts", label: "Govts", matchPrefix: "/admin/govts" },
  { href: "/admin/admins", label: "Admins", matchPrefix: "/admin/admins" },
  { href: "/admin/servicios", label: "Servicios", matchPrefix: "/admin/servicios" },
  {
    href: "/admin/observaciones",
    label: "Observaciones",
    matchPrefix: "/admin/observaciones",
  },
  {
    href: "/admin/moderacion",
    label: "Moderación",
    matchPrefix: "/admin/moderacion",
  },
  { href: "/admin/casos", label: "Casos", matchPrefix: "/admin/casos" },
  {
    href: "/admin/jurisdicciones",
    label: "Jurisdicciones",
    matchPrefix: "/admin/jurisdicciones",
  },
];
