// Identity completeness — is this profile still carrying the PROVISIONAL name?
//
// WHY THIS EXISTS (staging finding, 2026-08-01)
// ---------------------------------------------
// 15 of 25 owner profiles on staging had `display_name` set to the exact
// local-part of their email (e.g. "ignaciodelvalle2014+cursor-owner2"). That is
// the provisional value written by the `handle_new_user` trigger:
//
//   coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
//
// signupAction deliberately supplies no display_name metadata, so every brand
// new account starts provisional; completeIdentityAction (signup step 2) is the
// only thing that overwrites it with a real "First Last". When step 2 is skipped
// or abandoned, the provisional value becomes permanent — and this system is an
// identity registry, so a titular with no real name is a record that does not
// do its job.
//
// The detection rule is deliberately TIGHT: it matches exactly what the trigger
// produces and nothing else.
//
//   pending  <=>  display_name is blank
//             OR  display_name === split_part(email, '@', 1)   (case-insensitive)
//
// It is NOT "display_name has no surname". A single-word name written by an
// admin or a service-role script is not the defect we measured, and widening the
// rule would nag accounts that were never broken. Widening is a product call,
// not a silent one.
//
// False-positive shape: a user whose real full name happens to equal their email
// local-part. completeIdentityAction requires BOTH firstName and lastName and
// joins them with a space, and an unquoted email local-part cannot contain a
// space — so the form itself can never produce that collision.

/**
 * The provisional display name the `handle_new_user` trigger derives from an
 * email address.
 *
 * Mirrors Postgres `split_part(email, '@', 1)` — the FIRST segment, not the
 * last. That distinction only matters for malformed addresses, but this
 * function's whole job is to reproduce the trigger byte for byte, so it splits
 * the way the trigger splits.
 */
export function emailLocalPart(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return (at === -1 ? email : email.slice(0, at)).trim();
}

/**
 * True when the profile never completed signup step 2 and is still showing the
 * trigger's provisional, email-derived name.
 *
 * Server-computed on purpose. The two-step signup form kept its step in React
 * `useState`, which dies with the browser tab; this predicate is re-evaluated
 * from the database on every request, so an abandoned signup is still
 * recoverable tomorrow, on another device, after any number of closed tabs.
 */
export function isIdentityPending(input: {
  displayName: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  const name = (input.displayName ?? "").trim();
  if (name === "") return true;

  const localPart = emailLocalPart(input.email);
  // No email to compare against (service accounts, imported rows): a non-blank
  // name is the best evidence available. Do not nag.
  if (localPart === "") return false;

  return name.toLowerCase() === localPart.toLowerCase();
}
