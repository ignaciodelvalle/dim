"use server";

// confirmChipMatchAction — Lost & Found Fase 2.
//
// Called from the match confirmation pages (refugio: /org/[orgToken]/intake/match/[token]
// and vecino: /mis-mascotas/nueva/match/[token]) after the actor sees the matched
// pet card and decides.
//
// decision='same':
//   - Validates the actor has access (org member with intake.create for refugio,
//     authenticated user for vecino).
//   - Looks up the matched pet; it must still be status='lost'.
//   - In a single transaction:
//       1. Inserts Ownership(role='shelter_custody') for the actor (parallel to
//          the original owner's Ownership — both remain active).
//       2. Emits shelter_intake_recorded event on the matched pet.
//       3. Notifies the original owner: type='chip_match_notification_owner'.
//
// decision='not_same':
//   - Emits a note_added event on the matched pet marking the dismissal.
//   - No state change; no ownership created.
//
// Returns { ok: true } on success or { error: string } on failure.

import {
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, eq, isNull } from "drizzle-orm";

export type ConfirmChipMatchResult = { ok: true; custodyEventId?: string } | { error: string };

export async function confirmChipMatchAction({
  matchedPetToken,
  actorMode,
  orgToken,
  decision,
  notes,
}: {
  matchedPetToken: string;
  actorMode: "refugio" | "vecino";
  orgToken?: string;
  decision: "same" | "not_same";
  notes?: string;
}): Promise<ConfirmChipMatchResult> {
  // ---------------------------------------------------------------------------
  // Auth validation
  // ---------------------------------------------------------------------------

  if (actorMode === "refugio") {
    if (!orgToken) {
      return { error: "orgToken requerido para actorMode='refugio'." };
    }
    const auth = await requireCapability("intake.create");
    if (auth.error !== null) return { error: auth.error };
    return confirmChipMatchAsRefugioWriter({ auth, orgToken, matchedPetToken, decision, notes });
  }

  if (actorMode === "vecino") {
    const session = await requireUserOrRedirect();
    return confirmChipMatchAsVecinoWriter({
      userId: session.user.id,
      matchedPetToken,
      decision,
      notes,
    });
  }

  return { error: "actorMode inválido. Debe ser 'refugio' o 'vecino'." };
}

// ---------------------------------------------------------------------------
// Refugio path — exported for direct test access (no session required).
// Mirrors the writer/wrapper pattern from app/actions/upgrade.ts.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Vecino path — exported for direct test access (no session required).
// ---------------------------------------------------------------------------

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
    return { ok: true };
  }

  // decision === 'same'
  if (matchedPet.status !== "lost") {
    return {
      error: `La mascota ya no está en estado 'perdida' (estado actual: ${matchedPet.status}). No se puede crear la custodia.`,
    };
  }

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
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  return { ok: true, custodyEventId };
}
