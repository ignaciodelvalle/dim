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
import type { ReminderVariant } from "@/lib/domain/vaccine-reminder-state";

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

/**
 * Whether a personal-list ownership row is a tránsito (foster) placement.
 *
 * The "Mis mascotas" list joins ownerships on ownerUserId = user.id, so only
 * user-held roles appear here. A foster is `role='foster'`; shelter_custody is
 * org-level (ownerUserId is null) and NEVER surfaces in this list. Matching on
 * "shelter_custody" therefore made the "En tránsito" badge permanently dead
 * (AF-H2) — fostered pets rendered as owned. The pet profile page keys the same
 * badge off role==='foster', which this mirrors as the single source of truth.
 */
export function isTransitRole(ownershipRole: string): boolean {
  return ownershipRole === "foster";
}
