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
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { requireOrgAccessByToken, requireUserOrRedirect } from "@/lib/auth-guards";
import { closeCase, findOpenCaseForPetAndKind } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

// ARCH-B cutoff: cancellations recorded after this moment ALWAYS emit a
// structured custody_transfer_cancelled event. Legacy note_added markers are
// only honoured for rows recorded before it (forgery guard — see
// hasPendingProposal check 3). Set to the ARCH-B implementation moment; a
// legitimate marker can only predate it because every writer since emits the
// structured event.
const LEGACY_CANCEL_MARKER_CUTOFF = new Date("2026-06-10T20:00:00Z");

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type ProposeReturnResult = { ok: true; eventId: string } | { error: string };

export type OwnerProposeReturnToOrgResult = { ok: true; eventId: string } | { error: string };

export type AcceptReturnResult =
  | { ok: true }
  | { ok: true; autoCancelled: true; reason: string }
  | { error: string };

export type RejectReturnResult = { ok: true } | { error: string };

export type CancelProposalResult = { ok: true } | { error: string };

export type OrgAcceptOwnerReturnResult = { ok: true } | { error: string };

export type OrgRejectOwnerReturnResult = { ok: true } | { error: string };

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

  // Fast pre-check outside the tx (optimistic path — avoids lock contention).
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

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // TOCTOU fix: serialize concurrent proposals on the same pet.
      // Same lock key as orgAcceptOwnerReturnWriter so propose-vs-accept also
      // serialize — prevents a proposal slipping in while an accept is running.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify inside the tx after acquiring the lock.
      const pendingInTx = await hasPendingProposal(pet.id, tx);
      if (pendingInTx) {
        throw new Error("Ya existe una propuesta de devolución pendiente para esta mascota.");
      }

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
      pendingNotifications.push({
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

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
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

  // Fast pre-check outside the tx (optimistic path — avoids lock contention).
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

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // TOCTOU fix: serialize concurrent proposals on the same pet.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify inside the tx after acquiring the lock.
      const pendingInTx = await hasPendingProposal(pet.id, tx);
      if (pendingInTx) {
        throw new Error("Ya existe una propuesta de devolución pendiente para esta mascota.");
      }

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

      pendingNotifications.push({
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

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
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
    // AUTO-CANCEL: emit custody_transfer_cancelled + notify actor.
    const reason = failures[0];
    const now = new Date();
    type PendingNotification = typeof notifications.$inferInsert;
    const cancelPendingNotifications: PendingNotification[] = [];
    try {
      await db.transaction(async (tx) => {
        // Emit structured cancellation (ARCH-B: replaces marker note_added).
        const cancelPayload = validateEventPayload("custody_transfer_cancelled", {
          proposal_event_id: latestProposal.id,
          cancelled_by: "auto_cancel",
          reason,
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "custody_transfer_cancelled",
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
          cancelPendingNotifications.push({
            userId: notifyUserId,
            notificationType: "custody_transfer_auto_cancelled",
            severity: "info",
            title: `Propuesta de devolución cancelada — ${pet.name}`,
            body: autoCancelBody(reason, pet.name),
            relatedPetId: pet.id,
            // no-cta: recipient is the superseded proposer (vecino finder or org member);
            // their accessible surface differs by role and the proposal is gone — no single
            // safe destination.
          });
        }
      });
    } catch (cancelErr) {
      // Auto-cancel best-effort — we still return the autoCancelled response.
      console.error("auto-cancel notification failed:", cancelErr);
    }

    if (cancelPendingNotifications.length > 0) {
      try {
        await db.insert(notifications).values(cancelPendingNotifications);
      } catch (e) {
        console.error("notifications insert failed (action did succeed)", e);
      }
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

  // custody_episode terminal (custody_transferred → return-to-owner path).
  // Null when the pet was never intaked (owner-registered pet returning from
  // an informal arrangement) — that's normal; we just skip the close.
  const custodyCase = await findOpenCaseForPetAndKind(pet.id, "custody_episode");

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

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
          caseId: custodyCase?.id ?? lostCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      // 2. End the actor's shelter_custody ownership.
      // actorOwnership is defined here — we only reach happy path when failures.length === 0
      // which means the actorOwnership check passed.
      const actorOwnershipId = (actorOwnership as { id: string }).id;
      await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, actorOwnershipId));

      // Close the custody_episode case if one was open (animal was intaked).
      if (custodyCase) {
        await closeCase({ caseId: custodyCase.id, reason: "resolved", closedByUserId: userId }, tx);
      }

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
        pendingNotifications.push({
          userId: notifyUserId,
          notificationType: "custody_transfer_accepted_owner_side",
          severity: "info",
          title: `Devolución confirmada — ${pet.name}`,
          body: `El dueño confirmó que recibió a ${pet.name}. La custodia fue cerrada correctamente.`,
          relatedPetId: pet.id,
          relatedEventId: transferEvent.id,
          // no-cta: recipient is the return proposer (vecino finder or org member);
          // the pet has gone back to the owner, so the proposer has no accessible
          // surface for it. Terminal confirmation.
        });
      } else if (fromOrgId) {
        // For org actors, try to notify the member who submitted the proposal.
        const proposalAuthorId = latestProposal.recordedByUserId;
        if (proposalAuthorId) {
          pendingNotifications.push({
            userId: proposalAuthorId,
            notificationType: "custody_transfer_accepted_owner_side",
            severity: "info",
            title: `Devolución confirmada — ${pet.name}`,
            body: `El dueño confirmó que recibió a ${pet.name}. La custodia fue cerrada correctamente.`,
            relatedPetId: pet.id,
            relatedEventId: transferEvent.id,
            // no-cta: recipient is the org member who proposed; the pet has gone back to
            // the owner, so the org no longer has a pet surface for it. Terminal confirmation.
          });
        }
      }
    });
  } catch (err) {
    return {
      error: `No se pudo completar la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
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
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // TOCTOU fix: serialize against ownerAcceptReturnWriter (and the
      // propose writers) on the same pet. Same advisory key as the accept
      // path — without it a reject can race an accept and emit a spurious
      // custody_transfer_cancelled into the immutable log.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify the proposal is still pending UNDER the lock. If an accept
      // (or another cancel) already resolved it, do not emit a cancellation.
      const stillPending = await hasPendingProposal(pet.id, tx);
      if (!stillPending) {
        throw new Error("No hay propuestas de devolución pendientes.");
      }

      // Emit custody_transfer_cancelled (ARCH-B: replaces marker note_added).
      const cancelPayload = validateEventPayload("custody_transfer_cancelled", {
        proposal_event_id: latestProposal.id,
        cancelled_by: "owner_reject",
        reason: reason ?? null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transfer_cancelled",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: "owner",
        payload: cancelPayload,
      });

      // Notify the actor.
      const notifyUserId = fromUserId;
      if (notifyUserId) {
        pendingNotifications.push({
          userId: notifyUserId,
          notificationType: "custody_transfer_auto_cancelled",
          severity: "info",
          title: `Propuesta rechazada — ${pet.name}`,
          body: `El dueño de ${pet.name} rechazó la propuesta de devolución. Motivo: ${reason}`,
          relatedPetId: pet.id,
          // no-cta: recipient is the return proposer (vecino finder or org member);
          // the rejected proposal has no surface they can act on. Terminal notice.
        });
      } else if (fromOrgId) {
        const proposalAuthorId = latestProposal.recordedByUserId;
        if (proposalAuthorId) {
          pendingNotifications.push({
            userId: proposalAuthorId,
            notificationType: "custody_transfer_auto_cancelled",
            severity: "info",
            title: `Propuesta rechazada — ${pet.name}`,
            body: `El dueño de ${pet.name} rechazó la propuesta de devolución. Motivo: ${reason}`,
            relatedPetId: pet.id,
            // no-cta: recipient is the org member who proposed; the rejected proposal has
            // no surface they can act on. Terminal notice.
          });
        }
      }
    });
  } catch (err) {
    return {
      error: `No se pudo registrar el rechazo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
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
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // TOCTOU fix: serialize against ownerAcceptReturnWriter (and the
      // propose writers) on the same pet. Same advisory key as the accept
      // path — without it a cancel can race an accept and emit a spurious
      // custody_transfer_cancelled into the immutable log.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify the proposal is still pending UNDER the lock. If an accept
      // (or a reject) already resolved it, do not emit a cancellation.
      const stillPending = await hasPendingProposal(pet.id, tx);
      if (!stillPending) {
        throw new Error("No hay propuestas de devolución pendientes.");
      }

      // Emit custody_transfer_cancelled (ARCH-B: replaces marker note_added).
      const cancelPayload = validateEventPayload("custody_transfer_cancelled", {
        proposal_event_id: latestProposal.id,
        cancelled_by: "actor_cancel",
        reason: reason ?? null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transfer_cancelled",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: fromOrgId ? "shelter" : "owner",
        authorOrganizationId: fromOrgId ?? undefined,
        payload: cancelPayload,
      });

      // Notify the original owner.
      if (toUserId) {
        pendingNotifications.push({
          userId: toUserId,
          notificationType: "custody_transfer_auto_cancelled",
          severity: "info",
          title: `Propuesta cancelada — ${pet.name}`,
          body: `Quien tenía a ${pet.name} canceló la propuesta de devolución. Motivo: ${reason}`,
          relatedPetId: pet.id,
          ctaLabel: "Ver mi mascota",
          ctaUrl: `/mis-mascotas/${pet.publicToken}`,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo cancelar la propuesta: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Returns true if there is a pending custody_transfer_proposed event with no
// subsequent event that resolves it.
//
// Resolution checks (tri-check — ARCH-B):
//   1. custody_transferred after the proposal (happy path accepted).
//   2. custody_transfer_cancelled with payload->>'proposal_event_id' = proposal.id
//      (structured cancellation — new path since ARCH-B).
//   3. Legacy: note_added with marker text LIKE '%Proposal event_id=<id>%'
//      AND recordedAt before the ARCH-B cutoff. Historical owner-reject
//      markers were authored as 'owner', so a role filter would resurrect
//      old resolved proposals — the time fence is the correct forgery guard:
//      every cancellation since the cutoff emits the structured event, so a
//      marker note recorded after it can only be a crafted note.
async function hasPendingProposal(
  petId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<boolean> {
  const exec = tx ?? db;

  const [latestProposal] = await exec
    .select({ id: petEvents.id, occurredAt: petEvents.occurredAt })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!latestProposal) return false;

  // Check 1: subsequent custody_transferred.
  const [subsequentTransfer] = await exec
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

  // Check 2: structured cancellation referencing this proposal (ARCH-B).
  const [structuredCancel] = await exec
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "custody_transfer_cancelled"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
        sql`${petEvents.payload}->>'proposal_event_id' = ${latestProposal.id}`,
      ),
    )
    .limit(1);

  if (structuredCancel) return false;

  // Check 3: legacy marker note_added (historical rows only — pre-ARCH-B data).
  // Time-fenced: legacy owner-reject markers were authored as 'owner', so we
  // cannot filter by role. Markers recorded after the cutoff are ignored —
  // real cancellations emit custody_transfer_cancelled since ARCH-B, so a
  // post-cutoff marker can only be a crafted note (forgery guard).
  const proposalMarker = `Proposal event_id=${latestProposal.id}`;
  const [cancelNote] = await exec
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "note_added"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
        sql`${petEvents.payload}->>'text' LIKE ${`%${proposalMarker}%`}`,
        lt(petEvents.recordedAt, LEGACY_CANCEL_MARKER_CUTOFF),
      ),
    )
    .limit(1);

  if (cancelNote) return false;

  return true;
}

// Returns true when there is a pending return proposal for this pet ADDRESSED to
// the given owner (i.e. an actor — refugio or vecino — is trying to return the
// pet to this owner). Reuses hasPendingProposal (the ARCH-B tri-check: subsequent
// transfer, structured cancellation, time-fenced legacy marker) and adds the
// to_user_id gate so the owner only sees the "Confirmar devolución" entry when the
// pending proposal is actually directed at them.
//
// @no-auth-required: read-only boolean helper that expects PRE-AUTHORIZED owner
// context — callers must have already confirmed the user is the active owner of
// the pet (page-level requirePetAccess + ownership role check) before calling.
// It reveals nothing beyond "a pending proposal addressed to this owner exists".
export async function fetchPendingReturnProposalForOwner(
  petId: string,
  ownerUserId: string,
): Promise<boolean> {
  // Full tri-check first (cheap short-circuit when nothing is pending).
  const pending = await hasPendingProposal(petId);
  if (!pending) return false;

  // The latest proposal is the pending one (hasPendingProposal already
  // confirmed it is unresolved). Confirm it is addressed to this owner.
  const [latestProposal] = await db
    .select({ payload: petEvents.payload })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!latestProposal) return false;

  const payload = latestProposal.payload as Record<string, unknown>;
  const toUserId = (payload.to_user_id as string | null) ?? null;
  return toUserId === ownerUserId;
}

