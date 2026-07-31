// Use-case: confirmChipMatchAsVecinoWriter — vecino path for chip-match confirmation
// (strangler migration 21/61).
//
// Vecino-side confirmation: a regular user actor sees a matched pet after a microchip
// cross-check while registering a found stray and decides whether it's the same animal.
//
// decision='same': inserts shelter_custody ownership for the vecino +
//   shelter_intake_recorded event + chip_match_notification_owner notification
//   (post-tx, best-effort).
// decision='not_same': emits a dismissal note_added event. No state change.
//
// §2.2: notifications accumulate in pendingNotifications[] inside the tx
// and are inserted AFTER the transaction commits (best-effort, logged on failure).

import { db, notifications, ownerships, petEvents, petIdentifications, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { generateForceToken } from "@/lib/infra/microchip-force-token";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { ConfirmChipMatchResult } from "./types";

export async function confirmChipMatchAsVecinoWriter({
  userId,
  matchedPetToken,
  decision,
  notes,
}: {
  userId: string;
  matchedPetToken: string;
  decision: "same" | "not_same";
  notes?: string;
}): Promise<ConfirmChipMatchResult> {
  const now = new Date();

  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .where(eq(pets.publicToken, matchedPetToken))
    .limit(1);

  if (!petRow) return { error: "Mascota no encontrada." };
  const matchedPet = petRow.pet;

  if (decision === "not_same") {
    const notePayload = validateEventPayload("note_added", {
      category: null,
      text: "Un vecino descartó posible coincidencia de chip al registrar una mascota encontrada. Sin cambios de estado.",
    });
    await db.insert(petEvents).values({
      petId: matchedPet.id,
      eventType: "note_added",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: userId,
      authorRole: "owner",
      payload: notePayload,
    });

    // Mint the adjudication receipt (RA-2 F6). Until this existed, "No es la
    // misma" wrote this note and returned bare `ok` — the vecino was sent back
    // to /mis-mascotas/nueva, re-entered the same chip, and createPetAction ran
    // the identical cross-check and bounced them straight back here. A closed
    // loop on the product's central use case: a neighbour who finds a lost
    // animal could never finish registering it.
    //
    // The code is read from the MATCHED pet's canonical identification rather
    // than taken from the caller, so this endpoint cannot be used to mint a
    // bypass for an arbitrary chip: the token only ever signs a code that a
    // confirmation page actually showed this user.
    const [chipRow] = await db
      .select({ code: petIdentifications.code })
      .from(petIdentifications)
      .where(
        and(
          eq(petIdentifications.petId, matchedPet.id),
          eq(petIdentifications.kind, "microchip_iso"),
          eq(petIdentifications.status, "active"),
        ),
      )
      .limit(1);

    // No canonical chip on the matched record → nothing to adjudicate, and
    // nothing safe to sign. The vecino still lands back on the alta; the plain
    // form works because there is no code to collide with.
    const conflictingChip = chipRow?.code;
    if (!conflictingChip) return { ok: true };
    return {
      ok: true,
      chipConflict: {
        microchipId: conflictingChip,
        forceToken: generateForceToken(conflictingChip),
      },
    };
  }

  // decision === 'same'
  if (matchedPet.status !== "lost") {
    return {
      error: `La mascota ya no está en estado 'perdida' (estado actual: ${matchedPet.status}). No se puede crear la custodia.`,
    };
  }

  // Idempotency guard (projection-writes audit §6): confirming the match does
  // NOT flip the pet's status, so the state check above cannot block a
  // double-submit. If this vecino already holds active shelter_custody on the
  // matched pet, the confirmation already happened — no-op.
  const [existingCustody] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, matchedPet.id),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (existingCustody) return { ok: true };

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
    // TOCTOU guard: serialize concurrent confirmations on the same pet (same
    // advisory-lock pattern as the return-to-owner writers), then re-verify
    // custody inside the tx so a double-click cannot insert twice.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${matchedPet.id}))`);
    const [custodyInTx] = await tx
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, matchedPet.id),
          eq(ownerships.ownerUserId, userId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    if (custodyInTx) return;

    // 1. Insert shelter_custody for the vecino.
    await tx.insert(ownerships).values({
      petId: matchedPet.id,
      ownerUserId: userId,
      role: "shelter_custody",
      startedAt: now,
    });

    // 2. Emit shelter_intake_recorded event.
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
        recordedByUserId: userId,
        authorRole: "owner",
        payload: intakePayload,
      })
      .returning({ id: petEvents.id });
    custodyEventId = intakeEvent.id;

    // 3. Notify the original owner.
    if (ownerOwnership?.ownerUserId) {
      pendingNotifications.push({
        userId: ownerOwnership.ownerUserId,
        notificationType: "chip_match_notification_owner",
        severity: "urgent",
        title: `Encontraron a ${matchedPet.name}`,
        body: `Un vecino detectó a ${matchedPet.name} por su microchip. Coordiná la devolución.`,
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
      // Web Push leg (ADR 2026-07-18 §4): urgent custodia, best-effort, never throws.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, custodyEventId };
}
