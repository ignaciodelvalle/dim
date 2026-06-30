"use server";

// reminders.ts — thin shim (strangler migration 42/61).
//
// Business logic moved to:
//   src/modules/pets/application/reminders/
//
// This file re-exports ReminderFormState and SnoozeReminderResult types and
// provides thin delegating wrappers for the three actions (used by 4 UI
// importers) so all existing import paths keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { createVaccineReminderAction as _create } from "@/src/modules/pets/application/reminders/create-vaccine-reminder";
import { deleteVaccineReminderAction as _delete } from "@/src/modules/pets/application/reminders/delete-vaccine-reminder";
import { snoozeReminderAction as _snooze } from "@/src/modules/pets/application/reminders/snooze-reminder";
import type {
  ReminderFormState,
  SnoozeReminderResult,
} from "@/src/modules/pets/application/reminders/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { ReminderFormState, SnoozeReminderResult };

// ---------------------------------------------------------------------------
// Action wrappers — thin delegating shims for UI importers
// ---------------------------------------------------------------------------

export async function createVaccineReminderAction(
  publicToken: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  return _create(publicToken, _previous, formData);
}

export async function deleteVaccineReminderAction(publicToken: string, reminderId: string) {
  return _delete(publicToken, reminderId);
}

export async function snoozeReminderAction(reminderId: string): Promise<SnoozeReminderResult> {
  return _snooze(reminderId);
}
