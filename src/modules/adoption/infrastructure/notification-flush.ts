// Post-transaction notification fan-out for the adoption module, for BOTH doors.
//
// It was a private helper in `src/modules/adoption/actions.ts`, which is a
// `"use server"` module — every export of one is an independently addressable
// server action, so this could not simply be exported from there. It moves
// instead, unchanged, so the bearer door and the four cookie actions run the
// same insert rather than two.
//
// WHY IT NEVER THROWS. The notifications are collected INSIDE the use-case's
// transaction (the event id has to exist first) and inserted OUTSIDE it, on
// purpose: an application that landed on the append-only spine must not be
// rolled back because a notification row failed. The caller has already
// committed something real by the time this runs, so the only honest failure
// mode is a log.
//
// IT IS THE RAW INSERT AND NOT `lib/infra/notification-service.ts`, which is
// the baselined debt `docs/agents/open-work.md` records against the editar door
// ("the raw insert the neighbouring cookie door still uses"). Moving this door
// to the service while the four cookie actions stayed on the insert would have
// made the two doors differ in a way nothing tests — which is the failure this
// extraction exists to prevent. One implementation, one debt, one place to pay
// it off.

import { db, notifications } from "@/db";

import type { NewNotification } from "../application/set-adoption-eligibility";

/** Flush notifications post-tx, best-effort. Never throws. */
export async function flushAdoptionNotifications(pending: NewNotification[]): Promise<void> {
  if (pending.length === 0) return;
  try {
    // Cast through unknown to bridge NewNotification (minimal shape) to Drizzle's
    // notifications.$inferInsert (which uses enum literal types). All values are
    // valid by construction; the cast avoids re-importing the full Drizzle schema type.
    await db
      .insert(notifications)
      .values(pending as unknown as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[adoption] notifications insert failed (the write did succeed):", e);
  }
}
