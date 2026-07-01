"use server";

// tattoo.ts — thin shim (strangler migration 34/61).
//
// Business logic moved to:
//   src/modules/pets/application/tattoo/
//
// This file re-exports createTattooForUser (used by integration tests
// and 2 UI importers) and provides createTattooAction
// (outer auth-guarded server action used by UI components).
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { redirect } from "next/navigation";

import {
  type PetEventAuthorship,
  type SupabaseServerClient,
  requireAlivePetAccess,
} from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { parseDateInput } from "@/lib/utils/format";
import {
  VALID_LOCATIONS,
  createTattooForUser as _createTattooForUser,
} from "@/src/modules/pets/application/tattoo/create-tattoo";
import type {
  CreateTattooResult,
  EventFormState,
  TattooInput,
  TattooLocation,
} from "@/src/modules/pets/application/tattoo/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  CreateTattooResult,
  EventFormState,
  TattooInput,
  TattooLocation,
} from "@/src/modules/pets/application/tattoo/types";

// ---------------------------------------------------------------------------
// Writer re-export — async wrapper (used by integration tests and route actions)
// ---------------------------------------------------------------------------

export async function createTattooForUser(
  petId: string,
  userId: string,
  eventAuthorship: PetEventAuthorship,
  input: TattooInput,
): Promise<CreateTattooResult> {
  return _createTattooForUser(petId, userId, eventAuthorship, input);
}

// ---------------------------------------------------------------------------
// Private helper — cleanup on failed insert (stays in shim: uses SupabaseServerClient).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Outer server action — gates via requireAlivePetAccess, then delegates to writer.
// ---------------------------------------------------------------------------

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

  const result = await _createTattooForUser(pet.id, user.id, eventAuthorship, {
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
