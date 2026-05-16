"use server";

// Server actions for the organization-capability self-service flow.
//
// Two actions:
//   - requestCapabilityAction: an employee asks for a capability. Writes a
//     `pending` row in organization_capability_grants and fans out a
//     notification to every admin in the org.
//   - decideCapabilityAction: an admin (or anyone with the `capability.grant`
//     capability) approves, denies, or revokes a grant. Updates the row in
//     place and notifies the requester.
//
// Both actions enforce authorization explicitly via `getActiveMemberships` and
// `getGrantedCapabilities` because Drizzle bypasses RLS by design.

import {
  type OrganizationCapability,
  db,
  notifications,
  organizationCapabilityGrants,
  organizationMemberships,
  profiles,
} from "@/db";
import {
  getActiveMemberships,
  getGrantedCapabilities,
  isValidCapability,
} from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type CapabilityActionState = {
  error: string | null;
  ok?: boolean;
};

// Capability label lookup duplicated here to keep the actions file standalone
// from the UI catalog. Source of truth for the keys is ORGANIZATION_CAPABILITIES
// in db/schema.ts; this map only renders Spanish strings for notification copy.
const NOTIFICATION_LABELS: Record<OrganizationCapability, string> = {
  "pet.read_held": "Ver mascotas en custodia",
  "intake.create": "Registrar ingresos",
  "foster.assign": "Asignar tránsitos",
  "foster.end": "Finalizar tránsitos",
  "adoption.review": "Revisar adopciones",
  "adoption.finalize": "Finalizar adopciones",
  "custody.transfer": "Transferir custodia",
  "event.write": "Registrar eventos clínicos",
  "member.invite": "Invitar miembros",
  "capability.grant": "Aprobar permisos",
};

function labelFor(capability: OrganizationCapability): string {
  return NOTIFICATION_LABELS[capability] ?? capability;
}

// ---------------------------------------------------------------------------
// Request — employee asks for a capability
// ---------------------------------------------------------------------------

export async function requestCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const capabilityRaw = String(formData.get("capability") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;

  if (!capabilityRaw) return { error: "Falta indicar el permiso solicitado." };
  if (!isValidCapability(capabilityRaw)) return { error: "Permiso no reconocido." };
  const capability = capabilityRaw;

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return { error: "No pertenecés a ninguna organización activa." };

  // Admins implicitly hold every capability — they don't need to request.
  if (active.membership.role === "admin") {
    return { error: "Como administrador ya tenés todos los permisos." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organizationCapabilityGrants).values({
        membershipId: active.membership.id,
        organizationId: active.organization.id,
        capability,
        status: "pending",
        requestedReason: reason,
      });

      // Fan out to every admin in the org so they see it in their inbox.
      // We use role='admin' (and not `capability.grant`-bearers) for v1
      // because that's how the implicit-grant model is defined.
      const admins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, active.organization.id),
            eq(organizationMemberships.role, "admin"),
            isNull(organizationMemberships.leftAt),
          ),
        );

      if (admins.length > 0) {
        const [requester] = await tx
          .select({ displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);
        const requesterName = requester?.displayName ?? "Un miembro";
        await tx.insert(notifications).values(
          admins.map((admin) => ({
            userId: admin.userId,
            notificationType: "capability_request" as const,
            title: `Pedido de permiso: ${labelFor(capability)}`,
            body: `${requesterName} solicitó el permiso "${labelFor(capability)}" en ${active.organization.displayName}.`,
            severity: "info" as const,
            ctaLabel: "Revisar",
            ctaUrl: "/refugio/admin/permisos",
          })),
        );
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    // Unique partial index on (membership_id, capability) WHERE status IN
    // ('pending', 'approved') blocks duplicate open grants. Friendly message.
    if (message.includes("org_capability_grants_one_open_per_capability")) {
      return { error: "Ya tenés una solicitud pendiente o un permiso concedido para esto." };
    }
    return { error: `No se pudo registrar la solicitud: ${message}` };
  }

  revalidatePath("/refugio");
  revalidatePath("/refugio/admin/permisos");
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// Decide — admin approves, denies, or revokes
// ---------------------------------------------------------------------------

type Decision = "approved" | "denied" | "revoked";
const DECISION_VERBS: Record<Decision, { verb: string; severity: "success" | "warning" | "info" }> =
  {
    approved: { verb: "aprobado", severity: "success" },
    denied: { verb: "denegado", severity: "warning" },
    revoked: { verb: "revocado", severity: "warning" },
  };

function isDecision(value: string): value is Decision {
  return value === "approved" || value === "denied" || value === "revoked";
}

export async function decideCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const grantId = String(formData.get("grantId") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;

  if (!grantId) return { error: "Falta el identificador de la solicitud." };
  if (!isDecision(decisionRaw)) return { error: "Decisión no reconocida." };
  const decision = decisionRaw;

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return { error: "No pertenecés a ninguna organización activa." };

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has("capability.grant")) {
    return { error: "No tenés permiso para decidir solicitudes." };
  }

  const [grant] = await db
    .select({
      id: organizationCapabilityGrants.id,
      organizationId: organizationCapabilityGrants.organizationId,
      capability: organizationCapabilityGrants.capability,
      status: organizationCapabilityGrants.status,
      membershipId: organizationCapabilityGrants.membershipId,
    })
    .from(organizationCapabilityGrants)
    .where(eq(organizationCapabilityGrants.id, grantId))
    .limit(1);
  if (!grant) return { error: "Solicitud no encontrada." };
  if (grant.organizationId !== active.organization.id) {
    return { error: "Esa solicitud pertenece a otra organización." };
  }

  // State-machine guard. `pending` can become approved or denied; `approved`
  // can be revoked. Denied / revoked are terminal — re-asking creates a new
  // row (the unique partial index permits it).
  const valid =
    (grant.status === "pending" && (decision === "approved" || decision === "denied")) ||
    (grant.status === "approved" && decision === "revoked");
  if (!valid) {
    return { error: "La solicitud ya está en un estado terminal." };
  }

  if (!isValidCapability(grant.capability)) {
    return { error: "La solicitud apunta a un permiso desconocido." };
  }
  const capability = grant.capability;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(organizationCapabilityGrants)
        .set({
          status: decision,
          decidedAt: new Date(),
          decidedByUserId: user.id,
          decisionReason: reason,
        })
        .where(eq(organizationCapabilityGrants.id, grantId));

      const [requesterMembership] = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.id, grant.membershipId))
        .limit(1);

      if (requesterMembership) {
        const { verb, severity } = DECISION_VERBS[decision];
        await tx.insert(notifications).values({
          userId: requesterMembership.userId,
          notificationType: `capability_${decision}`,
          title: `Permiso ${verb}: ${labelFor(capability)}`,
          body: reason
            ? `Tu solicitud para "${labelFor(capability)}" en ${active.organization.displayName} fue ${verb}. Motivo: ${reason}`
            : `Tu solicitud para "${labelFor(capability)}" en ${active.organization.displayName} fue ${verb}.`,
          severity,
          ctaLabel: "Ver panel",
          ctaUrl: "/refugio",
        });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    if (message.includes("org_capability_grants_one_open_per_capability")) {
      // Race: another admin already approved the same capability for this
      // membership before our update landed.
      return { error: "Otro permiso ya está activo para este miembro." };
    }
    return { error: `No se pudo actualizar la solicitud: ${message}` };
  }

  revalidatePath("/refugio");
  revalidatePath("/refugio/admin/permisos");
  return { error: null, ok: true };
}
