// Shared types for bulk vaccination. Kept in a separate module because
// "use server" files cannot export types (Next.js constraint), and client
// components need to import the input shape without crossing a server
// boundary.

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
