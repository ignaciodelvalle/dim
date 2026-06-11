// Use-case: createMicrochip
//
// Migrated from app/actions/events.ts::createMicrochipAction (inner tx block).
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Parity:
//   - Uses insertEventIdempotent; wasNoop=true → skip ALL side-effects.
//   - Attachment inserted when uploadedPath provided.
//   - PROJECTION: updateMicrochipBackfill called ONLY when pet.microchipId is null.
//     The repository method also guards on null via WHERE clause — double safety.
//   - No outbox. No audit_log.

import { validateEventPayload } from "@/lib/event-schemas";
import { chipImplantSiteFromLocation } from "@/src/modules/pets/domain/pet-rules";

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { UseCaseResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateMicrochipInput = {
  pet: { id: string; microchipId: string | null };
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
    | "insertEventIdempotent"
    | "insertAttachment"
    | "updateMicrochipBackfill"
    | "insertIdentification"
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

    // Back-fill denormalized microchip columns on the pets row ONLY if
    // the pet had no chip before (never overwrite existing data).
    // The repository method also filters by WHERE microchipId IS NULL as
    // a second safety layer.
    if (!pet.microchipId) {
      await repo.updateMicrochipBackfill(
        pet.id,
        {
          microchipId: chipNumber,
          microchipCountryCode: countryCode,
          microchipImplantedAt: occurredAt.toISOString().slice(0, 10),
          microchipImplantedBy: implantedBy,
          microchipLocation: locationOnBody,
        },
        now,
        tx as Parameters<typeof repo.updateMicrochipBackfill>[3],
      );

      // Canonical dual-write — insert active microchip row in pet_identifications.
      // Only when the pet had no prior chip (same guard as the pets column
      // backfill); insertIdentification itself skips if an active row exists.
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
