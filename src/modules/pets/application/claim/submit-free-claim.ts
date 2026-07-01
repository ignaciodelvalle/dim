// Use-case: submitFreeClaimForUser (variant D)
//
// Direct claim of a pet with NO active custody of any role. Opens a fresh
// owner ownership + ownership_claimed event in one tx. The pet row is locked
// (SELECT ... FOR UPDATE) so two concurrent claims on the same pet serialize
// and the second one fails the re-check.

import { and, eq, isNull } from "drizzle-orm";

import { auditLog, db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";

import type { FreeClaimResult } from "./types";

// Distinguishes intentional user-facing guard failures from unexpected DB
// errors so the latter are never surfaced verbatim to the client.
class FreeClaimGuardError extends Error {}

export async function submitFreeClaimForUser(
  userId: string,
  input: {
    petToken: string;
    identifierKind: "microchip" | "tattoo";
  },
): Promise<FreeClaimResult> {
  // Rate limit — same key as lookup so a burst of probes counts together.
  try {
    await enforceRateLimit("claim_lookup", userId, { maxPerMinute: 30, maxPerHour: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "Demasiados intentos. Probá en unos minutos." };
    }
    throw err;
  }

  try {
    const claimed = await db.transaction(async (tx) => {
      const [pet] = await tx
        .select({
          id: pets.id,
          name: pets.name,
          status: pets.status,
          inCustodyDispute: pets.inCustodyDispute,
        })
        .from(pets)
        .where(eq(pets.publicToken, input.petToken))
        .limit(1)
        .for("update");
      if (!pet) throw new FreeClaimGuardError("No encontramos la mascota.");
      if (pet.status === "deceased") {
        throw new FreeClaimGuardError("Esta mascota figura como fallecida en MiMAR.");
      }
      if (pet.status === "lost") {
        throw new FreeClaimGuardError(
          "Esta mascota figura como perdida. Si la encontraste, reportá un avistaje.",
        );
      }
      if (pet.inCustodyDispute) {
        throw new FreeClaimGuardError("Hay una disputa abierta para esta mascota.");
      }

      // Re-check inside the tx (the lookup result may be stale).
      const [activeCustody] = await tx
        .select({ id: ownerships.id })
        .from(ownerships)
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
        .limit(1);
      if (activeCustody) {
        throw new FreeClaimGuardError(
          "Esta mascota ya tiene una custodia activa. Podés iniciar una disputa.",
        );
      }

      const now = new Date();
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: userId,
        role: "owner",
        startedAt: now,
      });

      const payload = validateEventPayload("ownership_claimed", {
        claimed_by_user_id: userId,
        identifier_kind: input.identifierKind,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "ownership_claimed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: "owner",
        payload,
      });

      await tx.insert(notifications).values({
        userId: userId,
        notificationType: "free_pet_claimed",
        title: `${pet.name} ahora está a tu nombre`,
        body: "Registramos la mascota a tu nombre. Ya podés ver su credencial y completar su libreta sanitaria.",
        severity: "info",
        relatedPetId: pet.id,
        ctaLabel: "Ver mi mascota",
        ctaUrl: `/mis-mascotas/${input.petToken}`,
        category: "custody",
      });

      await tx.insert(auditLog).values({
        actorUserId: userId,
        action: "free_pet_claimed",
        payload: {
          pet_id: pet.id,
          identifier_kind: input.identifierKind,
        },
      });

      return { petName: pet.name };
    });

    return { petToken: input.petToken, petName: claimed.petName };
  } catch (err) {
    if (err instanceof FreeClaimGuardError) {
      return { error: err.message };
    }
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo completar el reclamo: ${message}` };
  }
}
