// markAppointmentAttendedWriter — pure DB function, testable without HTTP context.
// Moved verbatim from app/actions/attendance.ts (strangler 12/61).
//
// The caller is responsible for:
//   1. Authenticating the actor.
//   2. Verifying the appointment belongs to the actor's org or is the vet provider.
//   3. Resolving the AuthorDescriptor.

import { and, eq } from "drizzle-orm";

import {
  appointments,
  db,
  petEvents,
  petIdentifications,
  pets,
  reminders,
  serviceOfferings,
} from "@/db";
import { matchesDbError } from "@/lib/db-errors";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { findServiceKind } from "@/lib/reference/service-kinds";
import { chipImplantSiteFromLocation } from "@/src/modules/pets/domain/pet-rules";

import type { AttendancePayload, AttendanceResult, AuthorDescriptor } from "./types";

/**
 * Core attendance writer. Validates the payload, updates the appointment,
 * inserts the pet_event, and optionally inserts a vaccination reminder.
 *
 * The caller is responsible for:
 *   1. Authenticating the actor.
 *   2. Verifying the appointment belongs to the actor's org or is the vet provider.
 *   3. Resolving the AuthorDescriptor.
 */
export async function markAppointmentAttendedWriter(
  appointmentId: string,
  payload: AttendancePayload,
  author: AuthorDescriptor,
): Promise<AttendanceResult> {
  try {
    // Load appointment + offering + pet.
    const [row] = await db
      .select({
        appointment: appointments,
        offering: serviceOfferings,
        pet: pets,
      })
      .from(appointments)
      .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
      .innerJoin(pets, eq(pets.id, appointments.petId))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!row) return { error: "Turno no encontrado." };
    if (row.appointment.status !== "confirmed") {
      return { error: "El turno ya fue procesado (asistido, cancelado o ausente)." };
    }

    const { appointment, offering, pet } = row;

    // Derive event type from the service kind catalog.
    const kindDef = findServiceKind(offering.serviceKind);
    const eventType = kindDef?.emitted_event_type ?? "vet_visit_logged";

    // Build and validate the raw event payload.
    let rawPayload: Record<string, unknown>;
    if (payload.kind === "vaccination") {
      rawPayload = {
        vaccine_name: payload.vaccine_name,
        brand: payload.brand,
        batch: payload.batch,
        administered_by: payload.administered_by,
        next_due_at: payload.next_due_at,
      };
    } else if (payload.kind === "deworming") {
      rawPayload = {
        product: payload.product,
        type: payload.type,
        next_due_at: payload.next_due_at,
      };
    } else if (payload.kind === "sterilization") {
      rawPayload = {
        procedure: payload.procedure,
        performed_by: payload.performed_by,
        clinic: payload.clinic,
      };
    } else if (payload.kind === "microchip") {
      rawPayload = {
        chip_number: payload.chip_number,
        country_code: payload.country_code,
        implanted_by: payload.implanted_by,
        location_on_body: payload.location_on_body,
      };
    } else {
      // vet_visit (generic fallback)
      rawPayload = {
        reason: payload.reason,
        diagnosis: payload.diagnosis,
        vet_name: payload.vet_name,
        clinic: payload.clinic,
      };
    }

    // Validate against the strict Zod schema.
    const validatedPayload = validateEventPayload(eventType, rawPayload);

    const now = new Date();

    // Microchip pre-check: surface a friendly inline error when the chip is
    // already registered on a DIFFERENT active pet (the chip_unique partial
    // index would otherwise raise a raw 500). A chip already active on THIS
    // pet is a no-op re-sync handled by insertIdentification's guard below.
    if (payload.kind === "microchip") {
      const dupes = await db
        .select({ petId: petIdentifications.petId })
        .from(petIdentifications)
        .where(
          and(
            eq(petIdentifications.code, payload.chip_number),
            eq(petIdentifications.kind, "microchip_iso"),
            eq(petIdentifications.status, "active"),
          ),
        )
        .limit(1);
      if (dupes[0] && dupes[0].petId !== pet.id) {
        return { error: "Ese chip ya está registrado en otra mascota activa." };
      }
    }

    // Whether the pet already holds an active canonical microchip row — drives
    // the dual-write guard below (same pattern as createMicrochip use-case).
    const petHasCanonicalChip =
      payload.kind === "microchip"
        ? (await fetchActiveIdentifications(pet.id)).microchip !== null
        : false;

    await db.transaction(async (tx) => {
      // 1. UPDATE appointment status.
      await tx
        .update(appointments)
        .set({
          status: "attended",
          attendedAt: now,
          attendedByUserId: author.actorUserId,
          updatedAt: now,
        })
        .where(eq(appointments.id, appointmentId));

      // 2. INSERT pet_event.
      const [newEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType,
          occurredAt: now,
          recordedByUserId: author.actorUserId,
          authorRole: author.authorRole,
          authorOrganizationId: author.authorOrganizationId,
          authorVerified: author.authorVerified,
          payload: validatedPayload as Record<string, unknown>,
        })
        .returning({ id: petEvents.id });

      // 3. Link outcome event to appointment.
      await tx
        .update(appointments)
        .set({ outcomeEventId: newEvent.id })
        .where(eq(appointments.id, appointmentId));

      // 4. Microchip canonical dual-write (ARCH-O): every microchip_implanted
      // writer must insert the canonical pet_identifications row, mirroring
      // createMicrochip. Only when the pet had no prior active chip — the
      // pre-check above already rejected a chip active on another pet.
      if (payload.kind === "microchip" && !petHasCanonicalChip) {
        const implantSite = chipImplantSiteFromLocation(payload.location_on_body);
        await tx.insert(petIdentifications).values({
          petId: pet.id,
          kind: "microchip_iso",
          code: payload.chip_number,
          recordedAt: now.toISOString().slice(0, 10),
          recordedByUserId: author.actorUserId,
          recordedByLabel: payload.implanted_by,
          isoCountryCode: payload.chip_number.slice(0, 3),
          isoManufacturerCode: payload.chip_number.slice(3, 7),
          isoNationalId: payload.chip_number.slice(7, 15),
          isoCompliant: true,
          ...(implantSite ? { implantationSite: implantSite } : {}),
        });
      }

      // 5. If vaccination with next_due_at, insert a reminder for the owner.
      if (payload.kind === "vaccination" && payload.next_due_at && appointment.ownerUserId) {
        await tx.insert(reminders).values({
          petId: pet.id,
          userId: appointment.ownerUserId,
          reminderType: "vaccine",
          dueAt: new Date(payload.next_due_at),
          title: `Próxima dosis: ${payload.vaccine_name}`,
          description: payload.brand ? `Marca: ${payload.brand}` : null,
          sourceEventId: newEvent.id,
          appointmentId: appointment.id,
        });
      }
    });

    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "EventPayloadValidationError") {
      return { error: err.message };
    }
    // Duplicate-chip race: the pre-check passed but a concurrent write claimed
    // the chip first. Surface the same friendly message instead of a raw 500.
    if (matchesDbError(err, { constraint: /pet_identifications_chip_unique/ })) {
      return { error: "Ese chip ya está registrado en otra mascota activa." };
    }
    throw err;
  }
}
