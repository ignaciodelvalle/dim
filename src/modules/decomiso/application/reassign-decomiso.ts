// Use-case: reassignDecomisoToAnotherReceiver — govt reassigns to a new refugio.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §5.3
//
// Auth (requireDecomisoPrincipal + jurisdiction guard) is handled by the caller.
//
// Transaction steps:
//   1. Emit note_added(category='system') documenting the superseded proposal.
//   2. Emit a new custody_transfer_proposed toward the new receiver.
//   3. Update case's receiverOrganizationId to the new receiver.
//   4. Notify the new receiver (decomiso_handoff_proposed_receiver).
//   5. Audit log: decomiso_handoff_cancelled.

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  auditLog,
  cases,
  type db,
  organizationMemberships,
  organizations,
  petEvents,
  pets,
} from "@/db";
import type { Case } from "@/db/schema";
import { validateEventPayload } from "@/lib/events/event-schemas";

import { validateReceiverOrg } from "../domain/seizure-rules";
import type { GovtOrg, NewNotification, ReceiverOrg } from "../domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReassignDecomisoInput = {
  casePublicCode: string;
  newReceiverOrgId: string;
  reason?: string | null;
};

export type ReassignDecomisoContext = {
  user: { id: string };
  govtOrg: GovtOrg;
};

type ValidateReassignOk = {
  ok: true;
  caseRow: Case;
  /** Pre-validated new receiver org (guaranteed shelter/rescue_network, active, verified). */
  newReceiverOrg: ReceiverOrg & { id: string; displayName: string };
  petName: string;
  reassignReason: string;
};

type ValidateReassignErr = { ok: false; error: string };

// ---------------------------------------------------------------------------
// Pre-tx validation (runs before opening the transaction)
// ---------------------------------------------------------------------------
// Moved verbatim from app/actions/decomiso.ts (strangler follow-up): case
// load + open-episode checks, opener-org authorization, new-receiver rules,
// and pet-name resolution for notification copy. Auth and govt-org resolution
// stay in the actions controller.

export async function validateReassignDecomiso(
  input: ReassignDecomisoInput,
  ctx: { govtOrg: GovtOrg },
  dbInstance: typeof db,
): Promise<ValidateReassignOk | ValidateReassignErr> {
  const { govtOrg } = ctx;

  // Load + validate the custody_episode case.
  const [caseRow] = await dbInstance
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { ok: false, error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_episode") {
    return { ok: false, error: "Este caso no es un episodio de custodia." };
  }
  if (caseRow.status !== "open") {
    return { ok: false, error: "Este caso ya no está abierto." };
  }
  if (!caseRow.primaryPetId) {
    return { ok: false, error: "Caso sin mascota asociada." };
  }

  // Must be the opening govt org.
  if (caseRow.openedByOrganizationId !== govtOrg.id) {
    return { ok: false, error: "Solo la autoridad que abrió el decomiso puede reasignarlo." };
  }

  // Validate new receiver org.
  if (!input.newReceiverOrgId?.trim()) {
    return { ok: false, error: "Debe seleccionar un nuevo refugio destinatario." };
  }
  if (input.newReceiverOrgId === govtOrg.id) {
    return {
      ok: false,
      error: "El nuevo destinatario no puede ser la propia autoridad sanitaria.",
    };
  }
  if (input.newReceiverOrgId === caseRow.receiverOrganizationId) {
    return { ok: false, error: "El nuevo destinatario es el mismo que el actual." };
  }

  const [newReceiverOrg] = await dbInstance
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      verified: organizations.verified,
      status: organizations.status,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.newReceiverOrgId))
    .limit(1);

  const receiverErr = validateReceiverOrg(newReceiverOrg, govtOrg.id);
  if (receiverErr) {
    // Adjust error message for reassign context.
    return {
      ok: false,
      error: receiverErr.replace(
        "La organización destinataria debe ser un refugio",
        "El nuevo destinatario debe ser un refugio",
      ),
    };
  }
  // newReceiverOrg is guaranteed non-null here (validateReceiverOrg returns error if null).
  const validatedNewReceiverOrg = newReceiverOrg as NonNullable<typeof newReceiverOrg>;

  // Load pet name for notification copy.
  const [pet] = await dbInstance
    .select({ id: pets.id, name: pets.name })
    .from(pets)
    .where(eq(pets.id, caseRow.primaryPetId as string))
    .limit(1);

  const petName = pet?.name ?? "el animal";
  const reassignReason = input.reason?.trim() || "Reasignado por la autoridad sanitaria";

  return {
    ok: true,
    caseRow,
    newReceiverOrg: validatedNewReceiverOrg,
    petName,
    reassignReason,
  };
}

