// Pregnancy use-case types (strangler migration 18/61).

import type { Pet } from "@/db";
import type { PetEventAuthorship } from "@/lib/infra/pet-access";

export type PregnancyFormState = {
  error: string | null;
  /**
   * N3 post-action destination. The action must NOT redirect() — the App
   * Router drops a server action's own redirect in production: the write
   * commits and the screen never moves (lib/ui/full-page-action-nav.ts).
   */
  redirectTo?: string | null;
};

export const PREGNANCY_OUTCOMES = [
  "live_birth",
  "stillbirth",
  "miscarriage",
  "termination",
  "unknown",
] as const;
export type PregnancyOutcome = (typeof PREGNANCY_OUTCOMES)[number];

export type RecordPregnancyStartedParams = {
  pet: Pick<Pet, "id" | "sex" | "species" | "pregnancyStatus" | "publicToken">;
  recordedByUserId: string;
  eventAuthorship: PetEventAuthorship;
  occurredAt: Date;
  weeksAtDiagnosis: number | null;
  vetConsulted: string | null;
  notes: string | null;
  now?: Date;
};

export type RecordPregnancyResult =
  | { ok: true; eventId: string; reminderCount: number }
  | { ok: false; error: string };

export type RecordPregnancyEndedParams = {
  pet: Pick<Pet, "id" | "pregnancyStatus" | "publicToken" | "name">;
  recordedByUserId: string;
  eventAuthorship: PetEventAuthorship;
  occurredAt: Date;
  outcome: PregnancyOutcome;
  liveBirthsCount: number | null;
  vetConsulted: string | null;
  notes: string | null;
  now?: Date;
};
