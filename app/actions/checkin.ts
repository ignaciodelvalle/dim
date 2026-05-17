"use server";

// Owner self-reports a post-adoption check-in. Inserts a
// post_adoption_checkin pet_event, closes the soonest open
// post_adoption_checkin reminder for this pet+user, and fans out a
// notification to the originating refugio's admins.
//
// Owner-path access is required by design: the adopter is the one who
// self-reports (per AGENTS.md → Custody & adoption). Org members can READ
// the resulting event via pet-access cohabitation (slice 7) but must not
// WRITE the check-in themselves — that would defeat the "is the adopter
// actually engaged" signal the cron uses for missed-window fanout.

import {
  attachments,
  db,
  notifications,
  organizationMemberships,
  organizations,
  petEvents,
  reminders,
} from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { requirePetAccess } from "@/lib/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

async function cleanupOrphan(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  path: string | null,
): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Swallow — the row was never inserted, the file is orphaned at worst.
  }
}

export type CheckinFormState = { error: string | null };

export async function recordPostAdoptionCheckinAction(
  publicToken: string,
  _previous: CheckinFormState,
  formData: FormData,
): Promise<CheckinFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };

  if (access.accessPath !== "owner") {
    return { error: "Solo el adoptante puede registrar un check-in." };
  }

  const { supabase, user, pet } = access;

  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw || null;

  // Look up the most recent adoption_finalized event for this pet. The
  // related organization is denormalized from that payload so the check-in
  // event can stand on its own without re-joining ownerships history.
  const [adoption] = await db
    .select({ payload: petEvents.payload })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "adoption_finalized")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!adoption) {
    return { error: "No se encontró adopción registrada para esta mascota." };
  }

  const adoptionPayload = adoption.payload as {
    adopter_user_id?: string;
    previous_owner_organization_id?: string;
  };

  if (adoptionPayload.adopter_user_id !== user.id) {
    return { error: "No sos el adoptante registrado para esta mascota." };
  }

  const orgId = adoptionPayload.previous_owner_organization_id;
  if (!orgId) {
    return { error: "Adopción sin organización asociada." };
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("post_adoption_checkin", {
        related_organization_id: orgId,
        photo_attachment_ids: [],
        notes,
      });
      const now = new Date();
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "post_adoption_checkin",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload,
        })
        .returning({ id: petEvents.id });

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Close the soonest open post_adoption_checkin reminder for this
      // pet+user. Later windows stay open — the adopter self-reports
      // again at each milestone.
      const [next] = await tx
        .select({ id: reminders.id })
        .from(reminders)
        .where(
          and(
            eq(reminders.petId, pet.id),
            eq(reminders.userId, user.id),
            eq(reminders.reminderType, "post_adoption_checkin"),
            isNull(reminders.completedAt),
          ),
        )
        .orderBy(asc(reminders.dueAt))
        .limit(1);

      if (next) {
        await tx.update(reminders).set({ completedAt: now }).where(eq(reminders.id, next.id));
      }

      // Fan out to refugio admins. Matches the capability_request precedent
      // (admins only, not coordinators) — extend the role list here if the
      // refugio team wants broader visibility later.
      const [orgRow] = await tx
        .select({ publicToken: organizations.publicToken })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      const admins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, orgId),
            eq(organizationMemberships.role, "admin"),
            isNull(organizationMemberships.leftAt),
          ),
        );

      if (admins.length > 0) {
        await tx.insert(notifications).values(
          admins.map((a) => ({
            userId: a.userId,
            notificationType: "post_adoption_checkin_received",
            title: `Check-in de ${pet.name}`,
            body: `El adoptante de ${pet.name} registró un seguimiento post-adopción.`,
            severity: "info" as const,
            ctaLabel: "Ver mascota",
            ctaUrl: orgRow ? `/org/${orgRow.publicToken}/mascotas` : "/org",
            relatedPetId: pet.id,
            relatedEventId: event.id,
          })),
        );
      }
    });
  } catch (err) {
    await cleanupOrphan(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el check-in: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