// Fetch the latest pending owner-initiated return proposal for a pet to a specific org.
// Returns the proposal event and the owner user id if a pending proposal exists with
//   from_user_id set (owner-initiated) and to_organization_id = orgId.
// ForOrg suffix: read-only helper that expects PRE-AUTHORIZED org context —
// callers must have already run requireOrgAccessByToken (page) or the action
// guards (writers) before passing orgId.
export async function fetchPendingOwnerReturnProposalForOrg(
  petId: string,
  orgId: string,
): Promise<{
  proposal: PetEvent;
  ownerUserId: string;
} | null> {
  const [latestProposal] = (await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1)) as PetEvent[];

  if (!latestProposal) return null;

  const payload = latestProposal.payload as Record<string, unknown>;
  const fromUserId = (payload.from_user_id as string | null) ?? null;
  const fromOrgId = (payload.from_organization_id as string | null) ?? null;
  const toOrgId = (payload.to_organization_id as string | null) ?? null;

  // Must be owner-initiated (from_user_id set, from_organization_id null) and directed to this org.
  if (!fromUserId || fromOrgId !== null || toOrgId !== orgId) return null;

  // Must not have a subsequent transfer.
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
  if (subsequentTransfer) return null;

  // Check 2: structured cancellation referencing this proposal (ARCH-B).
  const [structuredCancel] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "custody_transfer_cancelled"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
        sql`${petEvents.payload}->>'proposal_event_id' = ${latestProposal.id}`,
      ),
    )
    .limit(1);
  if (structuredCancel) return null;

  // Check 3: legacy marker note_added (historical rows — pre-ARCH-B data).
  // Time-fenced against forgery (see hasPendingProposal).
  const proposalMarker = `Proposal event_id=${latestProposal.id}`;
  const [cancelNote] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "note_added"),
        gt(petEvents.occurredAt, latestProposal.occurredAt),
        sql`${petEvents.payload}->>'text' LIKE ${`%${proposalMarker}%`}`,
        lt(petEvents.recordedAt, LEGACY_CANCEL_MARKER_CUTOFF),
      ),
    )
    .limit(1);
  if (cancelNote) return null;

  return { proposal: latestProposal, ownerUserId: fromUserId };
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
// Public action — ownerProposeReturnToOrgAction
// ---------------------------------------------------------------------------
//
// Owner holds a pet received via adoption (or foster) and wants to return it
// to the originating org. Emits custody_transfer_proposed with:
//   from_user_id  = owner
//   to_organization_id = originating org (from the most recent adoption_finalized)
// The org receives a notification so they can accept via their portal.

