// Result types for profile-self-service use-cases.

export type VetSelfResignResult = { error: string } | { ok: true; noOp?: boolean };

export type PersonalSelfDeactivateResult = { error: string } | { ok: true; noOp?: boolean };

export type GovtSelfDeactivateResult =
  | { error: string; uncoveredLocalities?: { province: string; locality: string }[] }
  | { ok: true; noOp?: boolean };

export type UpdateProfileResult = { error: string } | { ok: true };

export type UploadAvatarResult = { error: string } | { ok: true; avatarUrl: string };
