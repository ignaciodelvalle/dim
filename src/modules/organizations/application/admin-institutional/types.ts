// Result types for admin-institutional use-cases.

export type CreateInstitutionalResult =
  | { error: string }
  | { ok: true; profileId: string; magicLink: string };

export type DeactivateResult = { error: string } | { ok: true; noOp?: boolean };

export type ResetCredentialsResult = { error: string } | { ok: true; magicLink: string };

export type AssignGovtLocalityResult =
  | { error: string }
  | { ok: true; assignmentId: string; noOp?: boolean };
