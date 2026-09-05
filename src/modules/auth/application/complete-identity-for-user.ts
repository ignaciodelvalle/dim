// Use-case: `completeIdentityForUser` — signup step 2, with no transport in it.
//
// WHY IT WAS EXTRACTED (PO decision, 2026-09-05)
// ---------------------------------------------------------------------------
// `completeIdentityAction` (./complete-identity.ts) is a Next SERVER ACTION: it
// takes `FormData`, reads the caller from a cookie-backed Supabase client, and
// answers `IdentityFormState` — three couplings to a browser request, and the
// reason `apps/mobile/app/identidad-pendiente.tsx` could say for months that
// "there is no `/api/v1` door for step 2" and be right. A native screen for a
// use-case with no endpoint is a form that cannot submit.
//
// The identity step now happens IN THE APP, so the core had to stop being a
// server action. What is left there is the adapter — FormData in, the DNI's own
// validation and its own error copy, `IdentityFormState` out — and what is here
// is the act: validate two names, write them, report who the caller now is.
//
// WHAT IT WRITES, AND WHY EACH COLUMN IS ON THE SAME UPDATE
// ---------------------------------------------------------------------------
//   display_name     — the whole point. `${firstName} ${lastName}`, joined by
//                      `identityDisplayName` in the contract so the web form and
//                      the phone cannot join it two different ways.
//   dni_hash/_last4  — ONLY when the caller passes a DNI, which today is only the
//                      web action. Never plaintext (`lib/utils/dni-hash.ts`), and
//                      `dni_verified` stays false: verification is its own flow.
//   tos_accepted_at  — provable consent (Ley 25.326 art. 5), COALESCE'd so a
//     / tos_version    retry preserves the ORIGINAL instant. Both surfaces
//                      require the checkbox in step 1 and neither can reach step
//                      2 without it, so arriving here means consent was given.
//
// One statement, because they are one act. Splitting the DNI out would mean a
// second UPDATE on the same row from the same request, and a window in which the
// name is stored and the DNI is not.
//
// `.returning()` AND NOT A SECOND SELECT. The caller needs the fresh `MeV1User`
// — that is the whole reason the native screen can redirect without a second
// login — and Postgres hands back the updated row for free. A follow-up read
// would be a second round trip AND a second answer: between the write and the
// read, `updateProfileForUser` or an admin could move the same columns, and the
// user this function reported would not be the one it wrote.
//
// THERE IS NO AUDIT ROW, and that is the web action's behaviour preserved rather
// than an omission introduced here. `scripts/check-audit-log-coverage.ts` scopes
// its rule to actions that establish OPERATOR authority; this is a citizen
// writing their own name, on their own row, with the id taken from the guard.
//
// THE CALLER'S ID IS A PARAMETER AND IT MUST COME FROM A GUARD. Same rule as
// `updateProfileForUser`, and the same reason `app/actions/profile.ts` refuses to
// export a bare writer: a `userId` taken from a request body would let any client
// rename any account by UUID. Both callers pass an id resolved by
// `requireLiveUser` or by `supabase.auth.getUser()`, never one off the wire.

import { eq, sql } from "drizzle-orm";

import { db, profiles } from "@/db";
import { isIdentityPending, toMeV1User } from "@/lib/domain/identity-completeness";
import { LEGAL_VERSION } from "@/lib/reference/legal-version";
import { dniLast4, hashDni } from "@/lib/utils/dni-hash";
import type { MeV1User } from "@dim/contract/api";
import { completeIdentityInputSchema, identityDisplayName } from "@dim/contract/input";

export type CompleteIdentityForUserInput = {
  /** From the auth guard. NEVER from a request body — see the header. */
  userId: string;
  /** The caller's address, for the still-provisional check. */
  email: string | null | undefined;
  firstName: string;
  lastName: string;
  /**
   * Digits only, already format-checked by the caller. Optional because only the
   * web step collects one; the native step deliberately does not (PO 2026-09-05).
   */
  dni?: string | null;
};

