"use server";

// checkin.ts — thin shim (strangler migration 33/61).
//
// Business logic moved to:
//   src/modules/pets/application/checkin/
//
// This file re-exports the CheckinFormState type and provides the thin
// recordPostAdoptionCheckinAction wrapper (used by UI components) that adds
// the auth guard.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requirePetAccess } from "@/lib/pet-access";
import { recordPostAdoptionCheckin } from "@/src/modules/pets/application/checkin/record-post-adoption-checkin";
import type { CheckinFormState } from "@/src/modules/pets/application/checkin/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { CheckinFormState };

// ---------------------------------------------------------------------------
// Action wrapper — thin controller for UI components
// ---------------------------------------------------------------------------

export async function recordPostAdoptionCheckinAction(
  publicToken: string,
  _previous: CheckinFormState,
  formData: FormData,
): Promise<CheckinFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };

  if (access.accessPath !== "owner") {
    return { error: "Solo el adoptante puede registrar un check-in." };
  }

  return recordPostAdoptionCheckin(publicToken, access, formData);
}
