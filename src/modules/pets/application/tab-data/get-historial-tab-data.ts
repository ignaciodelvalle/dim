// get-historial-tab-data.ts — use-case for the Historial tab panel.
// Auth guard is handled by the shim (app/actions/pet-tab-data.ts).

import { and, desc, eq, inArray } from "drizzle-orm";

import { type Pet, attachments, db, petEvents } from "@/db";
import { excludeSelfScansClause } from "@/lib/events/events";
import { eventAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { HistorialTabData } from "./types";

export async function getHistorialTabData(
  pet: Pet,
): Promise<{ ok: true; data: HistorialTabData } | { ok: false; error: string }> {
  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
    .orderBy(desc(petEvents.occurredAt));

  const eventIds = events.map((e) => e.id);
  const eventAttachmentRows =
    eventIds.length > 0
      ? await db.select().from(attachments).where(inArray(attachments.eventId, eventIds))
      : [];

  const supabase = await createClient();
  const urlMap = new Map<string, string>();
  await Promise.all(
    eventAttachmentRows.map(async (a) => {
      if (!a.eventId) return;
      const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
      if (url) urlMap.set(a.eventId, url);
    }),
  );

  return {
    ok: true,
    data: {
      petName: pet.name,
      petToken: pet.publicToken,
      events: events.map((e) => ({
        ...e,
        attachmentUrl: urlMap.get(e.id) ?? null,
      })),
    },
  };
}
