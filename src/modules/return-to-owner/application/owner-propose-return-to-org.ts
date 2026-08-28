// Use-case: ownerProposeReturnToOrg — pet owner proposes returning the pet
// back to the originating org (post-adoption return or foster return).
//
// Auth (requireUserOrRedirect) is handled by the caller (action).

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { findOpenCaseForPetAndKind } from "@/lib/infra/case-helpers";
import { unerasedPetByToken } from "@/lib/infra/public-pet-lookup";

import type { OwnerProposeReturnToOrgResult } from "../domain/types";
import { hasPendingProposal } from "./proposal-queries";

export async function ownerProposeReturnToOrgUseCase({
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
    // Art. 16: an erased pet answers like a token that never existed.
    .where(unerasedPetByToken(petPublicToken))
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
  const alreadyPending = await hasPendingProposal(pet.id, db);
  if (alreadyPending) {
    return { error: "Ya existe una propuesta de devolución pendiente para esta mascota." };
  }

  // Find the target org.
  let toOrgId: string | null = null;

  if (callerRole === "foster") {
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

    // Fallback: active parallel shelter_custody.
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
          "No se encontró una adopción ni una organización asociada para esta mascota. Solo podés devolver mascotas recibidas a través de miMAR.",
      };
    }
  }

  // Resolve org display name + publicToken for the notification.
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

      // Notify org admins.
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

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
      // Web Push leg (ADR 2026-07-18 §4): urgent custodia, best-effort, never throws.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, eventId };
}
