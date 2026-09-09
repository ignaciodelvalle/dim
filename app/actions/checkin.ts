"use server";

// checkin.ts — the web door of the post-adoption check-in (strangler migration
// 33/61).
//
// THIS FILE IS THE FORM ADAPTER AND NOTHING ELSE. Until 2026-09-09 the
// use-case took the `FormData` and the Supabase client itself, which made it
// the one owner writer the native app could not reach. What lives here now is
// exactly what a browser form needs and JSON does not: the access guard at the
// cookie door, the field parsing, the location canonicalisation, the attachment
// upload and its rollback. Every RULE — who may write a check-in, what it
// requires, what it appends and what it closes — runs inside
// `recordPostAdoptionCheckin`, once, for this door and for
// `POST /api/v1/pets/{token}/events` alike.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { CoordError, normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { parseLocationFromFormData } from "@/lib/domain/location-value";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { cleanupAttachment } from "@/src/modules/events/action-support";
import { recordPostAdoptionCheckin } from "@/src/modules/pets/application/checkin/record-post-adoption-checkin";
import type { CheckinFormState } from "@/src/modules/pets/application/checkin/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { CheckinFormState };

// ---------------------------------------------------------------------------
// Action — the form adapter
// ---------------------------------------------------------------------------

export async function recordPostAdoptionCheckinAction(
  publicToken: string,
  _previous: CheckinFormState,
  formData: FormData,
): Promise<CheckinFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };

  // Check-in is owner-self only. Org-mediated access (refugios cohabiting
  // post-adoption) can READ the resulting event but not WRITE it. The
  // use-case refuses an org member anyway — an organization is never the
  // adopter — but this door says so in its own sentence, before any upload.
  if (access.accessPath !== "owner") {
    return { error: "Solo el adoptante puede registrar un check-in." };
  }
  const { supabase, user, pet } = access;

  const notes = String(formData.get("notes") ?? "").trim() || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  // Per-event L1 (sprint 4 PR-034). Optional.
  // Canonicalize the ISO provinceCode (e.g. "AR-C") to the display name ("CABA")
  // that every other jurisdiction_province write stores. Without this, the raw
  // ISO code landed in the JSONB payload and govt-dashboard aggregation that
  // filters on display names silently missed check-in events.
  // locality:"none" — canonicalize province only, no catalog lookup.
  const loc = parseLocationFromFormData(formData);
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    const result = await recordPostAdoptionCheckin({
      pet: { id: pet.id, name: pet.name },
      user: { id: user.id },
      notes,
      eventJurisdictionProvince: normalizedLoc.province,
      eventJurisdictionLocality: normalizedLoc.locality,
      clientIdempotencyKey,
      uploadedPath: upload.uploadedPath,
      uploadedMimeType: upload.mimeType,
      uploadedSize: upload.size,
    });
    if (!result.ok) {
      // A refused or failed write leaves no row for the file to hang off.
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el check-in: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // Nav contract N3: RETURN the destination; the form navigates (useActionRedirect).
  // Land on the LIBRETA tab, not the credential face: the freshly created
  // "Seguimiento post-adopción" asiento at the top — now rendering the
  // adopter's own text — IS the confirmation. The bare profile redirect gave
  // no visible sign anything happened (9-role external run, 2026-08-18).
  return { error: null, redirectTo: `/mis-mascotas/${publicToken}?tab=libreta` };
}
