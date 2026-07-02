"use server";

// profile.ts — thin shim (strangler migration 19/61).
//
// Business logic moved to:
//   src/modules/pets/application/profile/
//
// This file re-exports updateProfileForUser and uploadAvatarForUser (used by
// integration tests and UI importers) and provides thin Action wrappers that
// add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { updateProfileForUser as _updateProfileForUser } from "@/src/modules/pets/application/profile/update-profile";
import { uploadAvatarForUser as _uploadAvatarForUser } from "@/src/modules/pets/application/profile/upload-avatar";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  UpdateProfileResult,
  UploadAvatarResult,
} from "@/src/modules/pets/application/profile/types";

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function updateProfileForUser(...args: Parameters<typeof _updateProfileForUser>) {
  return _updateProfileForUser(...args);
}

export async function uploadAvatarForUser(...args: Parameters<typeof _uploadAvatarForUser>) {
  return _uploadAvatarForUser(...args);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function updateProfileAction(input: {
  displayName: string;
  phone?: string;
  preferredVetName?: string;
  preferredVetPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}) {
  const { user } = await requireUserOrRedirect();
  const result = await _updateProfileForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

export async function uploadAvatarAction(input: {
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  const { user } = await requireUserOrRedirect();
  const result = await _uploadAvatarForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

// ---------------------------------------------------------------------------
// updateEmergencyContactsAction — narrow write for `?sheet=emergencia`
// (pet-document-redesign ADR-13, Phase 5).
//
// The 4 vet/emergency-contact fields live on `profiles` (per-user, not
// per-pet — see update-profile.ts), but the entry point is the pet profile's
// CredentialFace EmergencyCard. `updateProfileForUser`'s schema requires
// `displayName` (non-optional) — this action loads the viewer's CURRENT
// displayName and passes it through unchanged so the sheet never has to
// carry or resubmit it, keeping the write scoped to only the fields
// EmergencyContactFields actually renders.
// ---------------------------------------------------------------------------

export type UpdateEmergencyContactsInput = {
  preferredVetName?: string;
  preferredVetPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export async function updateEmergencyContactsAction(
  petPublicToken: string,
  input: UpdateEmergencyContactsInput,
) {
  const { user } = await requireUserOrRedirect();

  const [current] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (!current) return { error: "NOT_FOUND" };

  const result = await _updateProfileForUser(user.id, {
    displayName: current.displayName,
    ...input,
  });
  if ("ok" in result) {
    revalidatePath("/cuenta");
    revalidatePath(`/mis-mascotas/${petPublicToken}`);
  }
  return result;
}
