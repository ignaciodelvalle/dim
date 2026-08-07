// Exported types for the claim use-cases.

export type ClaimLookupVariant =
  | { variant: "not_found" }
  | { variant: "active_owner"; petToken: string; petName: string; ownerInitials: string | null }
  | { variant: "lost"; petToken: string; petName: string }
  | { variant: "deceased"; petName: string }
  | { variant: "free"; petToken: string; petName: string };

export type ClaimLookupResult = ClaimLookupVariant | { error: string };

// The dispute is authorized by the PRIVATE identifier, never by a pet token.
// A public token is not evidence: /perdidas lists every lost animal with a link
// to /p/{token} and no login, so tokens harvest in bulk, while /p/[publicToken]
// deliberately renders "Microchip: Sí/No" and never the number. Carrying the
// identifier here mirrors submitFreeClaimForUser, the sibling step of the SAME
// wizard, which already resolves its pet from the identifier and calls that
// "the evidence". The dispute step was the outlier.
export type ClaimDisputeInput = {
  identifierKind: "microchip" | "tattoo";
  identifierValue: string;
  reason: string;
};

// `petToken` is the token RESOLVED from the identifier server-side — callers
// revalidate with this, never with a caller-supplied value.
export type ClaimDisputeResult = { disputeToken: string; petToken: string } | { error: string };

export type FreeClaimResult = { petToken: string; petName: string } | { error: string };
