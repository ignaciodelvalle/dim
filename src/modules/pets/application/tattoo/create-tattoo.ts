// Use-case: createTattooForUser — strangler migration 34/61.
//
// Pure writer: receives petId + userId + eventAuthorship + input, runs the DB
// transaction, and returns the result. No Next.js request context.
//
// The outer shim (app/actions/tattoo.ts) gates via requireAlivePetAccess.
// Tests call createTattooForUser directly with a known userId.

import { attachments, db, petEvents, petIdentifications } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import type { PetEventAuthorship } from "@/lib/infra/pet-access";
import { normalizeTattooCode } from "@/lib/infra/tattoo-lookup";

import type { CreateTattooResult, TattooInput, TattooLocation } from "./types";

export const VALID_LOCATIONS: readonly TattooLocation[] = [
  "inner_ear_left",
  "inner_ear_right",
  "inner_thigh",
  "belly",
  "other",
];

// Inner writer — testable without Next.js request context. The outer action
// resolves access + uploads the photo + delegates here. Photo upload happens
// outside the transaction so a failed insert doesn't leak orphan bytes; the
// outer action cleans up on failure.
export async function createTattooForUser(
  petId: string,
  userId: string,
  eventAuthorship: PetEventAuthorship,
  input: TattooInput,
): Promise<CreateTattooResult> {
  const normalizedCode = normalizeTattooCode(input.code);
  if (!normalizedCode) return { error: "Falta el código del tatuaje." };

  if (input.location !== null && !VALID_LOCATIONS.includes(input.location)) {
    return { error: "Ubicación del tatuaje inválida." };
  }

  const now = new Date();
  const recordedAtIso = input.recordedAt ? input.recordedAt.toISOString().slice(0, 10) : null;

  try {
    const result = await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("tattoo_recorded", {
        tattoo_code: normalizedCode,
        location_on_body: input.location,
        description: input.description,
        recorded_by: input.recordedBy,
        recorded_at: recordedAtIso,
        tattoo_date_known: input.recordedAt !== null,
      });

      const [event] = await tx
        .insert(petEvents)
        .values({
          petId,
          eventType: "tattoo_recorded",
          occurredAt: input.recordedAt ?? now,
          recordedAt: now,
          recordedByUserId: userId,
          ...eventAuthorship,
          payload: eventPayload,
        })
        .returning();

      const [attachment] = await tx
        .insert(attachments)
        .values({
          petId,
          eventId: event.id,
          uploadedByUserId: userId,
          storagePath: input.uploadedAttachment.path,
          mimeType: input.uploadedAttachment.mimeType,
          fileSize: input.uploadedAttachment.size,
        })
        .returning();

      // Canonical write to pet_identifications (legacy pets.* tattoo columns
      // removed — ARCH-R. Migration 0084 drops the columns next PR).
      await tx.insert(petIdentifications).values({
        petId,
        kind: "tattoo",
        code: normalizedCode,
        recordedAt: recordedAtIso ?? now.toISOString().slice(0, 10),
        recordedByUserId: userId,
        recordedByLabel: input.recordedBy,
        photoId: attachment.id,
        tattooLocation: input.location,
        tattooDescription: input.description,
      });

      return { ok: true as const, eventId: event.id };
    });

    return result;
  } catch (err) {
    return {
      error: `No se pudo registrar el tatuaje: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }
}
