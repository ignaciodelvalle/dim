"use server";

// tattoo.ts — thin shim (strangler migration 34/61).
//
// Business logic moved to:
//   src/modules/pets/application/tattoo/
//
// This file provides createTattooAction (outer auth-guarded server action
// used by UI components). The bare createTattooForUser writer is NOT
// exported here (authz triage 2026-07-04): every export of a "use server"
// file is an independently-addressable server action, so a bare writer
// taking caller-supplied petId/userId would let any client forge tattoo
// events. Callers import it from
// src/modules/pets/application/tattoo/create-tattoo directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { redirect } from "next/navigation";

import { checkOccurredAtPlausible } from "@/lib/events/plausibility";
import { type SupabaseServerClient, requireAlivePetAccess } from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { parseDateInput } from "@/lib/utils/format";
import {
  VALID_LOCATIONS,
  createTattooForUser as _createTattooForUser,
} from "@/src/modules/pets/application/tattoo/create-tattoo";
import type { EventFormState, TattooLocation } from "@/src/modules/pets/application/tattoo/types";

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
// Private helper — optional recordedAt: parse + date-only plausibility guard
// (PO decision 2026-07-16 — same family as P4 item 1 on the events edge).
// ---------------------------------------------------------------------------

function parseRecordedAt(
  raw: string,
  petDateOfBirth: string | null,
): { ok: true; recordedAt: Date | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, recordedAt: null };
  const recordedAt = parseDateInput(raw);
  if (!recordedAt) return { ok: false, error: "Fecha del tatuaje inválida." };
  const plausibility = checkOccurredAtPlausible(recordedAt, petDateOfBirth);
  if (plausibility) return { ok: false, error: plausibility.error };
  return { ok: true, recordedAt };
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!code) return { error: "Falta el código del tatuaje." };

  const location = (VALID_LOCATIONS as readonly string[]).includes(locationRaw)
    ? (locationRaw as TattooLocation)
    : null;

  const recordedAtParsed = parseRecordedAt(recordedAtRaw, pet.dateOfBirth);
  if (!recordedAtParsed.ok) return { error: recordedAtParsed.error };
  const { recordedAt } = recordedAtParsed;

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
    clientIdempotencyKey,
  });

  if ("error" in result) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return { error: result.error };
  }

  // Duplicate submit deduped by idempotency key — the original attachment is
  // already linked to the event; remove the redundant upload.
  if (result.wasNoop) {
    await cleanupAttachment(supabase, upload.uploadedPath);
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