// ---------------------------------------------------------------------------
// In-tx body
// ---------------------------------------------------------------------------

type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function reassignDecomisoInTx(
  caseRow: {
    id: string;
    primaryPetId: string | null;
    publicCode: string;
    receiverOrganizationId: string | null;
  },
  newReceiverOrg: ReceiverOrg & { id: string; displayName: string },
  petName: string,
  reassignReason: string,
  ctx: ReassignDecomisoContext,
  tx: TxType,
): Promise<{ ok: true; pendingNotifications: NewNotification[] }> {
  const now = new Date();
  const pendingNotifications: NewNotification[] = [];

  // 5. Emit note_added documenting the supersession.
  const cancelNotePayload = validateEventPayload("note_added", {
    category: "system" as const,
    text: `Propuesta anterior cancelada por reasignación. Nuevo destinatario: ${newReceiverOrg.displayName}. Motivo: ${reassignReason}`,
  });
  await tx.insert(petEvents).values({
    petId: caseRow.primaryPetId as string,
    eventType: "note_added",
    occurredAt: now,
    recordedAt: now,
    recordedByUserId: ctx.user.id,
    authorRole: "govt",
    authorOrganizationId: ctx.govtOrg.id,
    authorVerified: true,
    payload: cancelNotePayload,
    caseId: caseRow.id,
  });

  // 6. Emit new custody_transfer_proposed toward the new receiver.
  const newProposalPayload = validateEventPayload("custody_transfer_proposed", {
    from_user_id: null,
    from_organization_id: ctx.govtOrg.id,
    to_user_id: null,
    to_organization_id: newReceiverOrg.id,
    reason: "other" as const,
    matched_against_pet_id: null,
    proposed_at: now.toISOString(),
    notes: `from_decomiso=true reassignment=true case=${caseRow.publicCode}`,
  });
  await tx.insert(petEvents).values({
    petId: caseRow.primaryPetId as string,
    eventType: "custody_transfer_proposed",
    occurredAt: now,
    recordedAt: now,
    recordedByUserId: ctx.user.id,
    authorRole: "govt",
    authorOrganizationId: ctx.govtOrg.id,
    authorVerified: true,
    payload: newProposalPayload,
    caseId: caseRow.id,
  });

  // 7. Update case's receiverOrganizationId.
  await tx
    .update(cases)
    .set({ receiverOrganizationId: newReceiverOrg.id, updatedAt: now })
    .where(eq(cases.id, caseRow.id));

  // 8. Notify new receiver coordinators.
  const newReceiverCoords = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, newReceiverOrg.id),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    );
  for (const coord of newReceiverCoords) {
    pendingNotifications.push({
      userId: coord.userId,
      notificationType: "decomiso_handoff_proposed_receiver",
      severity: "urgent",
      title: `Decomiso reasignado — ${petName}`,
      body: `La autoridad ${ctx.govtOrg.displayName} reasignó el decomiso de ${petName} a tu organización. Tenés 7 días para aceptar o rechazar.`,
      ctaLabel: "Ver propuesta",
      ctaUrl: `/casos/${caseRow.publicCode}`,
      relatedCaseId: caseRow.id,
      relatedPetId: caseRow.primaryPetId,
    });
  }

  // 9. Audit log.
  await tx.insert(auditLog).values({
    actorUserId: ctx.user.id,
    action: "decomiso_handoff_cancelled",
    payload: {
      case_id: caseRow.id,
      case_public_code: caseRow.publicCode,
      pet_id: caseRow.primaryPetId,
      govt_org_id: ctx.govtOrg.id,
      previous_receiver_org_id: caseRow.receiverOrganizationId ?? null,
      new_receiver_org_id: newReceiverOrg.id,
      reason: reassignReason,
    },
  });

  return { ok: true, pendingNotifications };
}