export type CompleteIdentityForUserResult =
  | { ok: true; user: MeV1User }
  /** Empty or over-long name. `field` names the box to put the red border on. */
  | { ok: false; error: "VALIDATION"; field: "firstName" | "lastName" }
  /** The names join into something `isIdentityPending` would still refuse. */
  | { ok: false; error: "STILL_PROVISIONAL" }
  /** No `profiles` row matched, or the driver refused. */
  | { ok: false; error: "WRITE_FAILED" };

export async function completeIdentityForUser(
  input: CompleteIdentityForUserInput,
): Promise<CompleteIdentityForUserResult> {
  // THE CONTRACT'S OWN SCHEMA, not a hand-written pair of `if (!x)` checks. It
  // trims, it bounds each half against the column the two halves share, and it is
  // the SAME parse the native screen runs locally before spending a request — so
  // a name this refuses is a name the phone already refused, and the two can only
  // disagree if one of them stops importing the contract.
  const parsed = completeIdentityInputSchema.safeParse({
    firstName: input.firstName,
    lastName: input.lastName,
  });
  if (!parsed.success) {
    // The FIRST issue's path, so the refusal names the box the person is looking
    // at. `lastName` only when nothing is wrong with `firstName`: a form reporting
    // its second error while its first is still on screen reads as random.
    const offending = parsed.error.issues.find(
      (issue) => issue.path[0] === "firstName" || issue.path[0] === "lastName",
    );
    return {
      ok: false,
      error: "VALIDATION",
      field: offending?.path[0] === "lastName" ? "lastName" : "firstName",
    };
  }

  const displayName = identityDisplayName(parsed.data.firstName, parsed.data.lastName);

  // THE CHECK THAT CANNOT LIVE IN THE SCHEMA, because it needs the caller's
  // ADDRESS and a wire schema has none. Writing a name that still satisfies
  // `isIdentityPending` would answer 200 to a request whose only purpose was to
  // make that predicate false, and the client would flip its stored user to
  // `profilePending: false` while `/me` kept saying the opposite — a gate that
  // bounces on the next cold start, for a person who did nothing wrong.
  //
  // It runs against the value that is about to be STORED, not against the raw
  // input: `"  perez  "` and `"perez"` are the same stored name.
  if (isIdentityPending({ displayName, email: input.email })) {
    return { ok: false, error: "STILL_PROVISIONAL" };
  }

  let rows: Array<{
    displayName: string;
    role: "owner" | "vet" | "govt" | "admin";
    accountType: "personal" | "institutional";
  }>;
  try {
    rows = await db
      .update(profiles)
      .set({
        displayName,
        ...(input.dni ? { dniHash: hashDni(input.dni), dniLast4: dniLast4(input.dni) } : {}),
        tosAcceptedAt: sql`COALESCE(${profiles.tosAcceptedAt}, now())`,
        tosVersion: LEGAL_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, input.userId))
      .returning({
        displayName: profiles.displayName,
        role: profiles.role,
        accountType: profiles.accountType,
      });
  } catch {
    // ONE FAILURE ARM FOR EVERY CAUSE, and on the web path that is a SECURITY
    // property rather than laziness — see `completeIdentityAction`'s own note.
    // A distinct "ese DNI ya está registrado" would confirm to an authenticated
    // attacker which DNIs exist, turning `profiles_dni_hash_unique` (migration
    // 0106) into an oracle. The duplicate is still prevented: the index rejects
    // the write, which is what brought us here.
    return { ok: false, error: "WRITE_FAILED" };
  }

  const updated = rows[0];
  // NO ROW MATCHED. Unreachable through either door as they stand — both resolve
  // the caller from a live session and `handle_new_user` guarantees the row — but
  // a service-role delete between the guard's read and this write produces it,
  // and an `undefined` flowing into `toMeV1User` would be a 500 with no sentence.
  if (updated === undefined) return { ok: false, error: "WRITE_FAILED" };

  // The SHARED projection, not a hand-built union. `toMeV1User` is what makes
  // "one type, one answer" a fact across `/me`, `/auth/login` and now this write;
  // the last time two handlers each built it by hand they disagreed about the
  // same account in the same second.
  return {
    ok: true,
    user: toMeV1User({
      id: input.userId,
      email: input.email,
      profile: {
        displayName: updated.displayName,
        role: updated.role,
        accountType: updated.accountType,
      },
    }),
  };
}
