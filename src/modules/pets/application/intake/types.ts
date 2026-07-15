// IntakeFormState for the org-side intake use-case.

export type IntakeFormState = {
  error: string | null;
  // Present when a tattoo cross-check found a possible match (advisory WARN state).
  // Tattoo codes collide across registries, so the UI shows the possible match and
  // offers a photo-verified "continue anyway" path backed by the tattooAckToken.
  // (An ACTIVE-chip match is NOT a warning — it is a hard block returned via `error`,
  // because a second intake for the same chip always violates the unique index.)
  warning?: "TATTOO_MATCH_POSSIBLE";
  matchedPetToken?: string;
  // Tattoo advisory ack token — bound to the normalized tattoo code, expires in 15 min.
  // Re-submitting with a valid tattooAckToken skips the tattoo cross-check.
  tattooAckToken?: string;
  // Optional success flag. Default success path is a redirect to the org
  // mascotas list. The intake wizard (sprint 4 PR-030) passes noRedirect=1
  // so it can render its own SuccessScreen with the new pet's name + token.
  ok?: boolean;
  createdPetToken?: string;
  createdPetName?: string;
};
