// Achievements POC for pet profile v2 (spec 2026-05-19-pet-profile-v2-design).
//
// Each achievement is a declarative def with a pure compute function. The
// compute receives a denormalized snapshot of the pet + its events + the
// service-dog row + open cases, and returns one of three statuses:
//   - `earned`           — the pet has met the condition; chip is shown
//   - `not_yet`          — condition not yet met but is computable
//   - `not_yet_computable` — the event_type or data needed doesn't exist yet
//
// Adding a new achievement: implement the def and add it to
// `ACHIEVEMENTS_CATALOG` in `./catalog.ts`. No schema migration.

import type { Case, Pet, PetEvent, PetServiceDog } from "@/db";

export interface AchievementDef {
  /** Stable slug — used in tests, telemetry, and tooltip ids. */
  id: string;
  /** Chip label (es-AR). */
  label: string;
  /** Emoji or short icon string rendered before the label. */
  icon: string;
  /** Tooltip / modal copy (es-AR). */
  description: string;
  computeStatus: (input: AchievementInput) => AchievementStatus;
}

export type AchievementStatus =
  | { kind: "earned"; earnedAt: Date; count?: number; detail?: string }
  | { kind: "not_yet"; reason?: string }
  | { kind: "not_yet_computable"; missing: string };

export interface AchievementInput {
  pet: Pet;
  /** All pet_events ordered ascending by occurred_at. */
  events: PetEvent[];
  serviceDog: PetServiceDog | null;
  /** All cases (open + closed) for the pet. */
  cases: Case[];
}

export type EarnedAchievement = AchievementDef & {
  earnedAt: Date;
  count?: number;
  detail?: string;
};

export type NotYetComputableAchievement = AchievementDef & {
  missing: string;
};
