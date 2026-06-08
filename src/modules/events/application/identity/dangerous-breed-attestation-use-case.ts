// Use-case: createDangerousBreedAttestation
//
// Migrated from app/actions/events.ts::createDangerousBreedAttestationAction (inner tx block).
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Parity:
//   - PLAIN insertEvent (NOT insertEventIdempotent) — non-idempotent by design.
//     There is no clientIdempotencyKey for this event type.
//   - Attachment inserted when uploadedPath provided.
//   - markPppReminderRead: any unread ppp_registration_reminder for this pet
//     is auto-marked read (spec: "the notification is auto-marked-read").
//   - No outbox. No audit_log.

import { validateEventPayload } from "@/lib/event-schemas";

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { UseCaseResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateDangerousBreedAttestationInput = {
  pet: { id: string };
  user: { id: string };
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  registry: string;
  registryId: string | null;
  attestedAt: Date;
  notes: string | null;
  uploadedPath: string | null;
  uploadedMimeType: string | null;
  uploadedSize: number | null;
};

type Deps = {
  repo: Pick<EventsRepository, "insertEvent" | "insertAttachment" | "markPppReminderRead">;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createDangerousBreedAttestation(
  input: CreateDangerousBreedAttestationInput,
  deps: Deps,
): Promise<UseCaseResult<{ eventId: string }>> {
  const {
    pet,
    user,
    eventAuthorship,
    registry,
    registryId,
    attestedAt,
    notes,
    uploadedPath,
    uploadedMimeType,
    uploadedSize,
  } = input;
  const { repo, transaction } = deps;

  const now = new Date();

  const eventId = await transaction(async (tx) => {
    // Single insert — payload is final. PLAIN insert: no idempotency key.
    // attached_documents is NOT stored in the payload: the attachments table
    // already provides the join via event_id (same pattern as
    // sterilization / microchip / vaccination, preserving append-only discipline).
    const eventPayload = validateEventPayload("dangerous_breed_attested", {
      registry,
      registry_id: registryId,
      attested_at: attestedAt.toISOString().slice(0, 10),
    });

    const event = await repo.insertEvent(
      {
        petId: pet.id,
        eventType: "dangerous_breed_attested",
        occurredAt: attestedAt,
        recordedAt: now,
        recordedByUserId: user.id,
        ...eventAuthorship,
        payload: eventPayload,
        notes,
      } as Parameters<typeof repo.insertEvent>[0],
      tx as Parameters<typeof repo.insertEvent>[1],
    );

    if (uploadedPath) {
      await repo.insertAttachment(
        {
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: uploadedPath,
          mimeType: uploadedMimeType ?? "image/jpeg",
          fileSize: uploadedSize ?? 0,
        },
        tx as Parameters<typeof repo.insertAttachment>[1],
      );
    }

    // Mark any unread ppp_registration_reminder for this pet as read.
    // The owner just acted on it — spec: "the notification is auto-marked-read".
    await repo.markPppReminderRead(
      user.id,
      pet.id,
      now,
      tx as Parameters<typeof repo.markPppReminderRead>[3],
    );

    return event.id;
  });

  return { ok: true, value: { eventId }, notifications: [] };
}
