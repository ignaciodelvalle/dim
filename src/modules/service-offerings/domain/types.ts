// Domain types for the service-offerings module.
// Pure value shapes — no DB, no framework, no external imports.

export type ServiceOfferingResult = { error: string } | { ok: true };

export type UpdateCapacityResult = { ok: true; slotsUpdated: number } | { error: string };

export type ServiceOfferingFormState = { error: string | null };

/** Discriminated provider: org-side only (vet provider is not yet exposed here). */
export type OrgProvider = {
  organizationId: string;
  organizationPublicToken: string;
  organizationDisplayName: string;
};
