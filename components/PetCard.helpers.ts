// Pure logic for which badge a PetCard should surface on the right side.
//
// Priority (top wins):
//   1. status === "lost"      → "URGENTE · perdido"  (danger, pulse)
//   2. status === "deceased"  → "En memoria"          (neutral)
//   3. vaccineReminderState   → vaccine variant badge
//   4. (none)
//
// Reminder variants `success` and unknown are ignored — they don't warrant
// surfacing a chip on the card.

import type { Pet } from "@/db";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";

export type PriorityBadge =
  | { kind: "lost" }
  | { kind: "deceased" }
  | { kind: "vaccine"; variant: ReminderVariant }
  | { kind: "none" };

export function getPriorityBadge(
  petStatus: Pet["status"],
  vaccineReminderState: { variant: ReminderVariant } | undefined,
): PriorityBadge {
  if (petStatus === "lost") return { kind: "lost" };
  if (petStatus === "deceased") return { kind: "deceased" };
  if (vaccineReminderState) {
    const v = vaccineReminderState.variant;
    if (v === "upcoming" || v === "due_soon" || v === "overdue" || v === "overdue_critical") {
      return { kind: "vaccine", variant: v };
    }
  }
  return { kind: "none" };
}
