// CheckinFormState for the owner-side post-adoption check-in use-case.

export type CheckinFormState = {
  error: string | null;
  /**
   * Nav contract N3: on success the use-case RETURNS the destination and the
   * calling form performs the navigation (useActionRedirect). See
   * lib/ui/use-action-redirect.ts.
   */
  redirectTo?: string;
};
