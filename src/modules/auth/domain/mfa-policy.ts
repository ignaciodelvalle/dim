// Second factor (TOTP) for institutional accounts — the policy, pure (T2-S6).
//
// WHO. Every institutional principal: admin, govt, national — the same predicate
// the 8-hour operator shift uses (`isInstitutionalPrincipal`, an OR over role and
// account type). Personal accounts — owners, vets, org staff on a personal
// profile — are not asked for a second factor.
//
// WHAT IT ANSWERS, from two server-side facts and nothing the client says:
//
//   · the account's factors, from the user object `auth.getUser()` just fetched
//     from GoTrue (never the cookie's copy);
//   · the session's assurance level, from the `aal` claim of the access token
//     that same `getUser()` validated (`aal1` after a password, `aal2` after a
//     verified TOTP challenge).
//
//   aal claim unreadable         → "unknown" (checked first; see below)
//   no verified factor           → "enrol": the account must set one up before
//                                  it may act. Enrolment is enforced at the first
//                                  institutional request after sign-in — there is
//                                  no grace period, because the population is a
//                                  handful of named operators we onboard by hand.
//   verified factor, aal2        → "satisfied"
//   verified factor, not aal2    → "challenge": type the six digits.
//
// "unknown" is the caller's to interpret, and live-user.ts states its answer:
// it FAILS OPEN and reports, the same direction as the operator shift. The claim
// is minted and signed by GoTrue on every token, so an attacker cannot strip it;
// the only way to lose it is a GoTrue shape change, and locking every operator
// out of every console over that is the worse failure.
//
// Only VERIFIED factors count. An abandoned enrolment leaves an `unverified`
// factor behind, which proves nothing about a phone.

export type MfaFactorLike = { factor_type?: string; status?: string };

export type MfaRequirement = "satisfied" | "enrol" | "challenge" | "unknown";

export function hasVerifiedTotpFactor(factors: ReadonlyArray<MfaFactorLike> | null | undefined) {
  return (factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}

export function mfaRequirement(input: {
  factors: ReadonlyArray<MfaFactorLike> | null | undefined;
  aal: "aal1" | "aal2" | null;
}): MfaRequirement {
  // Unknown FIRST: without the claim this function cannot tell a satisfied
  // session from an unsatisfied one, and answering "enrol" for it would be a
  // guess dressed as a verdict.
  if (input.aal === null) return "unknown";
  if (!hasVerifiedTotpFactor(input.factors)) return "enrol";
  return input.aal === "aal2" ? "satisfied" : "challenge";
}

/** Where a page load goes for each unmet requirement. */
export const MFA_CHALLENGE_PATH = "/mfa";
export const MFA_ENROL_PATH = "/mfa/configurar";

/** es-AR refusal copy for a write boundary that meets an unmet requirement. */
export const MFA_CHALLENGE_MESSAGE =
  "Tu cuenta institucional pide el código de verificación de tu app de autenticación. Ingresalo para seguir.";
export const MFA_ENROL_MESSAGE =
  "Tu cuenta institucional necesita un segundo factor de verificación. Configuralo para seguir.";
