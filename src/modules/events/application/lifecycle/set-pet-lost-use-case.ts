// Use-case: setPetLost (writer + types)
//
// Migrated from app/actions/events.ts::setPetLostWriter + setPetLostAction.
//
// AUTH: requirePetAccess (accepts deceased/lost) at the action layer.
//   This writer is auth-agnostic (exported for integration tests without Next.js).
//
// Parity:
//   - Guard: status=lost → error "ya perdida"; status=deceased → error "fallecida".
//   - openCase(lost_pet_episode) INSIDE tx.
//   - PLAIN insert of status_changed with disclosure_prefs_snapshot + optional lost_description.
//   - updatePetLostProjection: status=lost + 5 disclosure cols + optional color/distinguishingFeatures.
//   - Retroactive microchip: ONLY when validatedRetroChipId && !petMicrochipId.
//     Validation via validateMicrochipId BEFORE the tx (error before any write).
//   - Retroactive tattoo: ONLY when rawTattooCode && !petTattooCode AND normalizeTattooCode succeeds.
//   - broadcastLostPet post-tx (best-effort) when petPublicToken is provided.
//   - Result: { error: null | string }

import "server-only";

import { openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { writePoint } from "@/lib/location";
import { validateMicrochipId } from "@/lib/microchip-validation";
import { normalizeTattooCode } from "@/lib/tattoo-lookup";

import type { DisclosurePrefsInput } from "../../domain/disclosure-prefs";
import { parseDisclosurePrefsSnapshot } from "../../domain/disclosure-prefs";
import type { EventsRepository } from "../../infrastructure/events-repository";

type CaseExecutor = Parameters<typeof openCase>[1];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { DisclosurePrefsInput };

export type EnrichedLostDescriptionInput = {
  color: string | null;
  distinguishingFeatures: string | null;
  accessoriesWhenLost: string | null;
  behaviorNotes: string | null;
  lastSeenContext: string | null;
  microchipId: string | null;
  tattooCode?: string | null;
  tattooLocation?: string | null;
  tattooDescription?: string | null;
};

export type SetPetLostWriterParams = {
  petId: string;
  petPublicToken?: string;
  petName?: string;
  petStatus: string;
  petMicrochipId?: string | null;
  petTattooCode?: string | null;
  petSpecies?: string | null;
  petBreed?: string | null;
  petColor?: string | null;
  petJurisdictionProvince?: string | null;
  petJurisdictionLocality?: string | null;
  ownerUserId?: string;
  ownerDisplayName?: string;
  fromStatus: string;
  recordedByUserId: string;
  eventAuthorship: Record<string, unknown>;
  locationDescription: string | null;
  locationLat: string | null;
  locationLng: string | null;
  reason: string | null;
  disclosurePrefs: DisclosurePrefsInput;
  enrichedDescription?: EnrichedLostDescriptionInput | null;
  now?: Date;
};

export type SetPetLostWriterResult = { error: string | null };

// biome-ignore lint/suspicious/noExplicitAny: broadcastLostPet accepts typed PetForBroadcast; we pass any-typed shapes from the writer
type BroadcastFn = (db: any, pet: any, owner: any, lastLocation: any) => Promise<any>;

type Deps = {
  repo: Pick<
    EventsRepository,
    "insertEvent" | "updatePetLostProjection" | "updateMicrochipBackfill"
  >;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  broadcastLostPet: BroadcastFn;
};

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Core write path for marking a pet as lost.
 * Exported so integration tests can call it without the Next.js request context.
 * Same logic as setPetLostAction minus auth + form parsing + redirect.
 */
export async function setPetLostWriter(
  params: SetPetLostWriterParams,
  deps: Deps,
): Promise<SetPetLostWriterResult> {
  const {
    petId,
    petPublicToken = "",
    petName = "",
    petStatus,
    petMicrochipId = null,
    petTattooCode = null,
    petSpecies = null,
    petBreed = null,
    petColor = null,
    petJurisdictionProvince = null,
    petJurisdictionLocality = null,
    ownerUserId = "",
    ownerDisplayName = "",
    fromStatus,
    recordedByUserId,
    eventAuthorship,
    locationDescription,
    locationLat,
    locationLng,
    reason,
    disclosurePrefs,
    enrichedDescription = null,
    now = new Date(),
  } = params;

  if (petStatus === "lost") return { error: "Esta mascota ya está marcada como perdida." };
  if (petStatus === "deceased")
    return { error: "No se puede cambiar el estado de una mascota fallecida." };

  const {
    discloseFirstNameWhenLost,
    disclosePhoneWhenLost,
    discloseEmailWhenLost,
    discloseLastLocationWhenLost,
    allowFinderFormWhenLost,
  } = disclosurePrefs;

  const disclosurePrefsSnapshot = parseDisclosurePrefsSnapshot(disclosurePrefs);

  const { locationLat: latVal, locationLng: lngVal } = writePoint(
    locationLat && locationLng
      ? { lat: Number.parseFloat(locationLat), lng: Number.parseFloat(locationLng) }
      : null,
  );

  // Build lost_description if at least one incident snapshot field is provided.
  const hasIncidentSnapshot =
    enrichedDescription?.accessoriesWhenLost ||
    enrichedDescription?.behaviorNotes ||
    enrichedDescription?.lastSeenContext;

  const lostDescription = hasIncidentSnapshot
    ? {
        accessories_when_lost: enrichedDescription?.accessoriesWhenLost ?? null,
        behavior_notes: enrichedDescription?.behaviorNotes ?? null,
        last_seen_context: enrichedDescription?.lastSeenContext ?? null,
      }
    : null;

  // Validate retroactive chip format BEFORE the transaction (error before any DB write).
  const rawRetroChipId = enrichedDescription?.microchipId?.trim() || null;
  let validatedRetroChipId: string | null = null;
  if (rawRetroChipId) {
    const chipValidation = validateMicrochipId(rawRetroChipId);
    if (!chipValidation.ok) {
      return { error: "INVALID_MICROCHIP_FORMAT" };
    }
    validatedRetroChipId = chipValidation.normalized;
  }

  try {
    await deps.transaction(async (tx) => {
      // Open a lost_pet_episode case atomically with the status_changed event.
      const caseRow = await openCase(
        {
          kind: "lost_pet_episode",
          primarySubjectKind: "registered_pet",
          primaryPetId: petId,
          jurisdictionProvince: petJurisdictionProvince,
          jurisdictionLocality: petJurisdictionLocality,
          openedByUserId: recordedByUserId,
          openedReason: `Pet ${petPublicToken || petId} marked as lost by owner${reason ? ` — ${reason}` : ""}`,
        },
        tx as CaseExecutor,
      );

      const eventPayload = validateEventPayload("status_changed", {
        from_status: fromStatus as "active" | "lost" | "deceased",
        to_status: "lost",
        location_description: locationDescription,
        reason,
        disclosure_prefs_snapshot: disclosurePrefsSnapshot,
        ...(lostDescription !== null ? { lost_description: lostDescription } : {}),
      });

      await deps.repo.insertEvent(
        {
          petId,
          eventType: "status_changed",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId,
          ...(eventAuthorship as object),
          locationLat: latVal,
          locationLng: lngVal,
          payload: eventPayload,
          caseId: caseRow.id,
        } as Parameters<typeof deps.repo.insertEvent>[0],
        tx as Parameters<typeof deps.repo.insertEvent>[1],
      );

      // Update status + 5 disclosure preference columns + optional identity fields.
      await deps.repo.updatePetLostProjection(
        petId,
        {
          status: "lost",
          discloseFirstNameWhenLost,
          disclosePhoneWhenLost,
          discloseEmailWhenLost,
          discloseLastLocationWhenLost,
          allowFinderFormWhenLost,
          ...(enrichedDescription?.color != null
            ? { color: enrichedDescription.color || null }
            : {}),
          ...(enrichedDescription?.distinguishingFeatures != null
            ? { distinguishingFeatures: enrichedDescription.distinguishingFeatures || null }
            : {}),
        },
        now,
        tx as Parameters<typeof deps.repo.updatePetLostProjection>[3],
      );

      // Retroactive microchip capture — only when validated chip AND pet had no chip before.
      if (validatedRetroChipId && !petMicrochipId) {
        const newChipId = validatedRetroChipId;
        const microchipPayload = validateEventPayload("microchip_implanted", {
          chip_number: newChipId,
          country_code: null,
          implanted_by: null,
          location_on_body: null,
        });

        await deps.repo.insertEvent(
          {
            petId,
            eventType: "microchip_implanted",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId,
            ...(eventAuthorship as object),
            payload: microchipPayload,
          } as Parameters<typeof deps.repo.insertEvent>[0],
          tx as Parameters<typeof deps.repo.insertEvent>[1],
        );

        await deps.repo.updateMicrochipBackfill(
          petId,
          {
            microchipId: newChipId,
            microchipCountryCode: null,
            microchipImplantedAt: null,
            microchipImplantedBy: null,
            microchipLocation: null,
          },
          now,
          tx as Parameters<typeof deps.repo.updateMicrochipBackfill>[3],
        );
      }

      // Retroactive tattoo capture — only when code provided AND pet had no tattoo before.
      const rawRetroTattooCode = enrichedDescription?.tattooCode?.trim() || null;
      if (rawRetroTattooCode && !petTattooCode) {
        const normalizedTattoo = normalizeTattooCode(rawRetroTattooCode);
        if (normalizedTattoo) {
          const rawLoc = enrichedDescription?.tattooLocation ?? null;
          const validLocations: readonly string[] = [
            "inner_ear_left",
            "inner_ear_right",
            "inner_thigh",
            "belly",
            "other",
          ];
          const tattooLoc = rawLoc && validLocations.includes(rawLoc) ? rawLoc : null;
          const tattooDesc = enrichedDescription?.tattooDescription?.trim() || null;

          const tattooPayload = validateEventPayload("tattoo_recorded", {
            tattoo_code: normalizedTattoo,
            location_on_body: tattooLoc as
              | "inner_ear_left"
              | "inner_ear_right"
              | "inner_thigh"
              | "belly"
              | "other"
              | null,
            description: tattooDesc,
            recorded_by: null,
            recorded_at: null,
            tattoo_date_known: false,
          });

          await deps.repo.insertEvent(
            {
              petId,
              eventType: "tattoo_recorded",
              occurredAt: now,
              recordedAt: now,
              recordedByUserId,
              ...(eventAuthorship as object),
              payload: tattooPayload,
            } as Parameters<typeof deps.repo.insertEvent>[0],
            tx as Parameters<typeof deps.repo.insertEvent>[1],
          );

          // We reuse updatePetLostProjection is not the right method here — need direct update.
          // The original code does a direct tx.update(pets).set({tattooCode,...}).
          // Since EventsRepository doesn't have a tattoo update method, we use the repo's
          // updateMicrochipBackfill pattern — but for tattoo. We call tx directly (the tx
          // is opaque `unknown` here). The original does this via db.transaction tx which IS
          // the drizzle executor, so we cast and call update on it.
          // Per design: "reuse existing pure modules — do not rewrite them".
          // We need to accept `tx` as the Drizzle executor here.
          const { pets } = await import("@/db");
          const { eq } = await import("drizzle-orm");
          await (tx as { update: typeof import("@/db").db.update })
            .update(pets)
            .set({
              tattooCode: normalizedTattoo,
              tattooLocation: tattooLoc,
              tattooDescription: tattooDesc,
              updatedAt: now,
            })
            .where(eq(pets.id, petId));
        }
      }
    });
  } catch (err) {
    return {
      error: `No se pudo marcar como perdida: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // Broadcast post-tx — best-effort (failure non-fatal).
  if (petPublicToken) {
    const broadcastColor =
      enrichedDescription?.color != null ? enrichedDescription.color || null : petColor;

    try {
      const { db } = await import("@/db");
      await deps.broadcastLostPet(
        db,
        {
          id: petId,
          publicToken: petPublicToken,
          name: petName,
          species: petSpecies,
          breed: petBreed,
          color: broadcastColor,
          jurisdictionProvince: petJurisdictionProvince,
          jurisdictionLocality: petJurisdictionLocality,
        },
        { id: ownerUserId, displayName: ownerDisplayName },
        null,
      );
    } catch (err) {
      console.error("[setPetLost] broadcast failed (non-fatal):", err);
    }
  }

  return { error: null };
}
