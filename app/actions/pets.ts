"use server";

// Pet-related server actions.
//
// createPetAction is the first place in the app where we write to our
// event-sourced data model. In a single transaction we insert a pet, an
// ownership, the photo attachment (if any), the pet_registered event, AND
// (if the owner provided a microchip number) a microchip_implanted event.
// If any step fails, the whole thing rolls back and any uploaded photo is
// cleaned up.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { attachments, db, ownerships, petEvents, pets } from "@/db";
import { isPotentiallyDangerousBreed } from "@/lib/breeds";
import { generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export type NewPetFormState = {
  error: string | null;
};

export async function createPetAction(
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesión expirada. Iniciá sesión de nuevo." };
  }

  // ---------- Read & validate inputs ----------
  const name = String(formData.get("name") ?? "").trim();
  const species = String(formData.get("species") ?? "").trim();
  const sexRaw = String(formData.get("sex") ?? "unknown");
  const ageYearsRaw = String(formData.get("ageYears") ?? "").trim();
  const ageMonthsRaw = String(formData.get("ageMonths") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;

  const breed = String(formData.get("breed") ?? "").trim() || null;

  const microchipId = String(formData.get("microchipId") ?? "").trim() || null;
  const microchipCountryCode =
    String(formData.get("microchipCountryCode") ?? "").trim() || null;
  const microchipImplantedAtRaw = String(formData.get("microchipImplantedAt") ?? "").trim();
  const microchipImplantedBy =
    String(formData.get("microchipImplantedBy") ?? "").trim() || null;
  const microchipLocation = String(formData.get("microchipLocation") ?? "").trim() || null;

  const estimatedWeightKgRaw = String(formData.get("estimatedWeightKg") ?? "").trim();
  const favouriteFoodsList = (formData.getAll("favouriteFoods") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const favouriteFoodsOther = String(formData.get("favouriteFoodsOther") ?? "").trim();
  const knownAllergiesList = (formData.getAll("knownAllergies") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const knownAllergiesOther = String(formData.get("knownAllergiesOther") ?? "").trim();
  const trainingLevelRaw = String(formData.get("trainingLevel") ?? "").trim();

  const insuranceCompany = String(formData.get("insuranceCompany") ?? "").trim() || null;
  const insurancePolicyNumber =
    String(formData.get("insurancePolicyNumber") ?? "").trim() || null;

  const province = String(formData.get("province") ?? "").trim() || null;
  const locality = String(formData.get("locality") ?? "").trim() || null;
  const photoFile = formData.get("photo") as File | null;

  if (!name) return { error: "Falta el nombre." };
  if (!species) return { error: "Falta la especie." };

  const sex: "male" | "female" | "unknown" =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unknown";

  // ---------- Compute derived fields ----------
  // Approximate DOB from years+months. Both optional. Stored as DATE; flagged
  // as estimated. Power-users editing the exact DOB later can clear the flag.
  const ageYears = ageYearsRaw ? Math.max(0, parseInt(ageYearsRaw, 10) || 0) : null;
  const ageMonths = ageMonthsRaw ? Math.max(0, parseInt(ageMonthsRaw, 10) || 0) : null;
  let dateOfBirth: string | null = null;
  let birthDateIsEstimated = false;
  if (ageYears !== null || ageMonths !== null) {
    const totalMonths = (ageYears ?? 0) * 12 + (ageMonths ?? 0);
    const dob = new Date();
    dob.setMonth(dob.getMonth() - totalMonths);
    dateOfBirth = dob.toISOString().slice(0, 10);
    birthDateIsEstimated = true;
  }

  const estimatedWeightKg = estimatedWeightKgRaw ? estimatedWeightKgRaw : null;

  const favouriteFoods = [
    ...favouriteFoodsList,
    ...(favouriteFoodsOther ? [favouriteFoodsOther] : []),
  ];
  const knownAllergies = [
    ...knownAllergiesList,
    ...(knownAllergiesOther ? [knownAllergiesOther] : []),
  ];

  const trainingLevel:
    | "none"
    | "basic"
    | "intermediate"
    | "advanced"
    | "professional"
    | null = ["none", "basic", "intermediate", "advanced", "professional"].includes(
    trainingLevelRaw,
  )
    ? (trainingLevelRaw as "none" | "basic" | "intermediate" | "advanced" | "professional")
    : null;

  const potentiallyDangerousBreed = isPotentiallyDangerousBreed(species, breed);

  // ---------- Photo upload (if provided) ----------
  let uploadedPath: string | null = null;
  let photoMimeType: string | null = null;
  let photoSize: number | null = null;

  if (photoFile && photoFile.size > 0) {
    if (!photoFile.type.startsWith("image/")) {
      return { error: "El archivo debe ser una imagen." };
    }
    if (photoFile.size > MAX_PHOTO_BYTES) {
      return { error: "La imagen no puede superar los 5 MB." };
    }

    const ext = (photoFile.name.split(".").pop() ?? "jpg").toLowerCase();
    const filename = `${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("pet-photos")
      .upload(filename, photoFile, { contentType: photoFile.type });

    if (uploadError) {
      return { error: `No se pudo subir la foto: ${uploadError.message}` };
    }

    uploadedPath = filename;
    photoMimeType = photoFile.type;
    photoSize = photoFile.size;
  }

  const publicToken = generatePublicToken();
  const now = new Date();

  const registeredPayload = {
    name,
    species,
    sex,
    breed,
    date_of_birth: dateOfBirth,
    color,
    estimated_weight_kg: estimatedWeightKg,
    favourite_foods: favouriteFoods,
    known_allergies: knownAllergies,
    training_level: trainingLevel,
    insurance_company: insuranceCompany,
    insurance_policy_number: insurancePolicyNumber,
    jurisdiction_province: province,
    jurisdiction_locality: locality,
    potentially_dangerous_breed: potentiallyDangerousBreed,
    has_photo: uploadedPath !== null,
    has_microchip: microchipId !== null,
  };

  try {
    await db.transaction(async (tx) => {
      const [newPet] = await tx
        .insert(pets)
        .values({
          publicToken,
          name,
          species,
          sex,
          breed,
          dateOfBirth,
          birthDateIsEstimated,
          color,
          microchipId,
          microchipCountryCode: microchipId ? microchipCountryCode : null,
          microchipImplantedAt: microchipId
            ? microchipImplantedAtRaw || null
            : null,
          microchipImplantedBy: microchipId ? microchipImplantedBy : null,
          microchipLocation: microchipId ? microchipLocation : null,
          estimatedWeightKg,
          favouriteFoods: favouriteFoods.length > 0 ? favouriteFoods : null,
          knownAllergies: knownAllergies.length > 0 ? knownAllergies : null,
          trainingLevel,
          potentiallyDangerousBreed,
          insuranceCompany,
          insurancePolicyNumber,
          jurisdictionProvince: province,
          jurisdictionLocality: locality,
        })
        .returning();

      await tx.insert(ownerships).values({
        petId: newPet.id,
        userId: user.id,
        role: "owner",
        startedAt: now,
      });

      if (uploadedPath) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            petId: newPet.id,
            uploadedByUserId: user.id,
            storagePath: uploadedPath,
            mimeType: photoMimeType ?? "image/jpeg",
            fileSize: photoSize ?? 0,
          })
          .returning();

        await tx
          .update(pets)
          .set({ primaryPhotoId: attachment.id })
          .where(eq(pets.id, newPet.id));
      }

      // The canonical "this pet entered the system" event.
      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "pet_registered",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: registeredPayload,
      });

      // If a chip was provided, also record the implant as its own event so
      // the timeline shows it (with the historical implant date if known).
      if (microchipId) {
        await tx.insert(petEvents).values({
          petId: newPet.id,
          eventType: "microchip_implanted",
          occurredAt: microchipImplantedAtRaw
            ? new Date(microchipImplantedAtRaw)
            : now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            chip_number: microchipId,
            country_code: microchipCountryCode,
            implanted_by: microchipImplantedBy,
            location_on_body: microchipLocation,
            implant_date_known: !!microchipImplantedAtRaw,
          },
        });
      }
    });
  } catch (err) {
    if (uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([uploadedPath]);
      } catch {
        // Swallow — log/alert here later when we have observability.
      }
    }
    return {
      error: `No se pudo crear la mascota: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect("/mis-mascotas");
}
