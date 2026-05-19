"use server";

// return-to-owner.ts — Lost & Found Fase 5.
//
// Four server actions that implement the two-phase return-to-owner handshake:
//
//   proposeReturnToOwnerAction  — actor (refugio or vecino) initiates
//   ownerAcceptReturnAction     — owner accepts; includes lazy auto-cancel
//   ownerRejectReturnAction     — owner explicitly rejects
//   actorCancelProposalAction   — actor cancels their own proposal
//
// Writer-pattern: each action has a public wrapper (handles auth / session)
// and an inner writer (exported for direct test access, no session required).
// This mirrors the pattern from app/actions/chip-match.ts.
//
// Preconditions for ownerAcceptReturnAction (§6.3 + §6.4 of the spec):
//   1. Actor still holds active shelter_custody for this pet.
//   2. Pet is still 'lost' (not already found by another path).
//   3. No subsequent custody_transferred event after the latest proposal.
//   4. The proposal's to_user_id matches the accepting owner.
//   5. A pending proposal exists (not already cancelled or transferred).
//
// If any precondition fails → auto-cancel path: emit custody_transfer_auto_cancelled
// note_added, notify the actor, return { ok: true, autoCancelled: true, reason }.

import {
  type PetEvent,
  cases,
  db,
  notifications,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { requireOrgAccessByToken, requireUserOrRedirect } from "@/lib/auth-guards";
import { getGrantedCapabilities } from "@/lib/capabilities";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type ProposeReturnResult = { ok: true; eventId: string } | { error: string };

export type AcceptReturnResult =
  | { ok: true }
  | { ok: true; autoCancelled: true; reason: string }
  | { error: string };

export type RejectReturnResult = { ok: true } | { error: string };

export type CancelProposalResult = { ok: true } | { error: string };

// ---------------------------------------------------------------------------
// Public action — proposeReturnToOwnerAction
// ---------------------------------------------------------------------------

export async function proposeReturnToOwnerAction({
  petPublicToken,
  actorMode,
  orgToken,
  notes,
}: {
  petPublicToken: string;
  actorMode: "refugio" | "vecino";
  orgToken?: string;
  notes?: string | null;
}): Promise<ProposeReturnResult> {
  if (actorMode === "refugio") {
    if (!orgToken) return { error: "orgToken requerido para actorMode='refugio'." };

    const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
    const granted = await getGrantedCapabilities(membership);
    if (!granted.has("custody.transfer")) {
      return { error: "Se necesita el permiso custody.transfer para proponer una devolución." };
    }

    return proposeReturnAsRefugioWriter({
      userId: user.id,
      organization: { id: organization.id, displayName: organization.displayName },
      petPublicToken,
      notes: notes ?? null,
    });
  }

  if (actorMode === "vecino") {
    const { user } = await requireUserOrRedirect();
    return proposeReturnAsVecinoWriter({ userId: user.id, petPublicToken, notes: notes ?? null });
  }

  return { error: "actorMode inválido. Debe ser 'refugio' o 'vecino'." };
}

// ---------------------------------------------------------------------------
// Inner writer — proposeReturn (refugio path)
// ---------------------------------------------------------------------------

export async function proposeReturnAsRefugioWriter({
  userId,
  organization,
  petPublicToken,
  notes,
}: {
  userId: string;
  organization: { id: string; displayName: string };
  petPublicToken: string;
  notes: string | null;
}): Promise<ProposeReturnResult> {
  // Look up pet.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  if (pet.status !== "lost") {
    return { error: `La mascota no está en estado 'perdida' (estado actual: ${pet.status}).` };
  }

  // Verify org has active shelter_custody on this pet.
  const [actorOwnership] = await db
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
  if (!actorOwnership) {
    return { error: "La organización no tiene custodia activa sobre esta mascota." };
  }

  // Find the original owner.
  const [ownerOwnership] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!ownerOwnership?.ownerUserId) {
    return { error: "No se encontró un dueño activo para devolver la mascota." };
  }
  const ownerUserIdRefugio: string = ownerOwnership.ownerUserId;

  // Anti-double-proposal: no pending custody_transfer_proposed without a
  // subsequent custody_transferred or auto-cancel note_added.
  const pendingCheck = await hasPendingProposal(pet.id);
  if (pendingCheck) {
    return { error: "Ya existe una propuesta de devolución pendiente para esta mascota." };
  }

  const now = new Date();
  let eventId = "";

  // Cases system (Fase D3): look up the open lost_pet_episode so the
  // proposal event attaches to it. Null when the pet was marked lost
  // before D3 rolled out.
  const [lostCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      // Fetch actor's display name for the notification body.
      const [actorProfile] = await tx
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      const actorName = actorProfile?.displayName ?? organization.displayName;

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: organization.id,
        to_user_id: ownerUserIdRefugio,
        to_organization_id: null,
        reason: "return_to_original_owner",
        notes,
        matched_against_pet_id: pet.id,
        proposed_at: now.toISOString(),
      });

      const [proposalEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_transfer_proposed",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          payload,
          caseId: lostCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      eventId = proposalEvent.id;

      // Notify the original owner.
      await tx.insert(notifications).values({
        userId: ownerUserIdRefugio,
        notificationType: "custody_transfer_proposal_owner",
        severity: "urgent",
        title: `Devolución propuesta de ${pet.name}`,
        body: `${actorName} está listo para devolverte a ${pet.name}. Confirmá cuando la tengas físicamente.`,
        relatedPetId: pet.id,
        relatedEventId: proposalEvent.id,
        relatedCaseId: lostCase?.id ?? null,
        ctaLabel: "Coordinar devolución",
        ctaUrl: `/mis-mascotas/${pet.publicToken}/devolucion`,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo proponer la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true, eventId };
}

// ---------------------------------------------------------------------------
// Inner writer — proposeReturn (vecino path)
// ---------------------------------------------------------------------------

export async function proposeReturnAsVecinoWriter({
  userId,
  petPublicToken,
  notes,
}: {
  userId: string;
  petPublicToken: string;
  notes: string | null;
}): Promise<ProposeReturnResult> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  if (pet.status !== "lost") {
    return { error: `La mascota no está en estado 'perdida' (estado actual: ${pet.status}).` };
  }

  // Verify vecino has active shelter_custody on this pet.
  const [actorOwnership] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!actorOwnership) {
    return { error: "No tenés custodia activa sobre esta mascota." };
  }

  // Find the original owner.
  const [ownerOwnership] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!ownerOwnership?.ownerUserId) {
    return { error: "No se encontró un dueño activo para devolver la mascota." };
  }
  const ownerUserIdVecino: string = ownerOwnership.ownerUserId;

  // Anti-double-proposal: no pending proposal exists.
  const pendingCheck = await hasPendingProposal(pet.id);
  if (pendingCheck) {
    return { error: "Ya existe una propuesta de devolución pendiente para esta mascota." };
  }

  const now = new Date();
  let eventId = "";

  // Cases system (Fase D3): attach proposal to the open lost_pet_episode
  // when present (legacy lost pets have no case yet).
  const [lostCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      const [actorProfile] = await tx
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      const actorName = actorProfile?.displayName ?? "Un vecino";

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: userId,
        from_organization_id: null,
        to_user_id: ownerUserIdVecino,
        to_organization_id: null,
        reason: "return_to_original_owner",
        notes,
        matched_against_pet_id: pet.id,
        proposed_at: now.toISOString(),
      });

      const [proposalEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_transfer_proposed",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: "owner",
          payload,
          caseId: lostCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      eventId = proposalEvent.id;

      await tx.insert(notifications).values({
        userId: ownerUserIdVecino,
        notificationType: "custody_transfer_proposal_owner",
        severity: "urgent",
        title: `Devolución propuesta de ${pet.name}`,
        body: `${actorName} está listo para devolverte a ${pet.name}. Confirmá cuando la tengas físicamente.`,
        relatedPetId: pet.id,
        relatedEventId: proposalEvent.id,
        relatedCaseId: lostCase?.id ?? null,
        ctaLabel: "Coordinar devolución",
        ctaUrl: `/mis-mascotas/${pet.publicToken}/devolucion`,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo proponer la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true, eventId };
}

// ---------------------------------------------------------------------------
// Public action — ownerAcceptReturnAction
// ---------------------------------------------------------------------------

export async function ownerAcceptReturnAction({
  petPublicToken,
}: {
  petPublicToken: string;
}): Promise<AcceptReturnResult> {
  const { user } = await requireUserOrRedirect();
  return ownerAcceptReturnWriter({ userId: user.id, petPublicToken });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerAcceptReturn
// ---------------------------------------------------------------------------

export async function ownerAcceptReturnWriter({
  userId,
  petPublicToken,
}: {
  userId: string;
  petPublicToken: string;
}): Promise<AcceptReturnResult> {
  // Verify caller is the active owner of this pet.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  const [ownerOwnership] = await db
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!ownerOwnership) return { error: "No sos el dueño activo de esta mascota." };

  // Find the latest custody_transfer_proposed event for this pet.
  const [latestProposal] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!latestProposal) return { error: "No hay propuestas de devolución pendientes." };

  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const toUserId = proposalPayload.to_user_id as string | null;

  // The proposal must be addressed to this owner.
  if (toUserId !== userId) {
    return { error: "Esta propuesta no está dirigida a vos." };
  }

  // Check that no custody_transferred event was emitted AFTER the proposal.
  const [subsequentTransfer] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "custody_transferred"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
      ),
    )
    .limit(1);

  if (subsequentTransfer) {
    return { error: "Esta propuesta ya fue procesada (transferencia ya ejecutada)." };
  }

  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;

  // -------------------------------------------------------------------------
  // PRECONDITIONS (lazy auto-cancel check — §6.3 / §6.4 of spec)
  // -------------------------------------------------------------------------

  // 1. Actor still has active shelter_custody.
  // fromOrgId and fromUserId are XOR: when fromOrgId is null, fromUserId is set.
  const shelterCustodyWhere = fromOrgId
    ? and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerOrganizationId, fromOrgId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      )
    : and(
        eq(ownerships.petId, pet.id),
        // fromUserId is non-null when fromOrgId is null (XOR invariant in custodyTransferProposed schema)
        eq(ownerships.ownerUserId, fromUserId ?? ""),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      );

  const [actorOwnership] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(shelterCustodyWhere)
    .limit(1);

  const failures: string[] = [];

  if (!actorOwnership) failures.push("actor_no_longer_holds_custody");

  // 2. Pet must still be 'lost' (owner may have marked found through another path).
  if (pet.status !== "lost") failures.push("pet_not_lost");

  // 3. Pet must not be deceased.
  if (pet.status === "deceased") failures.push("pet_deceased");

  if (failures.length > 0) {
    // AUTO-CANCEL: emit cancellation note + notify actor.
    const reason = failures[0];
    const now = new Date();
    try {
      await db.transaction(async (tx) => {
        const cancelPayload = validateEventPayload("note_added", {
          category: null,
          text: `Auto-cancelled at owner-accept: ${reason}. Original proposal_event_id=${latestProposal.id}`,
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "note_added",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: "system",
          payload: cancelPayload,
        });

        // Notify actor. For org actors, notify the member who authored the proposal
        // if available; otherwise skip (org notifications are out of scope for v1).
        const notifyUserId = fromUserId;
        if (notifyUserId) {
          await tx.insert(notifications).values({
            userId: notifyUserId,
            notificationType: "custody_transfer_auto_cancelled",
            severity: "info",
            title: `Propuesta de devolución cancelada — ${pet.name}`,
            body: autoCancelBody(reason, pet.name),
            relatedPetId: pet.id,
          });
        }
      });
    } catch (cancelErr) {
      // Auto-cancel best-effort — we still return the autoCancelled response.
      console.error("auto-cancel notification failed:", cancelErr);
    }

    return {
      ok: true,
      autoCancelled: true,
      reason: autoCancelBody(reason, pet.name),
    };
  }

  // -------------------------------------------------------------------------
  // HAPPY PATH: execute the transfer.
  // -------------------------------------------------------------------------
  const now = new Date();
  // Cases system (Fase D3): look up the open lost_pet_episode so the
  // transfer + cascade status_changed events attach to it AND the case
  // closes with closed_reason='resolved'. Null for legacy pets without
  // a case.
  const [lostCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      // 1. Insert custody_transferred event.
      const transferPayload = validateEventPayload("custody_transferred", {
        from_user_id: fromUserId,
        from_organization_id: fromOrgId,
        to_user_id: userId,
        to_organization_id: null,
        from_role: "shelter_custody",
        to_role: "owner",
        reason: "return_to_original_owner",
        matched_against_pet_id: pet.id,
        foster_ended_event_id: null,
        notes: null,
      });
      const [transferEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_transferred",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: "owner",
          payload: transferPayload,
          caseId: lostCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      // 2. End the actor's shelter_custody ownership.
      // actorOwnership is defined here — we only reach happy path when failures.length === 0
      // which means the actorOwnership check passed.
      const actorOwnershipId = (actorOwnership as { id: string }).id;
      await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, actorOwnershipId));

      // 3. Flip pet status from lost → active + emit status_changed event.
      if (pet.status === "lost") {
        await tx.update(pets).set({ status: "active", updatedAt: now }).where(eq(pets.id, pet.id));

        const statusPayload = validateEventPayload("status_changed", {
          from_status: "lost",
          to_status: "active",
          reason: "return_to_original_owner",
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "status_changed",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: "owner",
          payload: statusPayload,
          caseId: lostCase?.id ?? null,
        });

        // Close the lost_pet_episode case — the return-to-owner reaches
        // the happy outcome.
        if (lostCase) {
          await closeCase({ caseId: lostCase.id, reason: "resolved", closedByUserId: userId }, tx);
        }
      }

      // 4. Notify the actor.
      const notifyUserId = fromUserId;
      if (notifyUserId) {
        await tx.insert(notifications).values({
          userId: notifyUserId,
          notificationType: "custody_transfer_accepted_owner_side",
          severity: "info",
          title: `Devolución confirmada — ${pet.name}`,
          body: `El dueño confirmó que recibió a ${pet.name}. La custodia fue cerrada correctamente.`,
          relatedPetId: pet.id,
          relatedEventId: transferEvent.id,
        });
      } else if (fromOrgId) {
        // For org actors, try to notify the member who submitted the proposal.
        const proposalAuthorId = latestProposal.recordedByUserId;
        if (proposalAuthorId) {
          await tx.insert(notifications).values({
            userId: proposalAuthorId,
            notificationType: "custody_transfer_accepted_owner_side",
            severity: "info",
            title: `Devolución confirmada — ${pet.name}`,
            body: `El dueño confirmó que recibió a ${pet.name}. La custodia fue cerrada correctamente.`,
            relatedPetId: pet.id,
            relatedEventId: transferEvent.id,
          });
        }
      }
    });
  } catch (err) {
    return {
      error: `No se pudo completar la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public action — ownerRejectReturnAction
// ---------------------------------------------------------------------------

export async function ownerRejectReturnAction({
  petPublicToken,
  reason,
}: {
  petPublicToken: string;
  reason: string;
}): Promise<RejectReturnResult> {
  const { user } = await requireUserOrRedirect();
  return ownerRejectReturnWriter({ userId: user.id, petPublicToken, reason });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerRejectReturn
// ---------------------------------------------------------------------------

export async function ownerRejectReturnWriter({
  userId,
  petPublicToken,
  reason,
}: {
  userId: string;
  petPublicToken: string;
  reason: string;
}): Promise<RejectReturnResult> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  // Verify caller is the active owner.
  const [ownerOwnership] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!ownerOwnership) return { error: "No sos el dueño activo de esta mascota." };

  // Find the latest pending proposal.
  const [latestProposal] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  if (!latestProposal) return { error: "No hay propuestas de devolución pendientes." };

  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      // Emit note_added with rejection reason.
      const notePayload = validateEventPayload("note_added", {
        category: null,
        text: `Owner rechazó propuesta de devolución. Motivo: ${reason}. Proposal event_id=${latestProposal.id}`,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: "owner",
        payload: notePayload,
      });

      // Notify the actor.
      const notifyUserId = fromUserId;
      if (notifyUserId) {
        await tx.insert(notifications).values({
          userId: notifyUserId,
          notificationType: "custody_transfer_auto_cancelled",
          severity: "info",
          title: `Propuesta rechazada — ${pet.name}`,
          body: `El dueño de ${pet.name} rechazó la propuesta de devolución. Motivo: ${reason}`,
          relatedPetId: pet.id,
        });
      } else if (fromOrgId) {
        const proposalAuthorId = latestProposal.recordedByUserId;
        if (proposalAuthorId) {
          await tx.insert(notifications).values({
            userId: proposalAuthorId,
            notificationType: "custody_transfer_auto_cancelled",
            severity: "info",
            title: `Propuesta rechazada — ${pet.name}`,
            body: `El dueño de ${pet.name} rechazó la propuesta de devolución. Motivo: ${reason}`,
            relatedPetId: pet.id,
          });
        }
      }
    });
  } catch (err) {
    return {
      error: `No se pudo registrar el rechazo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public action — actorCancelProposalAction
// ---------------------------------------------------------------------------

export async function actorCancelProposalAction({
  petPublicToken,
  reason,
  orgToken,
}: {
  petPublicToken: string;
  reason: string;
  orgToken?: string;
}): Promise<CancelProposalResult> {
  const { user } = await requireUserOrRedirect();

  let actorOrgId: string | undefined;
  if (orgToken) {
    const { organization } = await requireOrgAccessByToken(orgToken);
    actorOrgId = organization.id;
  }

  return actorCancelProposalWriter({
    userId: user.id,
    petPublicToken,
    reason,
    actorOrgId,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — actorCancelProposal
// ---------------------------------------------------------------------------

export async function actorCancelProposalWriter({
  userId,
  petPublicToken,
  reason,
  actorOrgId,
}: {
  userId: string;
  petPublicToken: string;
  reason: string;
  actorOrgId?: string;
}): Promise<CancelProposalResult> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  // Find the latest proposal.
  const [latestProposal] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  if (!latestProposal) return { error: "No hay propuestas de devolución pendientes." };

  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;
  const toUserId = (proposalPayload.to_user_id as string | null) ?? null;

  // Verify caller is the actor who proposed (user or org member).
  const isActor = fromUserId
    ? fromUserId === userId
    : actorOrgId != null && fromOrgId === actorOrgId;

  if (!isActor) {
    return { error: "Solo quien propuso la devolución puede cancelarla." };
  }

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      const cancelPayload = validateEventPayload("note_added", {
        category: null,
        text: `Actor canceló la propuesta de devolución. Motivo: ${reason}. Proposal event_id=${latestProposal.id}`,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: fromOrgId ? "shelter" : "owner",
        authorOrganizationId: fromOrgId ?? undefined,
        payload: cancelPayload,
      });

      // Notify the original owner.
      if (toUserId) {
        await tx.insert(notifications).values({
          userId: toUserId,
          notificationType: "custody_transfer_auto_cancelled",
          severity: "info",
          title: `Propuesta cancelada — ${pet.name}`,
          body: `Quien tenía a ${pet.name} canceló la propuesta de devolución. Motivo: ${reason}`,
          relatedPetId: pet.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo cancelar la propuesta: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Returns true if there is a pending custody_transfer_proposed event with no
// subsequent custody_transferred event or cancellation note_added that closes it.
// "Pending" = latest proposal has no subsequent transfer/cancel.
async function hasPendingProposal(petId: string): Promise<boolean> {
  const [latestProposal] = await db
    .select({ id: petEvents.id, occurredAt: petEvents.occurredAt })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!latestProposal) return false;

  // Check for a subsequent custody_transferred event.
  const [subsequentTransfer] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "custody_transferred"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
      ),
    )
    .limit(1);

  if (subsequentTransfer) return false;

  return true;
}

function autoCancelBody(reason: string, petName: string): string {
  const messages: Record<string, string> = {
    actor_no_longer_holds_custody: `La propuesta se canceló automáticamente porque quien la hizo ya no tiene custodia activa de ${petName}.`,
    pet_not_lost: `La propuesta se canceló automáticamente porque ${petName} ya no figura como perdida.`,
    pet_deceased: `La propuesta se canceló automáticamente porque ${petName} está registrada como fallecida.`,
  };
  return messages[reason] ?? `La propuesta se canceló automáticamente (${reason}).`;
}

// ---------------------------------------------------------------------------
// Org-member lookup helper — used by UI pages to build the proposal context.
// ---------------------------------------------------------------------------

export async function loadProposalContext(petId: string): Promise<{
  latestProposal: PetEvent | null;
  actorDisplayName: string | null;
  actorOrgName: string | null;
}> {
  const [latestProposal] = (await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1)) as PetEvent[];

  if (!latestProposal) return { latestProposal: null, actorDisplayName: null, actorOrgName: null };

  const proposalPayload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (proposalPayload.from_user_id as string | null) ?? null;
  const fromOrgId = (proposalPayload.from_organization_id as string | null) ?? null;

  let actorDisplayName: string | null = null;
  let actorOrgName: string | null = null;

  if (fromUserId) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, fromUserId))
      .limit(1);
    actorDisplayName = profile?.displayName ?? null;
  }

  if (fromOrgId) {
    const [org] = await db
      .select({ displayName: organizations.displayName })
      .from(organizations)
      .where(eq(organizations.id, fromOrgId))
      .limit(1);
    actorOrgName = org?.displayName ?? null;
  }

  return { latestProposal, actorDisplayName, actorOrgName };
}
