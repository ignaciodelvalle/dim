import { db, ownerships, pets } from "@/db";
import { and, eq, exists, isNull, sql } from "drizzle-orm";

/**
 * Join predicate for the pet a notification points at.
 *
 * NotificationCard turns a joined pet into a "Ver {nombre}" button aimed at
 * /mis-mascotas/{token} — the OWNER surface. Joining on `relatedPetId` alone
 * offered that button to people who no longer own the pet: the notification
 * confirming you handed your pet over linked to a page that answered "No
 * encontramos esta página" (adversarial review 2026-08-08, S6-F02). The app
 * already knew — that 404 IS the access check working — but the two queries
 * never spoke to each other.
 *
 * Requiring a LIVE ownership by the reader fixes every notification type at
 * once, not just transfers: a link to an owner surface is wrong for a non-owner
 * in every case. The rest of the card (title, body, ctaUrl) is untouched, so the
 * notification still explains what happened — it just stops promising a door
 * that is locked.
 *
 * Exported (rather than inlined in page.tsx) so its test exercises the REAL
 * predicate. A test that re-declares the query would only prove the copy works,
 * which is how the sibling bug in this batch survived its own suite.
 */
export function petVisibleToReader(relatedPetId: unknown, readerUserId: string) {
  return and(
    eq(relatedPetId as never, pets.id),
    exists(
      db
        .select({ one: sql`1` })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pets.id),
            eq(ownerships.ownerUserId, readerUserId),
            isNull(ownerships.endedAt),
          ),
        ),
    ),
  );
}
