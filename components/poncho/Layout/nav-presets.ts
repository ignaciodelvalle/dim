// Role-specific nav presets for AppHeader.
// Pure module — no side effects, no React, no async.

import type { NavItem } from "./HeaderNav";

// ---------------------------------------------------------------------------
// Owner portal
// ---------------------------------------------------------------------------

export const OWNER_NAV: NavItem[] = [
  { href: "/inicio", label: "Inicio", matchPrefix: "/inicio" },
  { href: "/mis-mascotas", label: "Mascotas", matchPrefix: "/mis-mascotas" },
  { href: "/mis-turnos", label: "Turnos", matchPrefix: "/mis-turnos" },
  { href: "/notificaciones", label: "Avisos", matchPrefix: "/notificaciones" },
  { href: "/cuenta", label: "Yo", matchPrefix: "/cuenta" },
];

// ---------------------------------------------------------------------------
// Org portal
// ---------------------------------------------------------------------------

export function buildOrgNav(orgToken: string): NavItem[] {
  return [
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
      href: `/org/${orgToken}/servicios`,
      label: "Servicios",
      matchPrefix: `/org/${orgToken}/servicios`,
    },
    {
      href: `/org/${orgToken}/equipo`,
      label: "Equipo",
      matchPrefix: `/org/${orgToken}/equipo`,
    },
    {
      href: `/org/${orgToken}/adopciones`,
      label: "Adopciones",
      matchPrefix: `/org/${orgToken}/adopciones`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Gobierno (/gob)
// Preserves all top-level routes from app/gob/layout.tsx.
// ---------------------------------------------------------------------------

export const GOB_NAV: NavItem[] = [
  { href: "/gob", label: "Dashboard" },
  { href: "/gob/cola", label: "Cola", matchPrefix: "/gob/cola" },
  { href: "/gob/usuarios", label: "Usuarios", matchPrefix: "/gob/usuarios" },
  {
    href: "/gob/organizaciones",
    label: "Organizaciones",
    matchPrefix: "/gob/organizaciones",
  },
  { href: "/gob/servicios", label: "Servicios", matchPrefix: "/gob/servicios" },
  { href: "/gob/vigilancia", label: "Vigilancia", matchPrefix: "/gob/vigilancia" },
  { href: "/gob/perdidas", label: "Pérdidas", matchPrefix: "/gob/perdidas" },
  { href: "/gob/disputas", label: "Disputas", matchPrefix: "/gob/disputas" },
  { href: "/gob/maltrato", label: "Maltrato", matchPrefix: "/gob/maltrato" },
  { href: "/gob/casos", label: "Casos", matchPrefix: "/gob/casos" },
  { href: "/gob/historial", label: "Historial", matchPrefix: "/gob/historial" },
  { href: "/gob/reglas", label: "Reglas", matchPrefix: "/gob/reglas" },
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
