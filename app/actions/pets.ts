"use server";

// Pet-related server actions.
//
// createPetAction is the first place in the app where we write to our
// event-sourced data model. In a single transaction we insert a pet, an
// ownership, the photo attachment (if any), the pet_registered event, AND
// (if the owner provided a microchip number) a microchip_implanted event.
// PPP breeds also generate a notification for the owner.
//
// updatePetAction performs an edit: it computes a diff between the existing
// pet and the submitted values, updates the row, and emits a single
// pet_profile_updated event with the bundled diff. Adding a chip that wasn't
// there also emits a microchip_implanted event.

import { randomUUID } from "node:crypto";
import { type Pet, attachments, db, notifications, ownerships, petEvents, pets } from "@/db";
import { isPotentiallyDangerousBreed } from "@/lib/breeds";
import { generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export type NewPetFormState = {
  error: string | null;
};

// ---------------------------------------------------------------------------
// Shared form parsing — used by both create and update.
// ---------------------------------------------------------------------------

type ParsedPet = {
  name: string;
  species: string;
  sex: "male" | "female" | "unknown";
  breed: string | null;
  dateOfBirth: string | null;
  birthDateIsEstimated: boolean;
  color: string | null;
  microchipId: string | null;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
  estimatedWeightKg: string | null;
  favouriteFoods: string[];
  knownAllergies: string[];
  trainingLevel: "none" | "basic" | "intermediate" | "advanced" | "professional" | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  potentiallyDangerousBreed: boolean;
};

function parsePetForm(formData: FormData): { parsed: ParsedPet; error: string | null } {
  const name = String(formData.get("name") ?? "").trim();
  const species = String(formData.get("species") ?? "").trim();
  if (!name) return { parsed: null as never, error: "Falta el nombre." };
  if (!species) return { parsed: null as never, error: "Falta la especie." };

  const sexRaw = String(formData.get("sex") ?? "unknown");
  const sex: "male" | "female" | "unknown" =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unknown";

  const ageYearsRaw = String(formData.get("ageYears") ?? "").trim();
  const ageMonthsRaw = String(formData.get("ageMonths") ?? "").trim();
  const ageYears = ageYearsRaw ? Math.max(0, Number.parseInt(ageYearsRaw, 10) || 0) : null;
  const ageMonths = ageMonthsRaw ? Math.max(0, Number.parseInt(ageMonthsRaw, 10) || 0) : null;
  let dateOfBirth: string | null = null;
  let birthDateIsEstimated = false;
  if (ageYears !== null || ageMonths !== null) {
    const totalMonths = (ageYears ?? 0) * 12 + (ageMonths ?? 0);
    const dob = new Date();
    dob.setMonth(dob.getMonth() - totalMonths);
    dateOfBirth = dob.toISOString().slice(0, 10);
    birthDateIsEstimated = true;
  }

  const breed = String(formData.get("breed") ?? "").trim() || null;

  const microchipId = String(formData.get("microchipId") ?? "").trim() || null;

  const favouriteFoodsList = (formData.getAll("favouriteFoods") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const favouriteFoodsOther = String(formData.get("favouriteFoodsOther") ?? "").trim();
  const favouriteFoods = [
    ...favouriteFoodsList,
    ...favouriteFoodsOther
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  const knownAllergiesList = (formData.getAll("knownAllergies") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const knownAllergiesOther = String(formData.get("knownAllergiesOther") ?? "").trim();
  const knownAllergies = [
    ...knownAllergiesList,
    ...knownAllergiesOther
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  const trainingLevelRaw = String(formData.get("trainingLevel") ?? "").trim();
  const trainingLevel = ["none", "basic", "intermediate", "advanced", "professional"].includes(
    trainingLevelRaw,
  )
    ? (trainingLevelRaw as "none" | "basic" | "intermediate" | "advanced" | "professional")
    : null;

  return {
    parsed: {
      name,
      species,
      sex,
      breed,
      dateOfBirth,
      birthDateIsEstimated,
      color: String(formData.get("color") ?? "").trim() || null,
      microchipId,
      microchipCountryCode: microchipId
        ? String(formData.get("microchipCountryCode") ?? "").trim() || null
        : null,
      microchipImplantedAt: microchipId
        ? String(formData.get("microchipImplantedAt") ?? "").trim() || null
        : null,
      microchipImplantedBy: microchipId
        ? String(formData.get("microchipImplantedBy") ?? "").trim() || null
        : null,
      microchipLocation: microchipId
        ? String(formData.get("microchipLocation") ?? "").trim() || null
        : null,
      estimatedWeightKg: String(formData.get("estimatedWeightKg") ?? "").trim() || null,
      favouriteFoods,
      knownAllergies,
      trainingLevel,
      insuranceCompany: String(formData.get("insuranceCompany") ?? "").trim() || null,
      insurancePolicyNumber: String(formData.get("insurancePolicyNumber") ?? "").trim() || null,
      jurisdictionProvince: String(formData.get("province") ?? "").trim() || null,
      jurisdictionLocality: String(formData.get("locality") ?? "").trim() || null,
      potentiallyDangerousBreed: isPotentiallyDangerousBreed(species, breed),
    },
    error: null,
  };
}

async function uploadPhotoIfPresent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photoFile: File | null,
): Promise<{
  uploadedPath: string | null;
  mimeType: string | null;
  size: number | null;
  error: string | null;
}> {
  if (!photoFile || photoFile.size === 0) {
    return { uploadedPath: null, mimeType: null, size: null, error: null };
  }
  if (!photoFile.type.startsWith("image/")) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "El archivo debe ser una imagen.",
    };
  }
  if (photoFile.size > MAX_PHOTO_BYTES) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "La imagen no puede superar los 5 MB.",
    };
  }
  const ext = (photoFile.name.split(".").pop() ?? "jpg").toLowerCase();
  const filename = `${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("pet-photos")
    .upload(filename, photoFile, { contentType: photoFile.type });
  if (uploadError) {
    return {
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: `No se pudo subir la foto: ${uploadError.message}`,
    };
  }
  return { uploadedPath: filename, mimeType: photoFile.type, size: photoFile.size, error: null };
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

  const { parsed, error: parseError } = parsePetForm(formData);
  if (parseError) return { error: parseError };

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadPhotoIfPresent(supabase, photoFile);
  if (upload.error) return { error: upload.error };

  const publicToken = generatePublicToken();
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
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
          potentiallyDangerousBreed: parsed.potentiallyDangerousBreed,
          insuranceCompany: parsed.insuranceCompany,
          insurancePolicyNumber: parsed.insurancePolicyNumber,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
        })
        .returning();

      await tx.insert(ownerships).values({
        petId: newPet.id,
        userId: user.id,
        role: "owner",
        startedAt: now,
      });

      if (upload.uploadedPath) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            petId: newPet.id,
            uploadedByUserId: user.id,
            storagePath: upload.uploadedPath,
            mimeType: upload.mimeType ?? "image/jpeg",
            fileSize: upload.size ?? 0,
          })
          .returning();
        await tx.update(pets).set({ primaryPhotoId: attachment.id }).where(eq(pets.id, newPet.id));
      }

      const registeredEvent = await tx
        .insert(petEvents)
        .values({
          petId: newPet.id,
          eventType: "pet_registered",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            ...parsed,
            has_photo: upload.uploadedPath !== null,
            has_microchip: parsed.microchipId !== null,
          },
        })
        .returning();

      if (parsed.microchipId) {
        await tx.insert(petEvents).values({
          petId: newPet.id,
          eventType: "microchip_implanted",
          occurredAt: parsed.microchipImplantedAt ? new Date(parsed.microchipImplantedAt) : now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            chip_number: parsed.microchipId,
            country_code: parsed.microchipCountryCode,
            implanted_by: parsed.microchipImplantedBy,
            location_on_body: parsed.microchipLocation,
            implant_date_known: !!parsed.microchipImplantedAt,
          },
        });
      }

      // Auto-generate the PPP-registration reminder notification.
      if (parsed.potentiallyDangerousBreed) {
        await tx.insert(notifications).values({
          userId: user.id,
          notificationType: "ppp_registration_reminder",
          title: `${parsed.name}: registrá tu PPP en el provincial`,
          body: `Tu mascota está marcada como raza potencialmente peligrosa por ${parsed.breed ?? "su raza"}. La Ley CABA 4078 / Ley Provincial 14.107 requiere que la inscribas en el registro provincial correspondiente. DIM la marcó automáticamente con la flag oficial.`,
          severity: "warning",
          ctaLabel: "Más info sobre PPP",
          ctaUrl: "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/maltrato-animales",
          relatedPetId: newPet.id,
          relatedEventId: registeredEvent[0].id,
        });
      }
    });
  } catch (err) {
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return {
      error: `No se pudo crear la mascota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect("/mis-mascotas");
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

// Compute a diff between the existing pet record and the parsed form values.
// Returns a list of {field, old_value, new_value} entries — these become the
// payload of a single bundled pet_profile_updated event.
function diffPet(
  existing: Pet,
  parsed: ParsedPet,
): Array<{
  field: string;
  old: unknown;
  new: unknown;
}> {
  const fields: Array<{ field: string; oldVal: unknown; newVal: unknown }> = [
    { field: "name", oldVal: existing.name, newVal: parsed.name },
    { field: "species", oldVal: existing.species, newVal: parsed.species },
    { field: "sex", oldVal: existing.sex, newVal: parsed.sex },
    { field: "breed", oldVal: existing.breed, newVal: parsed.breed },
    { field: "date_of_birth", oldVal: existing.dateOfBirth, newVal: parsed.dateOfBirth },
    { field: "color", oldVal: existing.color, newVal: parsed.color },
    { field: "microchip_id", oldVal: existing.microchipId, newVal: parsed.microchipId },
    {
      field: "microchip_country_code",
      oldVal: existing.microchipCountryCode,
      newVal: parsed.microchipCountryCode,
    },
    {
      field: "microchip_implanted_at",
      oldVal: existing.microchipImplantedAt,
      newVal: parsed.microchipImplantedAt,
    },
    {
      field: "microchip_implanted_by",
      oldVal: existing.microchipImplantedBy,
      newVal: parsed.microchipImplantedBy,
    },
    {
      field: "microchip_location",
      oldVal: existing.microchipLocation,
      newVal: parsed.microchipLocation,
    },
    {
      field: "estimated_weight_kg",
      oldVal: existing.estimatedWeightKg,
      newVal: parsed.estimatedWeightKg,
    },
    {
      field: "favourite_foods",
      oldVal: existing.favouriteFoods,
      newVal: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
    },
    {
      field: "known_allergies",
      oldVal: existing.knownAllergies,
      newVal: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
    },
    { field: "training_level", oldVal: existing.trainingLevel, newVal: parsed.trainingLevel },
    {
      field: "potentially_dangerous_breed",
      oldVal: existing.potentiallyDangerousBreed,
      newVal: parsed.potentiallyDangerousBreed,
    },
    {
      field: "insurance_company",
      oldVal: existing.insuranceCompany,
      newVal: parsed.insuranceCompany,
    },
    {
      field: "insurance_policy_number",
      oldVal: existing.insurancePolicyNumber,
      newVal: parsed.insurancePolicyNumber,
    },
    {
      field: "jurisdiction_province",
      oldVal: existing.jurisdictionProvince,
      newVal: parsed.jurisdictionProvince,
    },
    {
      field: "jurisdiction_locality",
      oldVal: existing.jurisdictionLocality,
      newVal: parsed.jurisdictionLocality,
    },
  ];
  return fields
    .filter((f) => JSON.stringify(f.oldVal) !== JSON.stringify(f.newVal))
    .map((f) => ({ field: f.field, old: f.oldVal, new: f.newVal }));
}

export async function updatePetAction(
  publicToken: string,
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Iniciá sesión de nuevo." };

  // Verify ownership and load the existing record.
  const [existing] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.userId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!existing) return { error: "Mascota no encontrada o sin permisos." };

  const { parsed, error: parseError } = parsePetForm(formData);
  if (parseError) return { error: parseError };

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadPhotoIfPresent(supabase, photoFile);
  if (upload.error) return { error: upload.error };

  const changes = diffPet(existing.pet, parsed);
  const wasChipPresent = !!existing.pet.microchipId;
  const isChipPresent = !!parsed.microchipId;
  const chipNewlyAdded = !wasChipPresent && isChipPresent;
  const becamePPP = !existing.pet.potentiallyDangerousBreed && parsed.potentiallyDangerousBreed;

  // Skip the whole transaction if nothing changed (and no new photo).
  if (changes.length === 0 && !upload.uploadedPath) {
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
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
          potentiallyDangerousBreed: parsed.potentiallyDangerousBreed,
          insuranceCompany: parsed.insuranceCompany,
          insurancePolicyNumber: parsed.insurancePolicyNumber,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          updatedAt: now,
        })
        .where(eq(pets.id, existing.pet.id));

      if (upload.uploadedPath) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            petId: existing.pet.id,
            uploadedByUserId: user.id,
            storagePath: upload.uploadedPath,
            mimeType: upload.mimeType ?? "image/jpeg",
            fileSize: upload.size ?? 0,
          })
          .returning();
        await tx
          .update(pets)
          .set({ primaryPhotoId: attachment.id })
          .where(eq(pets.id, existing.pet.id));
      }

      const updateEvent = await tx
        .insert(petEvents)
        .values({
          petId: existing.pet.id,
          eventType: "pet_profile_updated",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            changes,
            photo_replaced: upload.uploadedPath !== null,
          },
        })
        .returning();

      if (chipNewlyAdded) {
        await tx.insert(petEvents).values({
          petId: existing.pet.id,
          eventType: "microchip_implanted",
          occurredAt: parsed.microchipImplantedAt ? new Date(parsed.microchipImplantedAt) : now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            chip_number: parsed.microchipId,
            country_code: parsed.microchipCountryCode,
            implanted_by: parsed.microchipImplantedBy,
            location_on_body: parsed.microchipLocation,
            implant_date_known: !!parsed.microchipImplantedAt,
          },
        });
      }

      if (becamePPP) {
        await tx.insert(notifications).values({
          userId: user.id,
          notificationType: "ppp_registration_reminder",
          title: `${parsed.name}: registrá tu PPP en el provincial`,
          body: `Tu mascota fue marcada como raza potencialmente peligrosa por ${parsed.breed ?? "su raza"}. La Ley CABA 4078 / Ley Provincial 14.107 requiere que la inscribas en el registro provincial correspondiente.`,
          severity: "warning",
          ctaLabel: "Más info sobre PPP",
          ctaUrl: "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/maltrato-animales",
          relatedPetId: existing.pet.id,
          relatedEventId: updateEvent[0].id,
        });
      }
    });
  } catch (err) {
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return {
      error: `No se pudo actualizar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
