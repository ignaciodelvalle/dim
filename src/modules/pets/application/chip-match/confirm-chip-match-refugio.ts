// Use-case: confirmChipMatchAsRefugioWriter — refugio path for chip-match confirmation
// (strangler migration 21/61).
//
// Org-side confirmation: a refugio actor sees a matched pet after a microchip cross-check
// during intake and decides whether it's the same animal.
//
// decision='same': inserts shelter_custody ownership + shelter_intake_recorded event +
//   chip_match_notification_owner notification (post-tx, best-effort).
// decision='not_same': emits a dismissal note_added event. No state change.
//
// §2.2: notifications accumulate in pendingNotifications[] inside the tx
// and are inserted AFTER the transaction commits (best-effort, logged on failure).

import { db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { and, eq, isNull } from "drizzle-orm";

import type { ConfirmChipMatchResult } from "./types";

export async function confirmChipMatchAsRefugioWriter({
  auth,
  orgToken,
  matchedPetToken,
  decision,
  notes,
}: {
  auth: {
    user: { id: string };
    organization: { id: string; displayName: string; verified: boolean };
  };
  orgToken: string;
  matchedPetToken: string;
  decision: "same" | "not_same";
  notes?: string;
}): Promise<ConfirmChipMatchResult> {
  const { user, organization } = auth;
  const now = new Date();

  // Look up matched pet and its active owner.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, matchedPetToken))
    .limit(1);

  if (!petRow) return { error: "Mascota no encontrada." };
  const matchedPet = petRow.pet;

  if (decision === "not_same") {
    // Emit a dismissal note on the matched pet — no state change.
    const notePayload = validateEventPayload("note_added", {
      category: null,
      text: `Refugio ${organization.displayName} descartó posible coincidencia de chip en intake. Sin cambios de estado.`,
    });
    await db.insert(petEvents).values({
      petId: matchedPet.id,
      eventType: "note_added",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: user.id,
      authorRole: "shelter",
      authorOrganizationId: organization.id,
      authorVerified: organization.verified,
      payload: notePayload,
    });
    return { ok: true };
  }

  // decision === 'same'
  if (matchedPet.status !== "lost") {
    return {
      error: `La mascota ya no está en estado 'perdida' (estado actual: ${matchedPet.status}). No se puede crear la custodia.`,
    };
  }

  // Find the active owner ownership to notify them.
  const [ownerOwnership] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, matchedPet.id),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  let custodyEventId: string | undefined;

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  await db.transaction(async (tx) => {
    // 1. Insert shelter_custody ownership for the refugio (parallel to owner's).
    await tx.insert(ownerships).values({
      petId: matchedPet.id,
      ownerOrganizationId: organization.id,
      role: "shelter_custody",
      startedAt: now,
    });

    // 2. Emit shelter_intake_recorded event with match context.
    const intakePayload = validateEventPayload("shelter_intake_recorded", {
      intake_reason: "stray_found",
      intake_condition: notes ?? null,
      rescue_jurisdiction: null,
    });
    const [intakeEvent] = await tx
      .insert(petEvents)
      .values({
        petId: matchedPet.id,
        eventType: "shelter_intake_recorded",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: intakePayload,
      })
      .returning({ id: petEvents.id });
    custodyEventId = intakeEvent.id;

    // 3. Notify the original owner if we have a userId.
    if (ownerOwnership?.ownerUserId) {
      pendingNotifications.push({
        userId: ownerOwnership.ownerUserId,
        notificationType: "chip_match_notification_owner",
        severity: "urgent",
        title: `Encontraron a ${matchedPet.name}`,
        body: `${organization.displayName} detectó a ${matchedPet.name} por su microchip. Coordiná la devolución.`,
        ctaLabel: "Coordinar devolución",
        ctaUrl: `/mis-mascotas/${matchedPetToken}/devolucion`,
        relatedPetId: matchedPet.id,
        relatedEventId: intakeEvent.id,
      });
    }
  });

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, custodyEventId };
}