export async function ownerProposeReturnToOrgAction({
  petPublicToken,
  reason,
  notes,
  proposedAt,
}: {
  petPublicToken: string;
  reason: string;
  notes: string | null;
  proposedAt: string;
}): Promise<OwnerProposeReturnToOrgResult> {
  const { user } = await requireUserOrRedirect();

  // Detect whether the caller holds 'owner' or 'foster' on this pet so the
  // writer can apply the correct preconditions without a duplicate query.
  const [petRow] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };

  const [callerOwnership] = await db
    .select({ role: ownerships.role })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, petRow.id),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  const callerRole: "owner" | "foster" = callerOwnership?.role === "foster" ? "foster" : "owner";

  return ownerProposeReturnToOrgWriter({
    userId: user.id,
    petPublicToken,
    reason,
    notes,
    proposedAt,
    callerRole,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerProposeReturnToOrg
// ---------------------------------------------------------------------------

export async function ownerProposeReturnToOrgWriter({
  userId,
  petPublicToken,
  reason,
  notes,
  proposedAt,
  callerRole = "owner",
}: {
  userId: string;
  petPublicToken: string;
  reason: string;
  notes: string | null;
  proposedAt: string;
  callerRole?: "owner" | "foster";
}): Promise<OwnerProposeReturnToOrgResult> {
  // Verify the pet exists.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  // Caller must hold the expected active role on this pet.
  const [callerOwnership] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, pet.id),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, callerRole),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!callerOwnership) {
    return callerRole === "foster"
      ? { error: "No tenés un tránsito activo para esta mascota." }
      : { error: "No sos el dueño activo de esta mascota." };
  }

  // Fast pre-check outside the tx (optimistic path — avoids lock contention).
  const alreadyPending = await hasPendingProposal(pet.id);
  if (alreadyPending) {
    return { error: "Ya existe una propuesta de devolución pendiente para esta mascota." };
  }

  // Find the target org.
  // Foster path: go straight to the parallel shelter_custody org (skip adoption_finalized
  // which was never emitted for a foster arrangement).
  // Owner path: first try adoption_finalized, then fall back to an active parallel
  // shelter_custody ownership.
  let toOrgId: string | null = null;

  if (callerRole === "foster") {
    // Assert the parallel shelter_custody org row exists (fix 5).
    const [parallelCustody] = await db
      .select({ ownerOrganizationId: ownerships.ownerOrganizationId })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, pet.id),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    toOrgId = parallelCustody?.ownerOrganizationId ?? null;
    if (!toOrgId) {
      return {
        error:
          "No se encontró una organización activa asociada a este tránsito. Contactá directamente al refugio.",
      };
    }
  } else {
    const [adoptionEvent] = await db
      .select({ payload: petEvents.payload })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "adoption_finalized")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(1);

    if (adoptionEvent) {
      const adoptionPayload = adoptionEvent.payload as {
        previous_owner_organization_id?: string | null;
        adopter_user_id?: string | null;
      };
      if (adoptionPayload.adopter_user_id !== userId) {
        return { error: "No sos el adoptante registrado para esta mascota." };
      }
      toOrgId = adoptionPayload.previous_owner_organization_id ?? null;
    }

    // Fallback: active parallel shelter_custody (e.g. informal foster without adoption event).
    if (!toOrgId) {
      const [parallelCustody] = await db
        .select({ ownerOrganizationId: ownerships.ownerOrganizationId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      toOrgId = parallelCustody?.ownerOrganizationId ?? null;
    }

    if (!toOrgId) {
      return {
        error:
          "No se encontró una adopción ni una organización asociada para esta mascota. Solo podés devolver mascotas recibidas a través de MiMAR.",
      };
    }
  }

  // Resolve org display name + publicToken (ctaUrl routes use publicToken,
  // never the internal UUID) for the notification.
  const [orgRow] = await db
    .select({ displayName: organizations.displayName, publicToken: organizations.publicToken })
    .from(organizations)
    .where(eq(organizations.id, toOrgId))
    .limit(1);
  const orgDisplayName = orgRow?.displayName ?? "el refugio";
  const orgPublicToken = orgRow?.publicToken ?? null;

  // Look up the custody_episode case if one is open (for event attachment).
  const custodyCase = await findOpenCaseForPetAndKind(pet.id, "custody_episode");

  const now = new Date();
  let eventId = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // TOCTOU fix: serialize concurrent proposals on the same pet.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify inside the tx after acquiring the lock.
      const pendingInTx = await hasPendingProposal(pet.id, tx);
      if (pendingInTx) {
        throw new Error("Ya existe una propuesta de devolución pendiente para esta mascota.");
      }

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: userId,
        from_organization_id: null,
        to_user_id: null,
        to_organization_id: toOrgId,
        reason,
        notes,
        matched_against_pet_id: null,
        proposed_at: proposedAt,
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
          caseId: custodyCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      eventId = proposalEvent.id;

      // Notify org admins: look up members with admin/coordinator roles.
      const admins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, toOrgId),
            isNull(organizationMemberships.leftAt),
          ),
        )
        .limit(10);

      for (const admin of admins) {
        if (!admin.userId) continue;
        pendingNotifications.push({
          userId: admin.userId,
          notificationType: "custody_transfer_proposal_owner",
          severity: "urgent",
          title: `Devolución propuesta — ${pet.name}`,
          body: `El adoptante de ${pet.name} propone devolver la mascota a ${orgDisplayName}. Revisá la propuesta en el portal del refugio.`,
          relatedPetId: pet.id,
          relatedEventId: proposalEvent.id,
          relatedCaseId: custodyCase?.id ?? null,
          ctaUrl: orgPublicToken ? `/org/${orgPublicToken}/mascotas/${pet.publicToken}` : "/org",
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo registrar la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Insert notifications outside the tx (fire-and-forget).
  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, eventId };
}

// ---------------------------------------------------------------------------
// Public action — orgAcceptOwnerReturnAction
// ---------------------------------------------------------------------------
//
// Org accepts an owner-initiated return proposal (custody_transfer_proposed with
// from_user_id=owner, to_organization_id=this org).
// In a tx: re-verifies the pending proposal, emits custody_transferred
// (from_user_id=owner → to_organization_id=org, from_role owner → to_role shelter_custody),
// ends the owner's active ownership row, opens a new shelter_custody ownership for the org,
// and notifies the owner.

export async function orgAcceptOwnerReturnAction({
  petPublicToken,
  orgToken,
}: {
  petPublicToken: string;
  orgToken: string;
}): Promise<OrgAcceptOwnerReturnResult> {
  const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("custody.transfer")) {
    return { error: "Se necesita el permiso custody.transfer para aceptar la devolución." };
  }
  return orgAcceptOwnerReturnWriter({
    orgId: organization.id,
    orgDisplayName: organization.displayName,
    actingUserId: user.id,
    petPublicToken,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — orgAcceptOwnerReturn
// ---------------------------------------------------------------------------

export async function orgAcceptOwnerReturnWriter({
  orgId,
  orgDisplayName,
  actingUserId,
  petPublicToken,
}: {
  orgId: string;
  orgDisplayName: string;
  /**
   * Authenticated org member performing the accept. Audit-integrity fix: the
   * emitted pet_events MUST be attributed to the member who acted, not to the
   * owner who authored the proposal (latestProposal.recordedByUserId).
   */
  actingUserId: string;
  petPublicToken: string;
}): Promise<OrgAcceptOwnerReturnResult> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  // Quick pre-flight outside the tx (fast rejection without taking a lock).
  const preFlight = await fetchPendingOwnerReturnProposalForOrg(pet.id, orgId);
  if (!preFlight) {
    return { error: "No hay propuesta de devolución pendiente para esta mascota." };
  }

  // Find the custody_episode case if open (for event attachment).
  const custodyCase = await findOpenCaseForPetAndKind(pet.id, "custody_episode");

  const now = new Date();
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // Serialize concurrent accepts on the same pet with an advisory lock
      // (belt). The unique index on ownerships (fix 3 migration) is the
      // suspenders — this lock ensures only one accept runs at a time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pet.id}))`);

      // Re-verify inside the tx after acquiring the lock.
      const pending = await fetchPendingOwnerReturnProposalForOrg(pet.id, orgId);
      if (!pending) {
        throw new Error("No hay propuesta de devolución pendiente para esta mascota.");
      }
      const { ownerUserId } = pending;

      // Verify the owner still holds their active owner ownership row.
      const [ownerOwnership] = await tx
        .select({ id: ownerships.id })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.ownerUserId, ownerUserId),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (!ownerOwnership) {
        throw new Error(
          "El dueño ya no tiene la custodia activa. No se puede procesar la devolución.",
        );
      }

      // Fix 4: find and end any active foster row for this pet before the
      // custody_transferred event so the timeline reads as one coherent transfer.
      const [fosterRow] = await tx
        .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "foster"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);

      let fosterEndedEventId: string | null = null;
      if (fosterRow?.ownerUserId) {
        const fosterEndedPayload = validateEventPayload("foster_ended", {
          foster_user_id: fosterRow.ownerUserId,
          reason: "other",
          notes: "Tránsito cerrado por devolución al refugio aceptada por el refugio.",
        });
        const [fEnded] = await tx
          .insert(petEvents)
          .values({
            petId: pet.id,
            eventType: "foster_ended",
            occurredAt: now,
            recordedAt: now,
            // Audit-integrity fix: attribute to the acting org member, not the
            // owner who proposed (latestProposal.recordedByUserId).
            recordedByUserId: actingUserId,
            authorRole: "shelter",
            authorOrganizationId: orgId,
            payload: fosterEndedPayload,
            caseId: custodyCase?.id ?? null,
          })
          .returning({ id: petEvents.id });
        fosterEndedEventId = fEnded.id;
        await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, fosterRow.id));
      }

      // 1. Emit custody_transferred: owner → org shelter_custody.
      const transferPayload = validateEventPayload("custody_transferred", {
        from_user_id: ownerUserId,
        from_organization_id: null,
        to_user_id: null,
        to_organization_id: orgId,
        from_role: "owner",
        to_role: "shelter_custody",
        reason: "post_adoption_failed_return",
        matched_against_pet_id: null,
        foster_ended_event_id: fosterEndedEventId,
        notes: null,
      });
      const [transferEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_transferred",
          occurredAt: now,
          recordedAt: now,
          // Audit-integrity fix: attribute to the acting org member, not the
          // owner who proposed (latestProposal.recordedByUserId).
          recordedByUserId: actingUserId,
          authorRole: "shelter",
          authorOrganizationId: orgId,
          payload: transferPayload,
          caseId: custodyCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      // 2. End the owner's ownership row.
      await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, ownerOwnership.id));

      // 3. Open a new shelter_custody ownership for the org.
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerOrganizationId: orgId,
        role: "shelter_custody",
        startedAt: now,
      });

      // 4. Notify the owner.
      pendingNotifications.push({
        userId: ownerUserId,
        notificationType: "custody_transfer_accepted_owner_side",
        severity: "info",
        title: `Devolución aceptada — ${pet.name}`,
        body: `${orgDisplayName} confirmó la recepción de ${pet.name}. La custodia fue transferida correctamente.`,
        relatedPetId: pet.id,
        relatedEventId: transferEvent.id,
        relatedCaseId: custodyCase?.id ?? null,
        ctaLabel: "Ver mi mascota",
        ctaUrl: `/mis-mascotas/${pet.publicToken}`,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo procesar la devolución: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public action — orgRejectOwnerReturnAction
// ---------------------------------------------------------------------------
//
// Org rejects an owner-initiated return proposal. Emits a note_added with the
// rejection reason (same cancel-marker pattern as ownerRejectReturnWriter so
// hasPendingProposal treats it as resolved) and notifies the owner.

export async function orgRejectOwnerReturnAction({
  petPublicToken,
  orgToken,
  reason,
}: {
  petPublicToken: string;
  orgToken: string;
  reason: string;
}): Promise<OrgRejectOwnerReturnResult> {
  const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("custody.transfer")) {
    return { error: "Se necesita el permiso custody.transfer para rechazar la devolución." };
  }
  return orgRejectOwnerReturnWriter({
    orgId: organization.id,
    orgDisplayName: organization.displayName,
    actingUserId: user.id,
    petPublicToken,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — orgRejectOwnerReturn
// ---------------------------------------------------------------------------

export async function orgRejectOwnerReturnWriter({
  orgId,
  orgDisplayName,
  actingUserId,
  petPublicToken,
  reason,
}: {
  orgId: string;
  orgDisplayName: string;
  /**
   * Authenticated org member performing the reject. Audit-integrity fix: the
   * emitted custody_transfer_cancelled MUST be attributed to the member who
   * acted, not to the owner who authored the proposal.
   */
  actingUserId: string;
  petPublicToken: string;
  reason: string;
}): Promise<OrgRejectOwnerReturnResult> {
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };
  const pet = petRow.pet;

  // Re-verify pending proposal.
  const pending = await fetchPendingOwnerReturnProposalForOrg(pet.id, orgId);
  if (!pending) {
    return { error: "No hay propuesta de devolución pendiente para esta mascota." };
  }
  const { proposal: latestProposal, ownerUserId } = pending;

  const now = new Date();
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // Emit custody_transfer_cancelled (ARCH-B: replaces marker note_added).
      const cancelPayload = validateEventPayload("custody_transfer_cancelled", {
        proposal_event_id: latestProposal.id,
        cancelled_by: "org_reject",
        reason: reason ?? null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transfer_cancelled",
        occurredAt: now,
        recordedAt: now,
        // Audit-integrity fix: attribute to the acting org member, not the
        // owner who proposed (latestProposal.recordedByUserId).
        recordedByUserId: actingUserId,
        authorRole: "shelter",
        authorOrganizationId: orgId,
        payload: cancelPayload,
      });

      // Notify the owner.
      pendingNotifications.push({
        userId: ownerUserId,
        notificationType: "custody_transfer_auto_cancelled",
        severity: "info",
        title: `Propuesta rechazada — ${pet.name}`,
        body: `${orgDisplayName} rechazó tu propuesta de devolución de ${pet.name}. Motivo: ${reason}`,
        relatedPetId: pet.id,
        ctaLabel: "Ver mi mascota",
        ctaUrl: `/mis-mascotas/${pet.publicToken}`,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo registrar el rechazo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Org-member lookup helper — used by UI pages to build the proposal context.
// ---------------------------------------------------------------------------

// @no-auth-required: read-only context loader, no mutations. The calling page
// already auth-gates via the route's `requireOrgAccessByToken` / pet-access
// helpers. Belongs in lib/ — moving it is a separate refactor.
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
