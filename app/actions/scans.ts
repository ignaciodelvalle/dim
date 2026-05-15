"use server";

// Record a credential_scanned event whenever the public credential page is
// viewed. Called from a tiny client component on the page (via useEffect) so
// the page render itself stays a pure read.

import { db, ownerships, petEvents, pets } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";

export async function logScanAction(publicToken: string): Promise<void> {
  if (!publicToken) return;

  const [pet] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Is the viewer the pet's current owner? Used to flag self-scans so the UI
  // can hide them from the default timeline.
  let isSelfScan = false;
  if (user) {
    const [ownership] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, pet.id),
          eq(ownerships.userId, user.id),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    isSelfScan = !!ownership;
  }

  const now = new Date();
  await db.insert(petEvents).values({
    petId: pet.id,
    eventType: "credential_scanned",
    occurredAt: now,
    recordedAt: now,
    recordedByUserId: user?.id ?? null,
    authorRole: isSelfScan ? "owner" : "scanner",
    payload: {
      is_self_scan: isSelfScan,
      viewer_authenticated: !!user,
    },
  });
}
