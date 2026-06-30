"use server";

// profile-self-service.ts — thin shim (strangler migration 9/61).
//
// Business logic moved to:
//   src/modules/pets/application/profile/
//
// This file re-exports all ForUser writers (used by integration tests)
// and provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { govtSelfDeactivateForUser as _govtSelfDeactivate } from "@/src/modules/pets/application/profile/govt-self-deactivate";
import { selfDeactivatePersonalAccountForUser as _selfDeactivatePersonal } from "@/src/modules/pets/application/profile/self-deactivate-personal-account";
import { updatePrivacyPrefForUser as _updatePrivacyPref } from "@/src/modules/pets/application/profile/update-privacy-pref";
import { vetSelfResignForUser as _vetSelfResign } from "@/src/modules/pets/application/profile/vet-self-resign";
import type { PrivacyPrefKey } from "@/lib/privacy-prefs";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  GovtSelfDeactivateResult,
  PersonalSelfDeactivateResult,
  UpdatePrivacyPrefResult,
  VetSelfResignResult,
} from "@/src/modules/pets/application/profile/types";

// ---------------------------------------------------------------------------
// ForUser re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function vetSelfResignForUser(
  ...args: Parameters<typeof _vetSelfResign>
) {
  return _vetSelfResign(...args);
}

export async function govtSelfDeactivateForUser(
  ...args: Parameters<typeof _govtSelfDeactivate>
) {
  return _govtSelfDeactivate(...args);
}

export async function updatePrivacyPrefForUser(
  ...args: Parameters<typeof _updatePrivacyPref>
) {
  return _updatePrivacyPref(...args);
}

export async function selfDeactivatePersonalAccountForUser(
  ...args: Parameters<typeof _selfDeactivatePersonal>
) {
  return _selfDeactivatePersonal(...args);
}

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

export async function vetSelfResignAction(input?: {
  reason?: string;
}) {
  const { user } = await requireUserOrRedirect();
  const result = await _vetSelfResign(user.id, input);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

export async function govtSelfDeactivateAction(input?: {
  reason?: string;
}) {
  const { user } = await requireUserOrRedirect();
  const result = await _govtSelfDeactivate(user.id, input);
  if ("ok" in result && !result.noOp) {
    revalidatePath("/cuenta");
  }
  return result;
}

export async function updatePrivacyPrefAction(
  key: PrivacyPrefKey,
  next: boolean,
) {
  const { user } = await requireUserOrRedirect();
  const result = await _updatePrivacyPref(user.id, key, next);
  if ("ok" in result) {
    revalidatePath("/cuenta");
  }
  return result;
}

export async function selfDeactivatePersonalAccountAction(
  reason: string,
) {
  const { user } = await requireUserOrRedirect();
  return _selfDeactivatePersonal(user.id, reason);
}
