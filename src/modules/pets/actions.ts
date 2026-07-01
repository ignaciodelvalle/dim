"use server";

// Thin action controllers for the pets domain.
//
// Each action does ONLY:
//   1. Auth guard (security boundary stays here — NOT in use-cases):
//      - createPetAction: supabase.auth.getUser() (no pet exists yet)
//      - updatePetAction: requirePetAccess (pet must exist + ownership check)
//   2. Parse formData → ParsedPet (via parsePetForm from domain layer)
//   3. Pre-tx I/O (request-edge concerns):
//      - Jurisdiction canonicalization
//      - Chip format validation + cross-check (redirect/warning stay here)
//      - Storage upload
//      - PPP evaluation
//   4. Build input DTO + call use-case
//   5. Handle Result<T> — on error, cleanup storage + return error state
//   6. Flush pendingNotifications post-tx, best-effort (catch+log)
//   7. redirect
//
// NO business logic beyond edge orchestration. NO direct pet row writes.

import { db, notifications } from "@/db";
import {
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";
import { validateMicrochipId } from "@/lib/domain/microchip-validation";
import { isPotentiallyDangerousBreedForJurisdiction } from "@/lib/infra/breeds-server";
import { lookupByChip } from "@/lib/infra/chip-lookup";
import { generateForceToken, validateForceToken } from "@/lib/infra/microchip-force-token";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import type { NewNotification } from "@/src/modules/adoption/application/set-adoption-eligibility";
import { registerPet } from "./application/register-pet";
import { updatePet } from "./application/update-pet";
import { parsePetForm } from "./domain/pet-form";
import type { NewPetFormState } from "./domain/types";
import { PetsRepository } from "./infrastructure/pets-repository";

// Re-export for consumers that import the type from this module.
export type { NewPetFormState } from "./domain/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(pending: NewNotification[]): Promise<void> {
  if (pending.length === 0) return;
  try {
    await db
      .insert(notifications)
      .values(pending as unknown as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[pets/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export async function createPetAction(
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Iniciá sesión de nuevo." };

  const parseResult = parsePetForm(formData);
  if (parseResult.error !== null) {
    const msg =
      parseResult.error === "LOCALITY_REQUIRED"
        ? "Seleccioná la localidad antes de continuar."
        : parseResult.error;
    return { error: msg };
  }
  // Safe: parseResult.error === null implies parsed is non-null (discriminated union).
  const parsed = parseResult.parsed as NonNullable<typeof parseResult.parsed>;

  // Jurisdiction canonicalization (pre-tx, request-edge I/O).
  // locality:"strict" — resolveCanonicalJurisdiction (createPet behavior unchanged).
  if (parsed.jurisdictionProvince && parsed.jurisdictionLocality) {
    try {
      const normalizedLoc = await normalizeLocationForWrite(
        {
          province: parsed.jurisdictionProvince,
          provinceCode: null,
          locality: parsed.jurisdictionLocality,
          localityIndecId: null,
          lat: null,
          lng: null,
          address: null,
        },
        { locality: "strict" },
      );
      parsed.jurisdictionProvince = normalizedLoc.province;
      parsed.jurisdictionLocality = normalizedLoc.locality;
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  // Chip format validation (ISO 11784/11785, 15 digits).
  if (parsed.microchipId) {
    const chipValidation = validateMicrochipId(parsed.microchipId);
    if (!chipValidation.ok) {
      return { error: "INVALID_MICROCHIP_FORMAT" };
    }
    parsed.microchipId = chipValidation.normalized;
  }

  // Chip cross-check (found_stray + chip set) — request-edge: redirect stays here.
  if (parsed.acquisitionMethod === "found_stray" && parsed.microchipId) {
    const match = await lookupByChip(parsed.microchipId);
    if (match) {
      if (match.pet.status === "lost") {
        redirect(`/mis-mascotas/nueva/match/${match.pet.publicToken}`);
      }

      if (match.pet.status === "active") {
        const forceToken = String(formData.get("forceToken") ?? "").trim();
        const forceValid = forceToken ? validateForceToken(parsed.microchipId, forceToken) : false;

        if (!forceValid) {
          return {
            error: null,
            warning: "CHIP_MATCH_ACTIVE",
            matchedPetToken: match.pet.publicToken,
            forceToken: generateForceToken(parsed.microchipId),
          };
        }
        // Force token valid — fall through to insert.
      }

      if (match.pet.status === "deceased") {
        return {
          error:
            "Este chip está asociado a una mascota registrada como fallecida en MiMAR. Pedile a un admin que revise el caso antes de continuar.",
        };
      }
    }
  }

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, photoFile, "pet-photos");
  if (upload.error) return { error: upload.error };

  const potentiallyDangerousBreed = await isPotentiallyDangerousBreedForJurisdiction(
    parsed.species,
    parsed.breed,
    {
      country: "AR",
      province: parsed.jurisdictionProvince,
      locality: parsed.jurisdictionLocality,
    },
  );

  const result = await registerPet(
    {
      parsed,
      potentiallyDangerousBreed,
      uploadedPath: upload.uploadedPath,
      uploadMimeType: upload.mimeType,
      uploadSize: upload.size,
    },
    {
      repo: PetsRepository,
      actor: { user },
      transaction: async <T>(cb: (tx: unknown) => Promise<T>) =>
        db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>,
    },
  );

  if (!result.ok) {
    // Clean up uploaded photo on failure.
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return { error: result.error };
  }

  await flushNotifications(result.notifications);

  const newPublicToken = (result.value as NonNullable<typeof result.value>).publicToken;
  // Onboarding aha: show the QR credential success screen (Item 13).
  // The credencial page requires owner access and delivers the "aha" moment.
  redirect(`/mis-mascotas/nueva/${newPublicToken}/credencial`);
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export async function updatePetAction(
  publicToken: string,
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet: existingPet, eventAuthorship, accessPath } = access;

  // ARCH-S: fetch canonical chip presence before the update so chipNewlyAdded
  // guard doesn't need the dropped pets.microchipId column.
  const existingCanonicalIds = await fetchActiveIdentifications(existingPet.id);

  const parseResult = parsePetForm(formData);
  if (parseResult.error !== null) {
    const msg =
      parseResult.error === "LOCALITY_REQUIRED"
        ? "Seleccioná la localidad antes de continuar."
        : parseResult.error;
    return { error: msg };
  }
  // Safe: parseResult.error === null implies parsed is non-null (discriminated union).
  const parsed = parseResult.parsed as NonNullable<typeof parseResult.parsed>;

  // Jurisdiction canonicalization (same posture as createPetAction).
  // locality:"strict" — resolveCanonicalJurisdiction (updatePet behavior unchanged).
  if (parsed.jurisdictionProvince && parsed.jurisdictionLocality) {
    try {
      const normalizedLoc = await normalizeLocationForWrite(
        {
          province: parsed.jurisdictionProvince,
          provinceCode: null,
          locality: parsed.jurisdictionLocality,
          localityIndecId: null,
          lat: null,
          lng: null,
          address: null,
        },
        { locality: "strict" },
      );
      parsed.jurisdictionProvince = normalizedLoc.province;
      parsed.jurisdictionLocality = normalizedLoc.locality;
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, photoFile, "pet-photos");
  if (upload.error) return { error: upload.error };

  const potentiallyDangerousBreed = await isPotentiallyDangerousBreedForJurisdiction(
    parsed.species,
    parsed.breed,
    {
      country: "AR",
      province: parsed.jurisdictionProvince,
      locality: parsed.jurisdictionLocality,
    },
  );

  const result = await updatePet(
    {
      petId: existingPet.id,
      parsed,
      potentiallyDangerousBreed,
      uploadedPath: upload.uploadedPath,
      uploadMimeType: upload.mimeType,
      uploadSize: upload.size,
    },
    {
      repo: PetsRepository,
      actor: {
        user,
        accessPath,
        eventAuthorship,
        existingPet,
        existingCanonicalIds: { hasMicrochip: existingCanonicalIds.microchip !== null },
      },
      transaction: async <T>(cb: (tx: unknown) => Promise<T>) =>
        db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>,
    },
  );

  if (!result.ok) {
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return { error: result.error };
  }

  await flushNotifications(result.notifications);

  redirect(`/mis-mascotas/${publicToken}`);
}
