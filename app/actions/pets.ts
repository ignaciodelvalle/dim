"use server";

// Pet-related server actions.
//
// createPetAction is the first place in the app where we write to our
// event-sourced data model. In a single transaction we insert a pet, an
// ownership, the photo attachment (if any), and a pet_registered event. If any
// step fails, the whole thing rolls back and any uploaded photo is cleaned up.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { attachments, db, ownerships, petEvents, pets } from "@/db";
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

  const name = String(formData.get("name") ?? "").trim();
  const species = String(formData.get("species") ?? "").trim();
  const sexRaw = String(formData.get("sex") ?? "unknown");
  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  const province = String(formData.get("province") ?? "").trim() || null;
  const locality = String(formData.get("locality") ?? "").trim() || null;
  const photoFile = formData.get("photo") as File | null;

  if (!name) return { error: "Falta el nombre." };
  if (!species) return { error: "Falta la especie." };

  const sex: "male" | "female" | "unknown" =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unknown";
  const dateOfBirth = dateOfBirthRaw || null;

  // --- Photo upload (if provided) ---
  // We upload BEFORE the DB transaction so we know the storage_path before
  // writing rows. If the DB transaction fails, we delete the uploaded file.
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

  const eventPayload = {
    name,
    species,
    sex,
    date_of_birth: dateOfBirth,
    color,
    jurisdiction_province: province,
    jurisdiction_locality: locality,
    has_photo: uploadedPath !== null,
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
          dateOfBirth,
          birthDateIsEstimated: dateOfBirth !== null,
          color,
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

      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "pet_registered",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: eventPayload,
      });
    });
  } catch (err) {
    // Best-effort cleanup of the orphaned upload.
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
