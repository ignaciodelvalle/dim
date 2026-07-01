// Use-case: recordPostAdoptionCheckin — owner self-reports a post-adoption
// check-in (strangler migration 33/61).
//
// Inserts a post_adoption_checkin pet_event, closes the soonest open
// post_adoption_checkin reminder for this pet+user, and fans out a
// notification to the originating refugio's admins.
//
// Owner-path access is enforced by the thin shim (app/actions/checkin.ts);
// this use-case receives the authenticated access context and runs the rest
// verbatim.

import {
  attachments,
  db,
  notifications,
  organizationMemberships,
  organizations,
  petEvents,
  reminders,
} from "@/db";
import { insertEventIdempotent } from "@/lib/events/event-idempotency";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { CoordError, normalizeLocationForWrite } from "@/lib/location-normalize";
import { parseLocationFromFormData } from "@/lib/location-value";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import type { CheckinFormState } from "./types";

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

export async function recordPostAdoptionCheckin(
  publicToken: string,
  access: {
    supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
    user: { id: string };
    pet: { id: string; name: string };
  },
  formData: FormData,
): Promise<CheckinFormState> {
  const { supabase, user, pet } = access;

  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;
  // Per-event L1 (sprint 4 PR-034). Optional.
  // Canonicalize the ISO provinceCode (e.g. "AR-C") to the display name ("CABA")
  // that every other jurisdiction_province write stores. Without this, the raw
  // ISO code landed in the JSONB payload and govt-dashboard aggregation that
  // filters on display names silently missed check-in events.
  const loc = parseLocationFromFormData(formData);
  // locality:"none" — canonicalize province only, no catalog lookup (checkin behavior unchanged).
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const eventJurisdictionProvince = normalizedLoc.province;
  const eventJurisdictionLocality = normalizedLoc.locality;

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
        jurisdiction_province: eventJurisdictionProvince,
        jurisdiction_locality: eventJurisdictionLocality,
      });
      const now = new Date();
      const { event, wasNoop: checkinNoop } = await insertEventIdempotent(
        {
          petId: pet.id,
          eventType: "post_adoption_checkin",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload,
          clientIdempotencyKey,
        },
        tx as Parameters<typeof insertEventIdempotent>[1],
      );
      if (checkinNoop) return;

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
