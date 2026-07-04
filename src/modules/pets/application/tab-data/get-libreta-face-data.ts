// get-libreta-face-data.ts — use-case for Face 2 (Libreta) of the two-face
// pet profile (ADR-4, design.md). Merges the former getLibretaTabData /
// getVacunasTabData / getHistorialTabData fetchers into a single deferred
// query batch. Auth guard is handled by the shim (app/actions/pet-tab-data.ts),
// which now allows both owner and org-path callers — this use-case itself
// never returns activeShares for org-path callers, so SharesManager stays
// owner-gated regardless of the widened read guard.
//
// Amendment projection (D2, projection-cron audit 2026-07-03 A): the fetched
// stream already contains the event_amended rows, so overlayAmendments
// (lib/infra/amendment.ts — a lib import, NOT an events-module dependency;
// check-dependency-direction stays satisfied) projects corrected payloads +
// amendedAt in one pure pass. Both the timeline rows AND the vaccination
// summary read the PROJECTED stream, so a corrected dose date/name flows
// into every derived view, not just a badge.

import { and, asc, desc, eq, exists, gt, inArray, isNull, not, sql } from "drizzle-orm";

import { mergeFutureLedger } from "@/components/pet-profile/libreta-future.helpers";
import {
  type Organization,
  type Pet,
  appointments,
  attachments,
  cases,
  db,
  libretaShareTokens,
  petEvents,
  reminders,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { fetchActiveRemindersForPet, fetchPetWeightHistory } from "@/lib/analytics/owner-dashboard";
import { computeVaccinationSummary } from "@/lib/domain/libreta-health-status";
import { excludeAuthorityOnlyClause, excludeSelfScansClause } from "@/lib/events/events";
import { overlayAmendments } from "@/lib/infra/amendment";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { HIDDEN_FROM_SUBJECT_CASE_KINDS } from "@/lib/infra/case-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { eventAttachmentSignedUrl } from "@/lib/infra/storage";
import { createClient } from "@/lib/supabase/server";
import type { HistorialEventRow, LibretaFaceData } from "./types";

// Owner-path guard against the welfare_denuncia bridge-event leak
// (pet-document-redesign REQ-1.2/1.3): excludes any pet_events row whose
// case_id belongs to a hidden-from-subject case. Filtered by caseId, NOT by
// event_type, so it's future-proof against new welfare-bridge event types
// (`symptom_observed` has no welfare caseId so it stays visible). NULL
// case_id events are NEVER touched — `not(exists(...))` correlates on
// `cases.id = pet_events.case_id`, which never matches a NULL caseId, so
// those rows always keep passing through.
function notHiddenCaseClause() {
  return not(
    exists(
      db
        .select({ one: sql`1` })
        .from(cases)
        .where(
          and(
            eq(cases.id, petEvents.caseId),
            inArray(cases.caseKind, [...HIDDEN_FROM_SUBJECT_CASE_KINDS]),
          ),
        ),
    ),
  );
}

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
    dueSoonWindowRule,
  ] = await Promise.all([
    db
      .select()
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, pet.id),
          excludeSelfScansClause(),
          // Authority-only surveillance signals never reach owner OR org
          // libreta views (§6) — clickthrough audit 2026-07-03 caught an
          // outbreak_signal row rendered in the owner timeline.
          excludeAuthorityOnlyClause(),
          // Owner-path only — org/vet viewers are never the investigation
          // subject, so the hidden-case filter doesn't apply to them.
          accessPath === "owner" ? notHiddenCaseClause() : undefined,
        ),
      )
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
    // due_soon_window (admin-rules-console, design ADR-4 item 2) — resolved
    // via the pet's own jurisdiction, pet-scoped resolution.
    resolveBusinessRule("due_soon_window", {
      country: "AR",
      province: pet.jurisdictionProvince,
      locality: pet.jurisdictionLocality,
    }),
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

  // Project amendments ONCE over the fetched stream (module docblock) —
  // timeline payloads, the Corregido badge (amendedAt) and the vaccination
  // summary all read corrected values.
  const projectedEvents = overlayAmendments(pastEvents);

  const past: HistorialEventRow[] = projectedEvents.map((e) => ({
    ...e,
    attachmentUrl: urlByEventId.get(e.id) ?? null,
    amendedAt:
      e.amendedAt instanceof Date ? e.amendedAt : e.amendedAt ? new Date(e.amendedAt) : null,
  }));

  const summary = computeVaccinationSummary(
    projectedEvents,
    pet.species,
    new Date(),
    dueSoonWindowRule.payload.days,
  );

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
