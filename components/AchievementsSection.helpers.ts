// Pure helpers for AchievementsSection (B-4).
// Extracted so vitest can import without JSX transform.

export type CredentialChip = {
  kind: "ppp" | "service_dog";
  label: string;
  icon: string;
};

/**
 * Returns true when the badge should pulse (animate-pulse class applied).
 * Pulses when pulseUntil is a Date in the future. Never pulses for null/undefined.
 */
export function shouldPulse(pulseUntil: Date | null | undefined): boolean {
  if (!pulseUntil) return false;
  return pulseUntil.getTime() > Date.now();
}

/**
 * Returns true when the section should be rendered at all.
 * Omits the row when both credentials and earned achievements are empty.
 */
export function shouldRenderSection(
  credentials: CredentialChip[],
  earnedCount: number,
): boolean {
  return credentials.length > 0 || earnedCount > 0;
}
