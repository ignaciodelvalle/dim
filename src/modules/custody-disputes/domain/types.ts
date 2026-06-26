// Domain types for the custody-disputes module.
// Pure value shapes — no DB, no framework, no external imports.

// DisputePartyRole and DisputeResolution are DB enum types. Duplicating them
// here as literal unions so the domain layer stays free of @/db imports
// (enforced by biome.json noRestrictedImports on src/modules/*/domain/**).

export type DisputePartyRole =
  | "current_owner"
  | "claimant_owner"
  | "current_org_custody"
  | "claimant_org"
  | "witness";

export type DisputeResolution =
  | "ownership_confirmed"
  | "ownership_transferred"
  | "case_dismissed"
  | "other";

// ---------------------------------------------------------------------------
// AddParty
// ---------------------------------------------------------------------------

export type AddPartyInput = {
  disputeToken: string;
  partyUserId?: string | null;
  partyOrgId?: string | null;
  partyRole: DisputePartyRole;
  positionSummary?: string | null;
};

export type AddPartyResult = { partyId: string } | { error: string };

// ---------------------------------------------------------------------------
// ResolveDispute
// ---------------------------------------------------------------------------

export type ResolveDisputeInput = {
  disputeToken: string;
  resolution: DisputeResolution;
  resolutionSummary: string;
  transferToUserId?: string | null;
  transferToOrgId?: string | null;
  notes?: string | null;
};

export type ResolveDisputeResult = { resolvedAt: Date } | { error: string };

// ---------------------------------------------------------------------------
// WithdrawDispute
// ---------------------------------------------------------------------------

export type WithdrawDisputeInput = {
  disputeToken: string;
  reason?: string | null;
};

export type WithdrawDisputeResult = { withdrawnAt: Date } | { error: string };

// ---------------------------------------------------------------------------
// LookupTransferTarget
// ---------------------------------------------------------------------------

export type LookupTransferTargetInput = {
  kind: "user" | "org";
  id: string;
};

export type LookupTransferTargetResult =
  | { found: true; displayName: string; active: boolean }
  | { found: false; error: string };

// ---------------------------------------------------------------------------
// EscalateDispute
// ---------------------------------------------------------------------------

export type EscalateDisputeInput = {
  disputeToken: string;
  notes: string;
};

export type EscalateDisputeResult = { escalatedAt: Date } | { error: string };

// ---------------------------------------------------------------------------
// Convenience pet shape for callers
// ---------------------------------------------------------------------------

export type DisputePet = {
  id: string;
  name: string | null;
  species: string;
  publicToken: string;
};
