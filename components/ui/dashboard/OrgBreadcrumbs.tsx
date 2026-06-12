"use client";

// Dynamic breadcrumb for the org portal topbar.
// Reads the current pathname to reflect the active section instead of
// always showing the static "Panel" label.

import { usePathname } from "next/navigation";
import { OpCrumbs } from "./OpCrumbs";

const SEGMENT_LABELS: Record<string, string> = {
  agenda: "Agenda",
  mascotas: "Mascotas",
  intake: "Ingresos",
  transitos: "Tránsitos",
  voluntarios: "Voluntarios",
  transferencias: "Transferencias",
  checkins: "Check-ins",
  casos: "Casos",
  servicios: "Servicios",
  // "Operaciones" matches the nav-rail label for this section (nav-presets.ts),
  // which groups adoption operations under that name.
  adopciones: "Operaciones",
  miembros: "Miembros",
  cobertura: "Cobertura",
  configuracion: "Configuración",
  mordedura: "Mordeduras",
  maltrato: "Bienestar",
  pets: "Mascotas",
  admin: "Admin",
};

type Props = {
  orgToken: string;
};

export function OrgBreadcrumbs({ orgToken }: Props) {
  const pathname = usePathname();
  // Extract the segment after /org/[orgToken]/
  const base = `/org/${orgToken}/`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const firstSegment = rest.split("/")[0] ?? "";
  const sectionLabel = SEGMENT_LABELS[firstSegment] ?? "Panel";

  const crumbs =
    sectionLabel === "Panel"
      ? [{ label: "Panel" }]
      : [{ label: "Panel", href: `/org/${orgToken}` }, { label: sectionLabel }];

  return <OpCrumbs items={crumbs} />;
}
