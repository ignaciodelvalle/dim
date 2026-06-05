// Shared types for bulk vaccination and bulk adoption-eligibility. Kept in a
// separate module because "use server" files cannot export types (Next.js
// constraint), and client components need to import the input shape without
// crossing a server boundary.

export type BulkVaccinateInput = {
  orgToken: string;
  petPublicTokens: string[];
  vaccineName: string;
  occurredAt: string; // ISO date string (YYYY-MM-DD)
  brand?: string | null;
  batch?: string | null;
  // Only the free-text administeredBy field is supported for bulk.
  // The FK columns administered_by_organization_id / administered_by_user_id
  // are intentionally omitted: they require per-pet user resolution that
  // doesn't fit the bulk model. Do NOT add them here — use the single-pet
  // createVaccinationAction if you need FK attribution.
  administeredBy?: string | null;
  nextDueAt?: string | null;
  // Required — the UI generates crypto.randomUUID() before calling the action.
  // Callers own retry semantics: re-submitting the same bulkActionId is safe
  // (idempotent per-pet keys are derived from it).
  bulkActionId: string;
};

// Mirrors the enum from adoption-eligibility.ts (kept in sync manually).
// Do NOT import from that file — it's "use server" and cannot export types.
export const BULK_INELIGIBLE_REASONS = [
  "medical_treatment",
  "behavioral_evaluation",
  "recovery",
  "quarantine",
  "legal_hold",
  "age",
  "pending_intake_eval",
  "other",
] as const;

export type BulkIneligibleReason = (typeof BULK_INELIGIBLE_REASONS)[number];

export type BulkSetEligibilityInput = {
  orgToken: string;
  petPublicTokens: string[];
  bulkActionId: string;
  eligible: boolean;
  ineligibleReason?: BulkIneligibleReason | null;
  ineligibleReasonNotes?: string | null;
  ineligibleUntilIso?: string | null;
};
