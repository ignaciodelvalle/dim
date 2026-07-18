// Use-case: createMicrochip
//
// Migrated from app/actions/events.ts::createMicrochipAction (inner tx block).
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Parity:
//   - Uses insertEventIdempotent; wasNoop=true → skip ALL side-effects.
//   - Attachment inserted when uploadedPath provided.
//   - ARCH-R: legacy updateMicrochipBackfill (pets.microchipId column) removed.
//     Canonical row written to pet_identifications via insertIdentification.
//   - ARCH-S: pet.microchipId replaced by petHasCanonicalChip (pre-resolved by
//     caller from pet_identifications) so no legacy column is needed.
//   - No outbox. No audit_log.

import { chipImplantSiteFromLocation } from "@/lib/domain/microchip-implant-site";
import { validateEventPayload } from "@/lib/events/event-schemas";

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { UseCaseResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateMicrochipInput = {
  pet: { id: string; petHasCanonicalChip: boolean };
  user: { id: string };
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  chipNumber: string;
  countryCode: string | null;
  implantedBy: string | null;
  locationOnBody: string | null;
  occurredAt: Date;
  notes: string | null;
  uploadedPath: string | null;
  uploadedMimeType: string | null;
  uploadedSize: number | null;
  clientIdempotencyKey: string | null;
};

type Deps = {
  repo: Pick<
    EventsRepository,
    "insertEventIdempotent" | "insertAttachment" | "insertIdentification"
  >;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createMicrochip(
  input: CreateMicrochipInput,
  deps: Deps,
): Promise<UseCaseResult<{ eventId: string }>> {
  const {
    pet,
    user,
    eventAuthorship,
    chipNumber,
    countryCode,
    implantedBy,
    locationOnBody,
    occurredAt,
    notes,
    uploadedPath,
    uploadedMimeType,
    uploadedSize,
    clientIdempotencyKey,
  } = input;
  const { repo, transaction } = deps;

  const now = new Date();

  const eventId = await transaction(async (tx) => {
    const eventPayload = validateEventPayload("microchip_implanted", {
      chip_number: chipNumber,
      country_code: countryCode,
      implanted_by: implantedBy,
      location_on_body: locationOnBody,
    });

    const { event, wasNoop } = await repo.insertEventIdempotent(
      {
        petId: pet.id,
        eventType: "microchip_implanted",
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

    // Insert canonical microchip row in pet_identifications.
    // Only when the pet had no prior chip; insertIdentification itself skips
    // if an active row already exists (re-sync guard).
    // ARCH-R: legacy pets.microchipId write removed.
    // ARCH-S: guard uses petHasCanonicalChip (pre-resolved from pet_identifications by caller).
    if (!pet.petHasCanonicalChip) {
      const implantSite = chipImplantSiteFromLocation(locationOnBody);
      await repo.insertIdentification(
        {
          petId: pet.id,
          kind: "microchip_iso",
          code: chipNumber,
          recordedAt: occurredAt.toISOString().slice(0, 10),
          recordedByUserId: user.id,
          recordedByLabel: implantedBy,
          isoCountryCode: chipNumber.slice(0, 3),
          isoManufacturerCode: chipNumber.slice(3, 7),
          isoNationalId: chipNumber.slice(7, 15),
          isoCompliant: true,
          implantationSite: implantSite ?? undefined,
        },
        tx as Parameters<typeof repo.insertIdentification>[1],
      );
    }

    return event.id;
  });

  return { ok: true, value: { eventId }, notifications: [] };
}
