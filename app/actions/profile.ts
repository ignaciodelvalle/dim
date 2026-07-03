"use server";

// profile.ts — thin shim (strangler migration 19/61).
//
// Business logic moved to: src/modules/pets/application/profile/
//
// This file re-exports updateProfileForUser and uploadAvatarForUser (used by
// integration tests and UI importers) and provides thin Action wrappers that
// add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import {
  type UpdateEmergencyContactsInput,
  updateEmergencyContactsForUser as _updateEmergencyContactsForUser,
} from "@/src/modules/pets/application/profile/update-emergency-contacts";
import { updateProfileForUser as _updateProfileForUser } from "@/src/modules/pets/application/profile/update-profile";
import { uploadAvatarForUser as _uploadAvatarForUser } from "@/src/modules/pets/application/profile/upload-avatar";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  UpdateProfileResult,
  UploadAvatarResult,
} from "@/src/modules/pets/application/profile/types";
export type { UpdateEmergencyContactsInput } from "@/src/modules/pets/application/profile/update-emergency-contacts";

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

// updateEmergencyContactsAction — narrow write for `?sheet=emergencia`
// (ADR-13). Logic lives in update-emergency-contacts.ts; this wrapper only
// adds the auth guard and revalidatePath.
export async function updateEmergencyContactsAction(
  petPublicToken: string,
  input: UpdateEmergencyContactsInput,
) {
  const { user } = await requireUserOrRedirect();
  const result = await _updateEmergencyContactsForUser(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
    revalidatePath(`/mis-mascotas/${petPublicToken}`);
  }
  return result;
}
