// Shared adoption gate for the post-adoption check-in surfaces (QA A9).
//
// The check-in page (eventos/nuevo/checkin/page.tsx) 404s unless the pet's
// LATEST adoption_finalized event names the current user as the adopter.
// The anotar capture catalog (ALL_CAPTURE_OPTIONS) used to list the
// "Check-in post-adopción" entry unconditionally, sending every non-adopter
// straight into that 404. Both surfaces now share this single predicate:
// the server-side option assembly includes the entry only when it passes,
// and the page keeps running it as its defense-in-depth gate.

import { db, petEvents } from "@/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * True when the pet's most recent adoption_finalized event names `userId`
 * as the adopter — the same query + payload check the check-in page enforces.
 * Latest-event-wins: a re-adoption to a different family revokes the old
 * adopter's check-in surface.
 */
export async function isPetAdoptedByUser(petId: string, userId: string): Promise<boolean> {
  const [adoption] = await db
    .select({ payload: petEvents.payload })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "adoption_finalized")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  if (!adoption) return false;
  const adopterId = (adoption.payload as { adopter_user_id?: string }).adopter_user_id;
  return adopterId === userId;
}
