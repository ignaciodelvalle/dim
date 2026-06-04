"use server";

// Cross-org transfer handshake (spec 2026-05-19-cross-org-transfer-ux).
// Two-phase: sender proposes → receiver accepts / rejects / sender
// cancels / cron auto-expires at 30 days.
//
// Wraps the existing `custody_transfer_proposed` + `custody_transferred`
// events under a `custody_transfer_handshake` case so the pair (and any
// rejection / cancellation notes) is grouped, expirable, and auditable.
//
// Single-phase legacy transfers (no handshake) live in
// app/actions/transfer.ts and are NOT deprecated by this flow — they
// cover non-cross-org scenarios (org closing instant handoff, etc.).
// The cross-org flow is opt-in via the dedicated /org/.../transferencias UI.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  auditLog,
  cases,
  custodyDisputes,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { closeCase, findOpenCaseForPetAndKind, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";

const ALLOWED_REASONS = new Set([
  "space_constraint",
  "specialization_needed",
  "network_redistribution",
  "shelter_closing",
  "post_adoption_failed_return",
  "other",
]);

export type CrossOrgTransferResult = { ok: true; publicCode: string } | { error: string };

// ---------------------------------------------------------------------------
// proposeCrossOrgTransferAction (sender)
// ---------------------------------------------------------------------------

export interface ProposeInput {
  senderOrgToken: string;
  petPublicToken: string;
  receiverOrgId: string;
  reason: string;
  notes?: string | null;
}

export async function proposeCrossOrgTransferAction(
  input: ProposeInput,
): Promise<CrossOrgTransferResult> {
  const auth = await requireCapability("org.transfer.propose");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.senderOrgToken) {
    return { error: "Estás operando desde una organización distinta a la sender." };
  }
  if (!ALLOWED_REASONS.has(input.reason)) {
    return { error: "Motivo de transferencia inválido." };
  }
  const notes = input.notes?.trim() || null;
  if (input.reason === "other" && !notes) {
    return { error: "El motivo 'other' requiere una nota explicativa." };
  }

  // Pet must exist + sender must hold active shelter_custody on it.
  const [pet] = await db
    .select()
    .from(pets)
    .where(eq(pets.publicToken, input.petPublicToken))
    .limit(1);
  if (!pet) return { error: "Mascota no encontrada." };

  const [senderCustody] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!senderCustody) {
    return {
      error: "Tu organización no tiene custodia activa sobre esta mascota.",
    };
  }

  // Cannot propose if sender == receiver.
  if (input.receiverOrgId === organization.id) {
    return { error: "El destinatario no puede ser tu propia organización." };
  }

  // Receiver must be a verified active organization.
  const [receiver] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      verified: organizations.verified,
      status: organizations.status,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.receiverOrgId))
    .limit(1);
  if (!receiver) return { error: "Organización destinataria no encontrada." };
  if (!receiver.verified || receiver.status !== "active") {
    return { error: "La organización destinataria no está verificada activa." };
  }

  // Cross-spec guards: NO open handshake on this pet, NO open
  // custody_dispute. (Bite incident scheduled is allowed — vet would
  // continue care under the new org.)
  const [openHandshake] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "custody_transfer_handshake"),
        inArray(cases.status, ["open", "escalated"]),
      ),
    )
    .limit(1);
  if (openHandshake) {
    return { error: "Ya hay una propuesta de transferencia pendiente para esta mascota." };
  }
  const [openDispute] = await db
    .select({ id: custodyDisputes.id })
    .from(custodyDisputes)
    .where(and(eq(custodyDisputes.petId, pet.id), eq(custodyDisputes.status, "open")))
    .limit(1);
  if (openDispute) {
    return { error: "No podés transferir una mascota con disputa de custodia abierta." };
  }

  let createdPublicCode = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const caseRow = await openCase(
        {
          kind: "custody_transfer_handshake",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          receiverOrganizationId: receiver.id,
          openedReason: `auto: cross-org transfer proposed reason=${input.reason}`,
        },
        tx,
      );
      createdPublicCode = caseRow.publicCode;

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: organization.id,
        to_user_id: null,
        to_organization_id: receiver.id,
        reason: input.reason,
        notes,
        matched_against_pet_id: null,
        proposed_at: new Date().toISOString(),
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transfer_proposed",
        occurredAt: new Date(),
        recordedAt: new Date(),
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload,
        caseId: caseRow.id,
      });

      // Notify receiver coordinators + admin.
      const recipients = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, receiver.id),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const r of recipients) {
        pendingNotifications.push({
          userId: r.userId,
          notificationType: "cross_org_transfer_proposed_receiver" as const,
          severity: "info" as const,
          title: `Propuesta de transferencia entrante para ${pet.name}`,
          body: `${organization.displayName} propone transferirte la custodia de ${pet.name}. Tenés 30 días para aceptar o rechazar.`,
          ctaLabel: "Ver propuesta",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: pet.id,
        });
      }
      // Confirmation to sender user.
      pendingNotifications.push({
        userId: user.id,
        notificationType: "cross_org_transfer_proposed_sender" as const,
        severity: "info" as const,
        title: `Propuesta enviada para ${pet.name}`,
        body: `${receiver.displayName} fue notificada. Tenés 30 días antes de auto-expirar.`,
        ctaLabel: "Ver propuesta",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
        relatedPetId: pet.id,
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "cross_org_transfer_proposed",
        payload: {
          case_id: caseRow.id,
          pet_id: pet.id,
          sender_org_id: organization.id,
          receiver_org_id: receiver.id,
          reason: input.reason,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo proponer la transferencia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (proposeCrossOrgTransferAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${input.senderOrgToken}/transferencias`);
  return { ok: true, publicCode: createdPublicCode };
}

// ---------------------------------------------------------------------------
// acceptCrossOrgTransferAction (receiver)
// ---------------------------------------------------------------------------

export async function acceptCrossOrgTransferAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
}): Promise<CrossOrgTransferResult> {
  const auth = await requireCapability("org.transfer.accept");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la receiver." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_transfer_handshake") {
    return { error: "Este caso no es un handshake de transferencia." };
  }
  if (caseRow.status !== "open") {
    return { error: "Este caso ya no está abierto." };
  }
  if (!caseRow.primaryPetId) {
    return { error: "Caso sin mascota asociada." };
  }

  // Resolve the canonical proposal event for this case (review 2026-05-19
  // §2.4). The handshake-uniqueness check at proposeCrossOrgTransferAction
  // guarantees only one `open|escalated` `custody_transfer_handshake` case
  // exists per pet at a time, and openCase emits exactly one
  // `custody_transfer_proposed` event per case. We pick the LATEST proposal
  // event for the case as a defense-in-depth measure (deterministic even if
  // a future bug somehow emits two), and we fail loudly if more than one
  // exists so the inconsistency surfaces instead of silently authorizing the
  // wrong receiver.
  const proposalEvents = await db
    .select()
    .from(petEvents)
    .where(
      and(eq(petEvents.caseId, caseRow.id), eq(petEvents.eventType, "custody_transfer_proposed")),
    )
    .orderBy(desc(petEvents.recordedAt))
    .limit(2);
  const [proposalEvent, shadowProposalEvent] = proposalEvents;
  if (!proposalEvent) return { error: "Propuesta original no encontrada." };
  if (shadowProposalEvent) {
    console.error(
      `cross-org-transfer integrity: case ${caseRow.id} has multiple custody_transfer_proposed events; refusing to accept until reconciled`,
    );
    return {
      error:
        "El caso tiene propuestas duplicadas. Avisanos para reconciliarlo antes de aceptar la transferencia.",
    };
  }
  const proposalPayload = proposalEvent.payload as {
    from_organization_id?: string;
    to_organization_id?: string;
    reason?: string;
  };
  // The case row's `openedByOrganizationId` is the canonical sender (set at
  // openCase time, not from event payload). Cross-check it against the
  // payload to catch any drift between case state and the event timeline.
  const senderOrgId = caseRow.openedByOrganizationId ?? proposalPayload.from_organization_id;
  if (!senderOrgId) return { error: "Propuesta sin organización emisora." };
  if (
    caseRow.openedByOrganizationId &&
    proposalPayload.from_organization_id &&
    caseRow.openedByOrganizationId !== proposalPayload.from_organization_id
  ) {
    console.error(
      `cross-org-transfer integrity: case ${caseRow.id} openedByOrganizationId (${caseRow.openedByOrganizationId}) does not match proposal payload from_organization_id (${proposalPayload.from_organization_id})`,
    );
    return {
      error:
        "Inconsistencia entre el caso y la propuesta. Avisanos para reconciliarlo antes de aceptar la transferencia.",
    };
  }
  // Receiver authorization: prefer the canonical column on `cases`
  // (migration 0043). Fall back to the proposal payload only when the
  // column is null (legacy rows pre-backfill). When both are present we
  // require them to agree — drift here means the case state and the
  // event timeline disagree about who's allowed to accept.
  const canonicalReceiverOrgId =
    caseRow.receiverOrganizationId ?? proposalPayload.to_organization_id;
  if (!canonicalReceiverOrgId) {
    return { error: "Propuesta sin organización destinataria." };
  }
  if (
    caseRow.receiverOrganizationId &&
    proposalPayload.to_organization_id &&
    caseRow.receiverOrganizationId !== proposalPayload.to_organization_id
  ) {
    console.error(
      `cross-org-transfer integrity: case ${caseRow.id} receiverOrganizationId (${caseRow.receiverOrganizationId}) does not match proposal payload to_organization_id (${proposalPayload.to_organization_id})`,
    );
    return {
      error:
        "Inconsistencia entre el caso y la propuesta. Avisanos para reconciliarlo antes de aceptar la transferencia.",
    };
  }
  if (canonicalReceiverOrgId !== organization.id) {
    return { error: "La propuesta no fue dirigida a tu organización." };
  }

  // custody_episode terminal (custody_transferred → cross-org handshake path).
  // Null when the pet was never intaked — that's normal; skip the close.
  const custodyCase = await findOpenCaseForPetAndKind(caseRow.primaryPetId, "custody_episode");

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      const transferPayload = validateEventPayload("custody_transferred", {
        from_user_id: null,
        from_organization_id: senderOrgId,
        to_user_id: null,
        to_organization_id: organization.id,
        from_role: "shelter_custody",
        to_role: "shelter_custody",
        reason: proposalPayload.reason ?? "org_to_org_handoff",
        matched_against_pet_id: null,
        foster_ended_event_id: null,
        notes: null,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "custody_transferred",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: transferPayload,
        caseId: caseRow.id,
      });

      // End sender's shelter_custody row.
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(
          and(
            eq(ownerships.petId, caseRow.primaryPetId as string),
            eq(ownerships.ownerOrganizationId, senderOrgId),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        );

      // Insert receiver's shelter_custody row.
      await tx.insert(ownerships).values({
        petId: caseRow.primaryPetId as string,
        ownerOrganizationId: organization.id,
        role: "shelter_custody",
        startedAt: now,
      });

      // Close the handshake case.
      await closeCase({ caseId: caseRow.id, reason: "resolved", closedByUserId: user.id }, tx);

      // Close the custody_episode case if one was open (animal was intaked).
      if (custodyCase) {
        await closeCase(
          { caseId: custodyCase.id, reason: "resolved", closedByUserId: user.id },
          tx,
        );
      }

      // Notify sender coordinators of the success.
      const senderCoords = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, senderOrgId),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const r of senderCoords) {
        pendingNotifications.push({
          userId: r.userId,
          notificationType: "cross_org_transfer_accepted_sender" as const,
          severity: "success" as const,
          title: "Tu transferencia fue aceptada",
          body: `${organization.displayName} recibió la custodia. La transferencia está completa.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      pendingNotifications.push({
        userId: user.id,
        notificationType: "cross_org_transfer_accepted_receiver" as const,
        severity: "success" as const,
        title: "Transferencia confirmada",
        body: `La pet pasó formalmente a custodia de ${organization.displayName}.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
        relatedPetId: caseRow.primaryPetId,
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "cross_org_transfer_accepted",
        payload: {
          case_id: caseRow.id,
          pet_id: caseRow.primaryPetId,
          sender_org_id: senderOrgId,
          receiver_org_id: organization.id,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo aceptar la transferencia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (acceptCrossOrgTransferAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${input.receiverOrgToken}/transferencias/recibidas`);
  return { ok: true, publicCode: caseRow.publicCode };
}

// ---------------------------------------------------------------------------
// rejectCrossOrgTransferAction (receiver)
// ---------------------------------------------------------------------------

export async function rejectCrossOrgTransferAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
  reason?: string | null;
  message?: string | null;
}): Promise<CrossOrgTransferResult> {
  const auth = await requireCapability("org.transfer.accept");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la receiver." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.status !== "open") return { error: "Este caso ya no está abierto." };

  // Authorization: only the canonical receiver org can reject. The
  // column is the source of truth (migration 0043); when it's null
  // (legacy row pre-backfill) we fall back to the payload.
  const [proposalEvent] = await db
    .select()
    .from(petEvents)
    .where(
      and(eq(petEvents.caseId, caseRow.id), eq(petEvents.eventType, "custody_transfer_proposed")),
    )
    .limit(1);
  if (!proposalEvent) return { error: "Propuesta original no encontrada." };
  const proposalPayload = proposalEvent.payload as {
    from_organization_id?: string;
    to_organization_id?: string;
  };
  const senderOrgId = caseRow.openedByOrganizationId ?? proposalPayload.from_organization_id;
  if (!senderOrgId) return { error: "Propuesta sin organización emisora." };
  const canonicalReceiverOrgId =
    caseRow.receiverOrganizationId ?? proposalPayload.to_organization_id;
  if (canonicalReceiverOrgId && canonicalReceiverOrgId !== organization.id) {
    return { error: "La propuesta no fue dirigida a tu organización." };
  }

  const reasonNote =
    [input.reason, input.message?.trim()].filter(Boolean).join(" — ") ||
    "Rechazada sin motivo especificado";

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const notePayload = validateEventPayload("note_added", {
        category: "system",
        text: `Rechazada por el receptor: ${reasonNote}`,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: notePayload,
        caseId: caseRow.id,
      });

      await closeCase({ caseId: caseRow.id, reason: "cancelled", closedByUserId: user.id }, tx);

      const senderCoords = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, senderOrgId),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const r of senderCoords) {
        pendingNotifications.push({
          userId: r.userId,
          notificationType: "cross_org_transfer_rejected_sender" as const,
          severity: "info" as const,
          title: "Tu propuesta de transferencia fue rechazada",
          body: `${organization.displayName} rechazó la propuesta. Motivo: ${reasonNote}`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "cross_org_transfer_rejected",
        payload: {
          case_id: caseRow.id,
          pet_id: caseRow.primaryPetId,
          sender_org_id: senderOrgId,
          receiver_org_id: organization.id,
          reason: input.reason ?? null,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo rechazar la transferencia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (rejectCrossOrgTransferAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${input.receiverOrgToken}/transferencias/recibidas`);
  return { ok: true, publicCode: caseRow.publicCode };
}

// ---------------------------------------------------------------------------
// cancelCrossOrgTransferAction (sender)
// ---------------------------------------------------------------------------

export async function cancelCrossOrgTransferAction(input: {
  senderOrgToken: string;
  casePublicCode: string;
  reason?: string | null;
  message?: string | null;
}): Promise<CrossOrgTransferResult> {
  const auth = await requireCapability("org.transfer.propose");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.senderOrgToken) {
    return { error: "Estás operando desde una organización distinta a la sender." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.status !== "open") return { error: "Este caso ya no está abierto." };
  if (caseRow.openedByOrganizationId !== organization.id) {
    return { error: "Solo la organización que propuso puede cancelar." };
  }

  // Receiver id for notification: prefer the canonical column.
  let receiverOrgId: string | null | undefined = caseRow.receiverOrganizationId;
  if (!receiverOrgId) {
    const [proposalEvent] = await db
      .select()
      .from(petEvents)
      .where(
        and(eq(petEvents.caseId, caseRow.id), eq(petEvents.eventType, "custody_transfer_proposed")),
      )
      .limit(1);
    receiverOrgId =
      proposalEvent &&
      (proposalEvent.payload as { to_organization_id?: string }).to_organization_id;
  }

  const reasonNote =
    [input.reason, input.message?.trim()].filter(Boolean).join(" — ") ||
    "Cancelada por la organización emisora";

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const notePayload = validateEventPayload("note_added", {
        category: "system",
        text: `Cancelada por el sender: ${reasonNote}`,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: notePayload,
        caseId: caseRow.id,
      });

      await closeCase({ caseId: caseRow.id, reason: "cancelled", closedByUserId: user.id }, tx);

      if (receiverOrgId) {
        const receiverCoords = await tx
          .select({ userId: organizationMemberships.userId })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, receiverOrgId),
              inArray(organizationMemberships.role, ["admin", "coordinator"]),
              isNull(organizationMemberships.leftAt),
            ),
          );
        for (const r of receiverCoords) {
          pendingNotifications.push({
            userId: r.userId,
            notificationType: "cross_org_transfer_cancelled_receiver" as const,
            severity: "info" as const,
            title: "Propuesta de transferencia cancelada",
            body: `${organization.displayName} canceló la propuesta. Motivo: ${reasonNote}`,
            relatedCaseId: caseRow.id,
            relatedPetId: caseRow.primaryPetId,
          });
        }
      }

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "cross_org_transfer_cancelled_by_sender",
        payload: {
          case_id: caseRow.id,
          pet_id: caseRow.primaryPetId,
          sender_org_id: organization.id,
          receiver_org_id: receiverOrgId ?? null,
          reason: input.reason ?? null,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo cancelar la transferencia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (cancelCrossOrgTransferAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${input.senderOrgToken}/transferencias`);
  return { ok: true, publicCode: caseRow.publicCode };
}
