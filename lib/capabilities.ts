// Capability system for organization portals. See AGENTS.md → Organizations.
//
// Model: a user holds a membership in an organization (role + audit columns).
// Roles label who an employee is (admin, coordinator, foster, ...); capabilities
// (audit-tracked, admin-approved grants) gate what they can DO. Role=admin
// implicitly holds every capability — admins do not need explicit grants.
//
// Use `requireCapability` in server actions the same way `requireOwnedPet` is
// used in app/actions/events.ts.

import {
  ORGANIZATION_CAPABILITIES,
  type Organization,
  type OrganizationCapability,
  type OrganizationMembership,
  db,
  organizationCapabilityGrants,
  organizationMemberships,
  organizations,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";

export type CapabilityCatalogEntry = {
  capability: OrganizationCapability;
  label: string;
  description: string;
};

// User-facing copy for each capability. Spanish for in-product UI; English would
// duplicate the keys and add no value. Ordered roughly by lifecycle: read →
// intake → foster → adoption → transfer → admin.
export const CAPABILITY_CATALOG: readonly CapabilityCatalogEntry[] = [
  {
    capability: "pet.read_held",
    label: "Ver mascotas en custodia",
    description:
      "Acceder al listado de animales que la organización tiene en custodia, foster o adoptados.",
  },
  {
    capability: "intake.create",
    label: "Registrar ingreso (intake)",
    description:
      "Dar de alta animales que entran en custodia del refugio (rescate, decomiso, abandono, encontrado).",
  },
  {
    capability: "foster.assign",
    label: "Asignar tránsito (foster)",
    description: "Asignar un animal en custodia a un voluntario para tránsito hogareño.",
  },
  {
    capability: "foster.end",
    label: "Finalizar tránsito",
    description:
      "Cerrar una asignación de tránsito y devolver el animal a la custodia del refugio.",
  },
  {
    capability: "adoption.review",
    label: "Revisar solicitudes de adopción",
    description: "Ver, evaluar y aprobar o rechazar solicitudes de adopción.",
  },
  {
    capability: "adoption.finalize",
    label: "Finalizar adopciones",
    description:
      "Concretar una adopción: cerrar custodia, registrar al adoptante como nuevo dueño.",
  },
  {
    capability: "custody.transfer",
    label: "Transferir custodia",
    description:
      "Pasar la custodia de un animal a otra organización o persona, fuera del flujo de adopción.",
  },
  {
    capability: "event.write",
    label: "Registrar eventos clínicos",
    description:
      "Anotar vacunas, desparasitaciones, cirugías y otros eventos médicos en animales de la organización.",
  },
  {
    capability: "member.invite",
    label: "Invitar miembros",
    description: "Sumar nuevos voluntarios o empleados a la organización.",
  },
  {
    capability: "capability.grant",
    label: "Aprobar permisos",
    description:
      "Decidir sobre las solicitudes de capacidades del resto del equipo (lo que los admins hacen).",
  },
] as const;

const CAPABILITY_SET = new Set<string>(ORGANIZATION_CAPABILITIES);

export function isValidCapability(value: string): value is OrganizationCapability {
  return CAPABILITY_SET.has(value);
}

export type ActiveMembership = {
  membership: OrganizationMembership;
  organization: Organization;
};

// Returns all active memberships (left_at IS NULL) for a user joined with
// their organization. Ordered by most-recently-joined for a stable v1 default.
export async function getActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  const rows = await db
    .select({ membership: organizationMemberships, organization: organizations })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)))
    .orderBy(organizationMemberships.joinedAt);
  return rows;
}

// Capabilities currently granted on a membership. Admins implicitly hold all
// capabilities — they are NOT required to be granted explicitly. For all other
// roles, only `status='approved'` grants count.
export async function getGrantedCapabilities(
  membership: Pick<OrganizationMembership, "id" | "role">,
): Promise<Set<OrganizationCapability>> {
  if (membership.role === "admin") {
    return new Set<OrganizationCapability>(ORGANIZATION_CAPABILITIES);
  }
  const rows = await db
    .select({ capability: organizationCapabilityGrants.capability })
    .from(organizationCapabilityGrants)
    .where(
      and(
        eq(organizationCapabilityGrants.membershipId, membership.id),
        eq(organizationCapabilityGrants.status, "approved"),
      ),
    );
  const set = new Set<OrganizationCapability>();
  for (const row of rows) {
    if (isValidCapability(row.capability)) set.add(row.capability);
  }
  return set;
}

export type RequireCapabilitySuccess = {
  user: { id: string };
  membership: OrganizationMembership;
  organization: Organization;
  granted: Set<OrganizationCapability>;
  error: null;
};

export type RequireCapabilityFailure = {
  user: { id: string } | null;
  membership: null;
  organization: null;
  granted: null;
  error: string;
};

export type RequireCapabilityResult = RequireCapabilitySuccess | RequireCapabilityFailure;

// Server-action helper. Returns the active membership + organization for the
// authenticated user that holds `capability`. Mirrors `requireOwnedPet` in
// app/actions/events.ts. When `organizationId` is provided, only that org is
// considered; otherwise the most-recently-joined active membership is used
// (matches the v1 "first membership wins" UI default).
export async function requireCapability(
  capability: OrganizationCapability,
  organizationId?: string,
): Promise<RequireCapabilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      membership: null,
      organization: null,
      granted: null,
      error: "Sesión expirada.",
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const active = organizationId
    ? memberships.find((m) => m.organization.id === organizationId)
    : memberships[memberships.length - 1];
  if (!active) {
    return {
      user: { id: user.id },
      membership: null,
      organization: null,
      granted: null,
      error: "No pertenecés a ninguna organización activa.",
    };
  }

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has(capability)) {
    return {
      user: { id: user.id },
      membership: null,
      organization: null,
      granted: null,
      error: "No tenés permiso para esta acción. Pedile el alta a un administrador.",
    };
  }

  return {
    user: { id: user.id },
    membership: active.membership,
    organization: active.organization,
    granted,
    error: null,
  };
}
