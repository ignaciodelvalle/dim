// Exported types for the claim use-cases.

export type ClaimLookupVariant =
  | { variant: "not_found" }
  | { variant: "active_owner"; petToken: string; petName: string; ownerInitials: string | null }
  | { variant: "lost"; petToken: string; petName: string }
  | { variant: "deceased"; petName: string }
  | { variant: "free"; petToken: string; petName: string };

export type ClaimLookupResult = ClaimLookupVariant | { error: string };

export type ClaimDisputeInput = {
  petToken: string;
  reason: string;
};

export type ClaimDisputeResult = { disputeToken: string } | { error: string };

export type FreeClaimResult = { petToken: string; petName: string } | { error: string };
