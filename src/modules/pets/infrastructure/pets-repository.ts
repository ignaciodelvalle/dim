// PetsRepository — thin Drizzle wrapper for pet domain writes.
// Accepts optional `tx` for use inside db.transaction() calls,
// mirroring the existing AdoptionRepository and openCase(input, tx) pattern.
// Returns domain shapes (not raw Drizzle row types).
// No auth logic — auth lives at the action edge.

import { eq } from "drizzle-orm";

import { attachments, type db, ownerships, petEvents, petIdentifications, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { generatePublicToken } from "@/lib/publicToken";
import { generateUniqueToken } from "@/lib/unique-token";
import type { DiffEntry } from "@/src/modules/pets/domain/pet-diff";
import {
  chipImplantSiteFromLocation,
  custodyKindToOwnershipRole,
  custodyKindToRegisteredPayloadKind,
} from "@/src/modules/pets/domain/pet-rules";
import type { ParsedPet } from "@/src/modules/pets/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AuthorRole = "owner" | "scanner" | "finder" | "vet" | "shelter" | "govt" | "system";

type EventAuthorship = {
  authorRole: AuthorRole;
  authorOrganizationId: string | null;
  authorVerified: boolean;
};

type InsertPetRegisteredArgs = {
  publicToken: string;
  parsed: ParsedPet;
  potentiallyDangerousBreed: boolean;
  uploadedPath: string | null;
  uploadMimeType: string | null;
  uploadSize: number | null;
  userId: string;
  now: Date;
};

type UpdatePetProfileArgs = {
  petId: string;
  parsed: ParsedPet;
  potentiallyDangerousBreed: boolean;
  changes: DiffEntry[];
  hasContentChanges: boolean;
  flagChanged: boolean;
  chipNewlyAdded: boolean;
  uploadedPath: string | null;
  uploadMimeType: string | null;
  uploadSize: number | null;
  userId: string;
  eventAuthorship: EventAuthorship;
  now: Date;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const PetsRepository = {
  /**
   * Generates a unique public token for a new pet (DIM-XXXX-XXXX format).
   * Uses the same advisory-check + retry pattern as the original createPetAction.
   */
  async generatePublicToken(): Promise<string> {
    return generateUniqueToken(pets, pets.publicToken, generatePublicToken);
  },

  /**
   * Composite atomic write for registering a new pet.
   * Must be called inside a db.transaction().
   *
   * Handles:
   *   - pets row insert
   *   - ownerships row (role depends on custodyKind)
   *   - optional attachment + primaryPhotoId update
   *   - pet_registered event (explicit snake_case payload)
   *   - if chip: microchip_implanted event + petIdentifications double-write
   */
  async insertPetRegistered(
    args: InsertPetRegisteredArgs,
    tx: Tx,
  ): Promise<{ petId: string; eventId: string }> {
    const {
      publicToken,
      parsed,
      potentiallyDangerousBreed,
      uploadedPath,
      uploadMimeType,
      uploadSize,
      userId,
      now,
    } = args;

    // Insert pet row.
    const [newPet] = await tx
      .insert(pets)
      .values({
        publicToken,
        name: parsed.name,
        species: parsed.species,
        sex: parsed.sex,
        breed: parsed.breed,
        dateOfBirth: parsed.dateOfBirth,
        birthDateIsEstimated: parsed.birthDateIsEstimated,
        color: parsed.color,
        microchipId: parsed.microchipId,
        microchipCountryCode: parsed.microchipCountryCode,
        microchipImplantedAt: parsed.microchipImplantedAt,
        microchipImplantedBy: parsed.microchipImplantedBy,
        microchipLocation: parsed.microchipLocation,
        estimatedWeightKg: parsed.estimatedWeightKg,
        favouriteFoods: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
        knownAllergies: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
        trainingLevel: parsed.trainingLevel,
        potentiallyDangerousBreed,
        insuranceCompany: parsed.insuranceCompany,
        insurancePolicyNumber: parsed.insurancePolicyNumber,
        jurisdictionProvince: parsed.jurisdictionProvince,
        jurisdictionLocality: parsed.jurisdictionLocality,
        acquisitionMethod: parsed.acquisitionMethod,
        emergencyInfoVisible: parsed.emergencyInfoVisible,
        permanentConditions: parsed.permanentConditions,
        permanentConditionsOther: parsed.permanentConditionsOther,
        discloseConditionsPublicly: parsed.discloseConditionsPublicly,
      })
      .returning();

    // Ownership row — custodyKind drives the role.
    const ownershipRole = custodyKindToOwnershipRole(parsed.custodyKind);
    await tx.insert(ownerships).values({
      petId: newPet.id,
      ownerUserId: userId,
      role: ownershipRole,
      startedAt: now,
    });

    // Optional photo attachment + primaryPhotoId update.
    if (uploadedPath) {
      const [attachment] = await tx
        .insert(attachments)
        .values({
          petId: newPet.id,
          uploadedByUserId: userId,
          storagePath: uploadedPath,
          mimeType: uploadMimeType ?? "image/jpeg",
          fileSize: uploadSize ?? 0,
        })
        .returning();
      await tx.update(pets).set({ primaryPhotoId: attachment.id }).where(eq(pets.id, newPet.id));
    }

    // pet_registered event — explicit snake_case payload (no spread of ParsedPet).
    const petRegisteredPayload = validateEventPayload("pet_registered", {
      name: parsed.name,
      species: parsed.species,
      sex: parsed.sex,
      breed: parsed.breed,
      date_of_birth: parsed.dateOfBirth,
      birth_date_is_estimated: parsed.birthDateIsEstimated,
      color: parsed.color,
      microchip_id: parsed.microchipId,
      microchip_country_code: parsed.microchipCountryCode,
      microchip_implanted_at: parsed.microchipImplantedAt,
      microchip_implanted_by: parsed.microchipImplantedBy,
      microchip_location: parsed.microchipLocation,
      estimated_weight_kg: parsed.estimatedWeightKg,
      favourite_foods: parsed.favouriteFoods,
      known_allergies: parsed.knownAllergies,
      training_level: parsed.trainingLevel,
      insurance_company: parsed.insuranceCompany,
      insurance_policy_number: parsed.insurancePolicyNumber,
      jurisdiction_province: parsed.jurisdictionProvince,
      jurisdiction_locality: parsed.jurisdictionLocality,
      potentially_dangerous_breed: potentiallyDangerousBreed,
      acquisition_method: parsed.acquisitionMethod,
      has_photo: uploadedPath !== null,
      has_microchip: parsed.microchipId !== null,
      custody_kind: custodyKindToRegisteredPayloadKind(parsed.custodyKind),
    });

    const [registeredEvent] = await tx
      .insert(petEvents)
      .values({
        petId: newPet.id,
        eventType: "pet_registered",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: "owner",
        payload: petRegisteredPayload,
      })
      .returning();

    // Microchip: emit event + petIdentifications double-write.
    if (parsed.microchipId) {
      const microchipEventPayload = validateEventPayload("microchip_implanted", {
        chip_number: parsed.microchipId,
        country_code: parsed.microchipCountryCode,
        implanted_by: parsed.microchipImplantedBy,
        location_on_body: parsed.microchipLocation,
        implant_date_known: !!parsed.microchipImplantedAt,
      });

      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "microchip_implanted",
        occurredAt: parseDateInput(parsed.microchipImplantedAt) ?? now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: "owner",
        payload: microchipEventPayload,
      });

      // Double-write to pet_identifications (compliance PR 0, parity with original).
      const chipImplantSite = chipImplantSiteFromLocation(parsed.microchipLocation);
      await tx.insert(petIdentifications).values({
        petId: newPet.id,
        kind: "microchip_iso",
        code: parsed.microchipId,
        recordedAt: (parsed.microchipImplantedAt ?? now.toISOString().slice(0, 10)) as string,
        recordedByUserId: userId,
        isoCountryCode: parsed.microchipId.slice(0, 3),
        isoManufacturerCode: parsed.microchipId.slice(3, 7),
        isoNationalId: parsed.microchipId.slice(7, 15),
        isoCompliant: true,
        implantationSite: chipImplantSite as string | undefined,
      });
    }

    return { petId: newPet.id, eventId: registeredEvent.id };
  },

  /**
   * Composite atomic write for updating a pet profile.
   * Must be called inside a db.transaction().
   *
   * Handles:
   *   - pets row update (always — even for flag-only changes)
   *   - optional attachment + primaryPhotoId second update
   *   - pet_profile_updated event ONLY when hasContentChanges=true
   *   - microchip_implanted event when chipNewlyAdded=true
   *
   * NOTE: Does NOT insert petIdentifications on update chipNewlyAdded path.
   * This matches the current behavior of app/actions/pets.ts exactly (parity).
   */
  async updatePetProfile(args: UpdatePetProfileArgs, tx: Tx): Promise<{ eventId: string | null }> {
    const {
      petId,
      parsed,
      potentiallyDangerousBreed,
      changes,
      hasContentChanges,
      chipNewlyAdded,
      uploadedPath,
      uploadMimeType,
      uploadSize,
      userId,
      eventAuthorship,
      now,
    } = args;

    // Always update the pet row (covers flag-only and content changes).
    await tx
      .update(pets)
      .set({
        name: parsed.name,
        species: parsed.species,
        sex: parsed.sex,
        breed: parsed.breed,
        dateOfBirth: parsed.dateOfBirth,
        birthDateIsEstimated: parsed.birthDateIsEstimated,
        color: parsed.color,
        microchipId: parsed.microchipId,
        microchipCountryCode: parsed.microchipCountryCode,
        microchipImplantedAt: parsed.microchipImplantedAt,
        microchipImplantedBy: parsed.microchipImplantedBy,
        microchipLocation: parsed.microchipLocation,
        estimatedWeightKg: parsed.estimatedWeightKg,
        favouriteFoods: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
        knownAllergies: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
        trainingLevel: parsed.trainingLevel,
        potentiallyDangerousBreed,
        insuranceCompany: parsed.insuranceCompany,
        insurancePolicyNumber: parsed.insurancePolicyNumber,
        jurisdictionProvince: parsed.jurisdictionProvince,
        jurisdictionLocality: parsed.jurisdictionLocality,
        acquisitionMethod: parsed.acquisitionMethod,
        emergencyInfoVisible: parsed.emergencyInfoVisible,
        permanentConditions: parsed.permanentConditions,
        permanentConditionsOther: parsed.permanentConditionsOther,
        discloseConditionsPublicly: parsed.discloseConditionsPublicly,
        updatedAt: now,
      })
      .where(eq(pets.id, petId));

    // Optional photo attachment + second primaryPhotoId update.
    if (uploadedPath) {
      const [attachment] = await tx
        .insert(attachments)
        .values({
          petId,
          uploadedByUserId: userId,
          storagePath: uploadedPath,
          mimeType: uploadMimeType ?? "image/jpeg",
          fileSize: uploadSize ?? 0,
        })
        .returning();
      await tx.update(pets).set({ primaryPhotoId: attachment.id }).where(eq(pets.id, petId));
    }

    let eventId: string | null = null;

    // Emit pet_profile_updated ONLY for content changes (not flag-only).
    if (hasContentChanges) {
      const petProfileUpdatedPayload = validateEventPayload("pet_profile_updated", {
        changes,
        photo_replaced: uploadedPath !== null,
      });

      const [updateEvent] = await tx
        .insert(petEvents)
        .values({
          petId,
          eventType: "pet_profile_updated",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: userId,
          authorRole: eventAuthorship.authorRole,
          authorOrganizationId: eventAuthorship.authorOrganizationId,
          authorVerified: eventAuthorship.authorVerified,
          payload: petProfileUpdatedPayload,
        })
        .returning();

      eventId = updateEvent.id;
    }

    // Emit microchip_implanted when chip was newly added.
    if (chipNewlyAdded && parsed.microchipId) {
      const microchipEventPayload = validateEventPayload("microchip_implanted", {
        chip_number: parsed.microchipId,
        country_code: parsed.microchipCountryCode,
        implanted_by: parsed.microchipImplantedBy,
        location_on_body: parsed.microchipLocation,
        implant_date_known: !!parsed.microchipImplantedAt,
      });

      await tx.insert(petEvents).values({
        petId,
        eventType: "microchip_implanted",
        occurredAt: parseDateInput(parsed.microchipImplantedAt) ?? now,
        recordedAt: now,
        recordedByUserId: userId,
        authorRole: eventAuthorship.authorRole,
        authorOrganizationId: eventAuthorship.authorOrganizationId,
        authorVerified: eventAuthorship.authorVerified,
        payload: microchipEventPayload,
      });

      // Canonical dual-write — insert active microchip row in pet_identifications.
      // Only when the chip was newly added (chipNewlyAdded guard already asserts
      // no prior chip existed on this pet).
      const chipCode = parsed.microchipId;
      const chipImplantSite = chipImplantSiteFromLocation(parsed.microchipLocation);
      await tx.insert(petIdentifications).values({
        petId,
        kind: "microchip_iso",
        code: chipCode,
        recordedAt: (parsed.microchipImplantedAt ?? now.toISOString().slice(0, 10)) as string,
        recordedByUserId: userId,
        recordedByLabel: parsed.microchipImplantedBy,
        isoCountryCode: chipCode.slice(0, 3),
        isoManufacturerCode: chipCode.slice(3, 7),
        isoNationalId: chipCode.slice(7, 15),
        isoCompliant: true,
        implantationSite: chipImplantSite as string | undefined,
      });
    }

    return { eventId };
  },
};
