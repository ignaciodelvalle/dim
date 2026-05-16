import { attachments, db, petEvents } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { requireOwnedPetByToken } from "@/lib/pets";
import { eventAttachmentSignedUrl } from "@/lib/storage";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { EventTimeline } from "../EventTimeline";

export default async function PetHistorialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return null;
  const { pet } = session;

  // Fetch events newest-first (same order as the detail page used to).
  // Self-scans are filtered at the DB layer — see lib/events.excludeSelfScansClause.
  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
    .orderBy(desc(petEvents.occurredAt));

  // Per-event attachments with signed URLs.
  const eventIds = events.map((e) => e.id);
  const eventAttachmentRows =
    eventIds.length > 0
      ? await db.select().from(attachments).where(inArray(attachments.eventId, eventIds))
      : [];

  // We need the supabase client for signed URL generation.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const eventAttachmentUrls = new Map<string, string>();
  await Promise.all(
    eventAttachmentRows.map(async (a) => {
      if (!a.eventId) return;
      const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
      if (url) eventAttachmentUrls.set(a.eventId, url);
    }),
  );

  const eventsWithAttachments = events.map((e) => ({
    ...e,
    attachmentUrl: eventAttachmentUrls.get(e.id) ?? null,
  }));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a {pet.name}
        </Link>

        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {pet.name}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            Historial completo de {pet.name}
          </p>
        </div>

        <EventTimeline events={eventsWithAttachments} publicToken={pet.publicToken} />
      </div>
    </main>
  );
}
