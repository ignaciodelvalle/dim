"use server";

// Pet-related server actions. The createPetAction below is the first place in
// the app where we write to our event-sourced data model: in a single
// transaction we insert a pet, an ownership, and a pet_registered event. If
// any one of them fails, the whole thing rolls back — no orphaned rows.

import { redirect } from "next/navigation";
import { db, ownerships, petEvents, pets } from "@/db";
import { generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";

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

  if (!name) return { error: "Falta el nombre." };
  if (!species) return { error: "Falta la especie." };

  const sex: "male" | "female" | "unknown" =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unknown";
  const dateOfBirth = dateOfBirthRaw || null;

  const publicToken = generatePublicToken();
  const now = new Date();

  const payload = {
    name,
    species,
    sex,
    date_of_birth: dateOfBirth,
    color,
    jurisdiction_province: province,
    jurisdiction_locality: locality,
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
          dateOfBirth, // YYYY-MM-DD string; Drizzle coerces for the `date` column
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

      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "pet_registered",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo crear la mascota: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect("/mis-mascotas");
}
