// get-libreta-face-data.ts — use-case for Face 2 (Libreta) of the two-face
// pet profile (ADR-4, design.md). Merges the former getLibretaTabData /
// getVacunasTabData / getHistorialTabData fetchers into a single deferred
// query batch. Auth guard is handled by the shim (app/actions/pet-tab-data.ts),
// which now allows both owner and org-path callers — this use-case itself
// never returns activeShares for org-path callers, so SharesManager stays
// owner-gated regardless of the widened read guard.
//
// H3/WS-3 amendment enrichment (amendedAt) is deliberately NOT done here —
// it stays in the shim (app layer), same as the old getHistorialTabData
// shim, so the pets module does not take a new dependency on the events
// module (see scripts/check-dependency-direction.ts ALLOWED_EDGES).

import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import { mergeFutureLedger } from "@/components/pet-profile/libreta-future.helpers";
import {
  type Organization,
  type Pet,
  appointments,
  attachments,
  db,
  libretaShareTokens,
  petEvents,
  reminders,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { fetchActiveRemindersForPet, fetchPetWeightHistory } from "@/lib/analytics/owner-dashboard";
import { computeVaccinationSummary } from "@/lib/domain/libreta-health-status";
import { excludeSelfScansClause } from "@/lib/events/events";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { eventAttachmentSignedUrl } from "@/lib/infra/storage";
import { createClient } from "@/lib/supabase/server";
import type { HistorialEventRow, LibretaFaceData } from "./types";

export async function getLibretaFaceData(context: {
  user: { id: string };
  pet: Pet;
  accessPath: "owner" | "org";
  organization: Organization | null;
}): Promise<{ ok: true; data: LibretaFaceData } | { ok: false; error: string }> {
  const { user, pet, accessPath } = context;

  const [
    pastEvents,
    activeReminders,
    pendingMedicationReminders,
    upcomingAppointments,
    weightSamples,
    identifications,
    activeShares,
  ] = await Promise.all([
    db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
      .orderBy(desc(petEvents.occurredAt)),
    accessPath === "owner" ? fetchActiveRemindersForPet(user.id, pet.id) : Promise.resolve([]),
    db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.petId, pet.id),
          eq(reminders.reminderType, "medication"),
          isNull(reminders.completedAt),
        ),
      )
      .orderBy(asc(reminders.dueAt)),
    db
      .select({
        publicToken: appointments.publicToken,
        offeringDisplayName: serviceOfferings.displayName,
        slotStartsAt: timeSlots.startsAt,
      })
      .from(appointments)
      .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
      .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
      .where(
        and(
          eq(appointments.petId, pet.id),
          eq(appointments.status, "confirmed"),
          gt(timeSlots.startsAt, new Date()),
        ),
      )
      .orderBy(asc(timeSlots.startsAt))
      .limit(10),
    fetchPetWeightHistory(pet.id),
    fetchActiveIdentifications(pet.id),
    accessPath === "owner"
      ? db
          .select()
          .from(libretaShareTokens)
          .where(and(eq(libretaShareTokens.petId, pet.id), isNull(libretaShareTokens.revokedAt)))
      : Promise.resolve([]),
  ]);

  // Signed attachment URLs — one batched Storage round-trip.
  const eventIds = pastEvents.map((e) => e.id);
  const attachmentRows =
    eventIds.length > 0
      ? await db.select().from(attachments).where(inArray(attachments.eventId, eventIds))
      : [];
  const supabase = await createClient();
  const urlByEventId = new Map<string, string>();
  await Promise.all(
    attachmentRows.map(async (a) => {
      if (!a.eventId) return;
      const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
      if (url) urlByEventId.set(a.eventId, url);
    }),
  );

  // H3/WS-3 amendedAt enrichment happens in the shim (app/actions/pet-tab-data.ts)
  // after this use-case returns — see the module-boundary note above.
  const past: HistorialEventRow[] = pastEvents.map((e) => ({
    ...e,
    attachmentUrl: urlByEventId.get(e.id) ?? null,
    amendedAt: null,
  }));

  const summary = computeVaccinationSummary(pastEvents, pet.species);

  const future = mergeFutureLedger(
    activeReminders.map((r) => ({
      reminderId: r.reminderId,
      title: r.title,
      dueAt: r.dueAt,
      variant: r.variant,
    })),
    upcomingAppointments,
    pendingMedicationReminders.map((r) => ({
      reminderId: r.id,
      drugName: r.title,
      dueAt: r.dueAt,
    })),
  );

  return {
    ok: true,
    data: {
      identity: {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        microchipId: identifications.microchip?.code ?? null,
        tattooCode: identifications.tattoo?.code ?? null,
        tattooLocation: identifications.tattoo?.tattooLocation ?? null,
        publicToken: pet.publicToken,
      },
      future,
      past,
      summary,
      weightSamples,
      activeShares,
      accessPath,
    },
  };
}
