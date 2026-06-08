// Use-case: decide (approve / deny / revoke) a capability grant request.
//
// Auth handled by caller: Supabase session + getActiveMemberships[length-1] +
// getGrantedCapabilities. Caller passes the resolved `active` context and `granted` set.

import { isValidCapability } from "@/src/modules/organizations/domain/capabilities";
import { canDecide } from "@/src/modules/organizations/domain/membership-state";
import type {
  Exec,
  OrgRepository,
} from "@/src/modules/organizations/infrastructure/org-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Repo interface
// ---------------------------------------------------------------------------

export interface DecideCapabilityRepo {
  findGrant: OrgRepository["findGrant"];
  updateGrant: OrgRepository["updateGrant"];
  findGrantMemberUserId: OrgRepository["findGrantMemberUserId"];
}

// ---------------------------------------------------------------------------
// Input / Deps
// ---------------------------------------------------------------------------

type Decision = "approved" | "denied" | "revoked";

type ActiveOrgContext = {
  organization: {
    id: string;
    displayName: string;
    publicToken: string;
  };
  membership: {
    id: string;
    role: string;
    organizationId: string;
  };
};

export type DecideCapabilityInput = {
  deciderId: string;
  grantId: string;
  decision: Decision;
  reason: string | null;
  active: ActiveOrgContext;
  granted: Set<string>;
};

type Deps = {
  repo: DecideCapabilityRepo;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  isUniqueViolation: (err: unknown) => boolean;
};

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

const NOTIFICATION_LABELS: Record<string, string> = {
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
  "service_offering.create": "Publicar servicios",
  "appointment.manage": "Gestionar turnos",
  "bite.report": "Reportar mordeduras",
  "adoption.listing.manage": "Publicar adopciones",
  "org.transfer.propose": "Proponer transferencias entre orgs",
  "org.transfer.accept": "Aceptar transferencias entre orgs",
};

function labelFor(capability: string): string {
  return NOTIFICATION_LABELS[capability] ?? capability;
}

const DECISION_VERBS: Record<Decision, { verb: string; severity: "success" | "warning" | "info" }> =
  {
    approved: { verb: "aprobado", severity: "success" },
    denied: { verb: "denegado", severity: "warning" },
    revoked: { verb: "revocado", severity: "warning" },
  };

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function decideCapability(
  input: DecideCapabilityInput,
  deps: Deps,
): Promise<UseCaseResult<Record<never, never>>> {
  const { repo, transaction, isUniqueViolation } = deps;

  // Check actor has capability.grant permission.
  if (!input.granted.has("capability.grant")) {
    return { ok: false, error: "No tenés permiso para decidir solicitudes." };
  }

  // Load the grant.
  const grant = await repo.findGrant(input.grantId);
  if (!grant) {
    return { ok: false, error: "Solicitud no encontrada." };
  }

  // Auth scope guard — prevent cross-org decisions.
  if (grant.organizationId !== input.active.organization.id) {
    return { ok: false, error: "Esa solicitud pertenece a otra organización." };
  }

  // State machine guard.
  if (!canDecide(grant.status as "pending" | "approved" | "denied" | "revoked", input.decision)) {
    return { ok: false, error: "La solicitud ya está en un estado terminal." };
  }

  // Validate capability still exists in catalog.
  if (!isValidCapability(grant.capability)) {
    return { ok: false, error: "La solicitud apunta a un permiso desconocido." };
  }

  const capability = grant.capability;
  const pendingNotifications: NewNotification[] = [];

  try {
    await transaction(async (tx) => {
      const e = tx as Exec;

      await repo.updateGrant(
        input.grantId,
        {
          status: input.decision,
          decidedAt: new Date(),
          decidedByUserId: input.deciderId,
          decisionReason: input.reason,
        },
        e,
      );

      // Notify requester.
      const requesterUserId = await repo.findGrantMemberUserId(grant.membershipId, e);
      if (requesterUserId) {
        const { verb, severity } = DECISION_VERBS[input.decision];
        pendingNotifications.push({
          userId: requesterUserId,
          notificationType: `capability_${input.decision}`,
          title: `Permiso ${verb}: ${labelFor(capability)}`,
          body: input.reason
            ? `Tu solicitud para "${labelFor(capability)}" en ${input.active.organization.displayName} fue ${verb}. Motivo: ${input.reason}`
            : `Tu solicitud para "${labelFor(capability)}" en ${input.active.organization.displayName} fue ${verb}.`,
          severity,
          ctaLabel: "Ver panel",
          ctaUrl: `/org/${input.active.organization.publicToken}`,
        });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Otro permiso ya está activo para este miembro." };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo actualizar la solicitud.",
    };
  }

  return { ok: true, value: {}, notifications: pendingNotifications };
}
