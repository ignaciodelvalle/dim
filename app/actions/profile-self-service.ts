"use server";

// profile-self-service.ts — thin shim (strangler migration 9/61).
//
// Business logic moved to:
//   src/modules/pets/application/profile/
//
// This file provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath. The bare ForUser writers are NOT exported
// here (authz triage 2026-07-04): every export of a "use server" file is an
// independently-addressable server action, so a bare writer taking a
// caller-supplied userId would let any client resign/deactivate/toggle
// privacy prefs for any user. Callers import the writers from
// src/modules/pets/application/profile/ directly.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { govtSelfDeactivateForUser as _govtSelfDeactivate } from "@/src/modules/pets/application/profile/govt-self-deactivate";
import { selfDeactivatePersonalAccountForUser as _selfDeactivatePersonal } from "@/src/modules/pets/application/profile/self-deactivate-personal-account";
import { vetSelfResignForUser as _vetSelfResign } from "@/src/modules/pets/application/profile/vet-self-resign";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  GovtSelfDeactivateResult,
  PersonalSelfDeactivateResult,
  VetSelfResignResult,
} from "@/src/modules/pets/application/profile/types";

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

export async function selfDeactivatePersonalAccountAction(reason: string) {
  const { user } = await requireUserOrRedirect();
  return _selfDeactivatePersonal(user.id, reason);
}
