// Public pet resolution — the ONE predicate every ungated public surface uses
// to turn a `publicToken` into a pet row.
//
// PO-4 (2026-08-05): erasing a subject (Ley 25.326 art. 16) soft-deletes the
// pets in their custody — `erase-subject-data.ts` sets `pets.deleted_at` and
// leaves the row in place so the append-only spine stays intact. Every public
// surface, however, resolved the token with a bare `eq(pets.publicToken, …)`,
// so an erased subject's credential kept answering to anyone who scanned the
// QR. The physical chapa (/t/[serial] → /p) made that pre-existing behavior
// reachable from a new, durable object.
//
// The PO decided the credential goes dark with the erasure. The predicate
// lives here, in ONE place, because the failure mode is a route that simply
// forgets: a query that never filters looks exactly like a query that does
// until someone scans a token that should be gone.
//
// SCOPE — this is deliberately about the PET row only. A pet transferred to a
// new owner BEFORE the ex-owner's erasure is not soft-deleted (the erasure
// touches pets in the subject's custody at erasure time), so it keeps
// resolving. The credential belongs to the animal (invariant #1); it is
// switched off only when the animal's own row is erased.

import { and, eq, isNull } from "drizzle-orm";

import { pets } from "@/db";

/**
 * Drizzle predicate matching the pet a public token resolves to, EXCLUDING
 * soft-deleted rows. Compose it with `and(...)` when a caller needs more
 * conditions (see /adoptar/[petToken]/postular).
 */
export function publicPetByToken(publicToken: string) {
  return and(eq(pets.publicToken, publicToken), isNull(pets.deletedAt));
}
