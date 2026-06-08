// Use-case: createDeworming
//
// Migrated from app/actions/events.ts::createDewormingAction (inner tx block).
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Parity:
//   - Uses insertEventIdempotent; wasNoop=true → skip ALL side-effects.
//   - Deworming reminder created when nextDueAt provided.
//   - Attachment inserted when uploadedPath provided.
//   - No outbox. No audit_log.

import { validateEventPayload } from "@/lib/event-schemas";

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { UseCaseResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateDewormingInput = {
  pet: { id: string; name: string };
  user: { id: string };
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  product: string;
  type: string;
  occurredAt: Date;
  nextDueAt: Date | null;
  notes: string | null;
  uploadedPath: string | null;
  uploadedMimeType: string | null;
  uploadedSize: number | null;
  clientIdempotencyKey: string | null;
};

type Deps = {
  repo: Pick<EventsRepository, "insertEventIdempotent" | "insertAttachment" | "insertReminders">;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createDeworming(
  input: CreateDewormingInput,
  deps: Deps,
): Promise<UseCaseResult<{ eventId: string }>> {
  const {
    pet,
    user,
    eventAuthorship,
    product,
    type,
    occurredAt,
    nextDueAt,
    notes,
    uploadedPath,
    uploadedMimeType,
    uploadedSize,
    clientIdempotencyKey,
  } = input;
  const { repo, transaction } = deps;

  const now = new Date();

  const eventId = await transaction(async (tx) => {
    const eventPayload = validateEventPayload("deworming_administered", {
      product,
      type,
      next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
    });

    const { event, wasNoop } = await repo.insertEventIdempotent(
      {
        petId: pet.id,
        eventType: "deworming_administered",
        occurredAt,
        recordedAt: now,
        recordedByUserId: user.id,
        ...eventAuthorship,
        payload: eventPayload,
        notes,
        clientIdempotencyKey,
      } as Parameters<typeof repo.insertEventIdempotent>[0],
      tx as Parameters<typeof repo.insertEventIdempotent>[1],
    );

    if (wasNoop) return event.id;

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

    if (nextDueAt) {
      await repo.insertReminders(
        [
          {
            petId: pet.id,
            userId: user.id,
            reminderType: "deworming",
            dueAt: nextDueAt,
            title: `Refuerzo antiparasitario: ${product}`,
            description: `Próxima dosis programada para ${pet.name}.`,
            sourceEventId: event.id,
          },
        ],
        tx as Parameters<typeof repo.insertReminders>[1],
      );
    }

    return event.id;
  });

  return { ok: true, value: { eventId }, notifications: [] };
}
