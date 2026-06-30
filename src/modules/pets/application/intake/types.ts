// IntakeFormState for the org-side intake use-case.

export type IntakeFormState = {
  error: string | null;
  // Present when a chip cross-check found an active match (WARN state).
  // The UI should show the conflict details and offer a "continue anyway" path
  // backed by the forceToken.
  warning?: "CHIP_MATCH_ACTIVE" | "TATTOO_MATCH_POSSIBLE";
  matchedPetToken?: string;
  // Chip bypass token — bound to the microchip code, expires in 15 min.
  forceToken?: string;
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
