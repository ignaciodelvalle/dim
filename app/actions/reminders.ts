"use server";

// reminders.ts — thin shim (strangler migration 42/61).
//
// Business logic moved to:
//   src/modules/pets/application/reminders/
//
// Auth guards are resolved here and the authenticated context is forwarded to
// the use-cases so they don't need their own session calls.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requireOwnedPetByToken } from "@/lib/infra/pets";
import { createClient } from "@/lib/supabase/server";
import { createVaccineReminder as _create } from "@/src/modules/pets/application/reminders/create-vaccine-reminder";
import { deleteVaccineReminder as _delete } from "@/src/modules/pets/application/reminders/delete-vaccine-reminder";
import { snoozeReminder as _snooze } from "@/src/modules/pets/application/reminders/snooze-reminder";
import type {
  ReminderFormState,
  SnoozeReminderResult,
} from "@/src/modules/pets/application/reminders/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { ReminderFormState, SnoozeReminderResult };

// ---------------------------------------------------------------------------
// Action wrappers — auth guard here, use-cases receive authenticated context
// ---------------------------------------------------------------------------

export async function createVaccineReminderAction(
  publicToken: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return { error: "Sesión expirada." };
  return _create(session.user.id, session.pet.id, publicToken, _previous, formData);
}

export async function deleteVaccineReminderAction(publicToken: string, reminderId: string) {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) {
    throw new Error("No autorizado.");
  }
  return _delete(session.pet.id, publicToken, reminderId);
}

export async function snoozeReminderAction(reminderId: string): Promise<SnoozeReminderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada." };
  return _snooze(reminderId, user.id);
}
