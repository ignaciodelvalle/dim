// What a client may SEND to `POST /api/v1/me/identity` — signup step 2, from
// the app instead of from the browser.
//
// WHY THIS SCHEMA EXISTS AT ALL, GIVEN `my-profile-edit.ts` ALREADY TAKES A NAME
// ---------------------------------------------------------------------------
// They are two different acts and the difference is load-bearing.
// `myProfileEditInputSchema` CORRECTS a name somebody already gave: it takes one
// `displayName` string, and `POST /api/v1/me/profile` refuses a caller whose
// identity is still pending precisely so that door cannot be used to finish
// registering (see that route's docblock — a provisional account posting a
// real-looking `displayName` there would have completed step 2 without ever
// running it).
//
// This one IS step 2. It takes the name in TWO PARTS, because that is what the
// web form has always collected (`completeIdentityAction`) and because the
// joined `"${firstName} ${lastName}"` is what the rest of the product renders.
// Splitting it here rather than asking a phone to join two boxes into one field
// is what keeps the two surfaces writing the same value.
//
// NO DNI, AND ITS ABSENCE IS THE DECISION (PO 2026-09-05). The DNI stays on the
// web step: it is hashed, never stored in plaintext (`lib/utils/dni-hash.ts`),
// it carries the partial unique index that makes it an identity CLAIM rather
// than a field, and it is the half of this step that the Mi Argentina federation
// path (invariant #6) will eventually replace outright. What moved into the app
// is the half a pilot tester was dropping out over — a name — and nothing else.
//
// NO TOS CHECKBOX EITHER, and for the opposite reason: the native signup screen
// already collects it in step 1 (`CrearCuentaScreen`), so an account that can
// reach this endpoint has accepted the documents. The server records the consent
// on the same write, exactly as the web action does.

import { z } from "zod";

import { DISPLAY_NAME_MAX_LENGTH } from "./my-profile-edit.ts";

/**
 * The bound on EACH half of the name.
 *
 * DERIVED, not chosen. The stored value is `${firstName} ${lastName}` in a
 * single `profiles.display_name`, and the other writer onto that column
 * (`myProfileEditInputSchema`) bounds it at `DISPLAY_NAME_MAX_LENGTH`. Two
 * halves plus one joining space must fit inside that, so the per-half ceiling is
 * `(DISPLAY_NAME_MAX_LENGTH - 1) / 2`, floored.
 *
 * Writing the derivation instead of the number is what stops the two schemas
 * drifting: raise the column's bound and this follows, and no name that passes
 * here can be refused by the other door.
 */
export const IDENTITY_NAME_MAX_LENGTH = Math.floor((DISPLAY_NAME_MAX_LENGTH - 1) / 2);

/**
 * The per-field codes a client can act on locally.
 *
 * SCREAMING_SNAKE, like every other input module here, and deliberately NOT the
 * `lowercase_snake` of `@dim/contract/api`'s error vocabulary: these are refusals
 * a client computes for ITSELF before any round trip.
 *
 * FIRST AND LAST ARE SEPARATE CODES because they are separate boxes on the
 * screen and the message has to name the empty one. The length code is SHARED,
 * because the sentence is the same either way and the field that overflowed is
 * the one the person is looking at.
 */
export const COMPLETE_IDENTITY_INPUT_CODES = [
  "FIRST_NAME_REQUIRED",
  "LAST_NAME_REQUIRED",
  "NAME_TOO_LONG",
] as const;

export type CompleteIdentityInputCode = (typeof COMPLETE_IDENTITY_INPUT_CODES)[number];

export const completeIdentityInputSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, { error: "FIRST_NAME_REQUIRED" })
    .max(IDENTITY_NAME_MAX_LENGTH, { error: "NAME_TOO_LONG" }),
  lastName: z
    .string()
    .trim()
    .min(1, { error: "LAST_NAME_REQUIRED" })
    .max(IDENTITY_NAME_MAX_LENGTH, { error: "NAME_TOO_LONG" }),
});

export type CompleteIdentityInput = z.infer<typeof completeIdentityInputSchema>;

/**
 * The FIRST input code in a failed parse, for a client that wants to show one
 * message. Mirrors `firstMyProfileEditInputCode` — same shape, same reason.
 */
export function firstCompleteIdentityInputCode(
  error: z.ZodError<unknown>,
): CompleteIdentityInputCode | null {
  for (const issue of error.issues) {
    const code = issue.message;
    if ((COMPLETE_IDENTITY_INPUT_CODES as readonly string[]).includes(code)) {
      return code as CompleteIdentityInputCode;
    }
  }
  return null;
}

/**
 * The stored `display_name`, from the two halves.
 *
 * ONE FUNCTION, IN THE CONTRACT, because both the web action and the API route
 * write this column and a second join written by hand is a second answer to
 * "what is this person called". `completeIdentityAction` has joined with a
 * single space since it was written; this is that rule, named.
 */
export function identityDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
