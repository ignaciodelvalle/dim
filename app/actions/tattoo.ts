"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { attachments, db, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import {
  type PetEventAuthorship,
  type SupabaseServerClient,
  requireAlivePetAccess,
} from "@/lib/pet-access";
import { normalizeTattooCode } from "@/lib/tattoo-lookup";
import { uploadAttachmentIfPresent } from "@/lib/uploads";

export type EventFormState = { error: string | null };

export type TattooLocation =
  | "inner_ear_left"
  | "inner_ear_right"
  | "inner_thigh"
  | "belly"
  | "other";

const VALID_LOCATIONS: readonly TattooLocation[] = [
  "inner_ear_left",
  "inner_ear_right",
  "inner_thigh",
  "belly",
  "other",
];

export type TattooInput = {
  code: string;
  location: TattooLocation | null;
  description: string | null;
  recordedAt: Date | null;
  recordedBy: string | null;
  uploadedAttachment: { path: string; mimeType: string; size: number };
};

export type CreateTattooResult = { ok: true; eventId: string } | { error: string };

// Inner writer — testable without Next.js request context. The outer action
// resolves access + uploads the photo + delegates here. Photo upload happens
// outside the transaction so a failed insert doesn't leak orphan bytes; the
// outer action cleans up on failure.
export async function createTattooForUser(
  petId: string,
  userId: string,
  eventAuthorship: PetEventAuthorship,
  input: TattooInput,
): Promise<CreateTattooResult> {
  const normalizedCode = normalizeTattooCode(input.code);
  if (!normalizedCode) return { error: "Falta el código del tatuaje." };

  if (input.location !== null && !VALID_LOCATIONS.includes(input.location)) {
    return { error: "Ubicación del tatuaje inválida." };
  }

  const now = new Date();
  const recordedAtIso = input.recordedAt ? input.recordedAt.toISOString().slice(0, 10) : null;

  try {
    const result = await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("tattoo_recorded", {
        tattoo_code: normalizedCode,
        location_on_body: input.location,
        description: input.description,
        recorded_by: input.recordedBy,
        recorded_at: recordedAtIso,
        tattoo_date_known: input.recordedAt !== null,
      });

      const [event] = await tx
        .insert(petEvents)
        .values({
          petId,
          eventType: "tattoo_recorded",
          occurredAt: input.recordedAt ?? now,
          recordedAt: now,
          recordedByUserId: userId,
          ...eventAuthorship,
          payload: eventPayload,
        })
        .returning();

      const [attachment] = await tx
        .insert(attachments)
        .values({
          petId,
          eventId: event.id,
          uploadedByUserId: userId,
          storagePath: input.uploadedAttachment.path,
          mimeType: input.uploadedAttachment.mimeType,
          fileSize: input.uploadedAttachment.size,
        })
        .returning();

      await tx
        .update(pets)
        .set({
          tattooCode: normalizedCode,
          tattooLocation: input.location,
          tattooDescription: input.description,
          tattooRecordedAt: recordedAtIso,
          tattooRecordedBy: input.recordedBy,
          tattooPhotoId: attachment.id,
          updatedAt: now,
        })
        .where(eq(pets.id, petId));

      return { ok: true as const, eventId: event.id };
    });

    return result;
  } catch (err) {
    return {
      error: `No se pudo registrar el tatuaje: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }
}

async function cleanupAttachment(
  supabase: SupabaseServerClient,
  path: string | null,
): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Orphan file at worst — the row was never inserted.
  }
}

export async function createTattooAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const code = String(formData.get("tattooCode") ?? "").trim();
  const locationRaw = String(formData.get("locationOnBody") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const recordedBy = String(formData.get("recordedBy") ?? "").trim() || null;
  const recordedAtRaw = String(formData.get("recordedAt") ?? "").trim();

  if (!code) return { error: "Falta el código del tatuaje." };

  const location = (VALID_LOCATIONS as readonly string[]).includes(locationRaw)
    ? (locationRaw as TattooLocation)
    : null;

  const recordedAt = recordedAtRaw ? parseDateInput(recordedAtRaw) : null;
  if (recordedAtRaw && !recordedAt) {
    return { error: "Fecha del tatuaje inválida." };
  }

  const attachmentFile = formData.get("attachment") as File | null;
  if (!attachmentFile || attachmentFile.size === 0) {
    return {
      error:
        "Subí una foto del tatuaje — es la mejor forma de que quien encuentre a tu mascota la reconozca.",
    };
  }

  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };
  if (!upload.uploadedPath) {
    return { error: "No se pudo subir la foto del tatuaje." };
  }

  const result = await createTattooForUser(pet.id, user.id, eventAuthorship, {
    code,
    location,
    description,
    recordedAt,
    recordedBy,
    uploadedAttachment: {
      path: upload.uploadedPath,
      mimeType: upload.mimeType ?? "image/jpeg",
      size: upload.size ?? 0,
    },
  });

  if ("error" in result) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return { error: result.error };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
