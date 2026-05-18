"use server";

// Server actions for appointment attendance, no-show, and org cancellation
// (Fases 5 + 8).
//
// Provider polymorphism:
//   - appointment.organization_id set → org-side path → requireCapability('appointment.manage', orgId)
//   - appointment.provider_user_id set (via offering) → vet path → requireVetProviderOrRedirect + identity check
//
// Medical event authorship rules:
//   - Org member with role=vet_individual: author_role='vet', author_organization_id=orgId, author_verified=org.verified
//   - Other org members: author_role='shelter', author_organization_id=orgId, author_verified=org.verified
//   - Independent vet provider: author_role='vet', author_organization_id=null, author_verified=true (matriculaVerified gate)
//
// Writer/wrapper split:
//   markAppointmentAttendedWriter — pure DB function, testable without HTTP context.
//   markAppointmentAttendedAction — gates auth, then delegates.

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  appointments,
  db,
  notifications,
  organizationMemberships,
  petEvents,
  pets,
  reminders,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { requireCapability, type RequireCapabilitySuccess } from "@/lib/capabilities";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { validateEventPayload } from "@/lib/event-schemas";
import { findServiceKind } from "@/lib/service-kinds";

// ============================================================================
// Result types
// ============================================================================

export type AttendanceResult = { ok: true } | { error: string };

// ============================================================================
// Per-service-kind attendance payload types
// These map to the Zod schemas in lib/event-schemas.ts.
// The form components provide these payloads; the writer validates them.
// ============================================================================

export type VaccinationPayload = {
  vaccine_name: string;
  brand: string | null;
  batch: string | null;
  administered_by: string | null;
  next_due_at: string | null;
};

export type DewormingPayload = {
  product: string;
  type: "internal" | "external" | "both";
  next_due_at: string | null;
};

export type SterilizationPayload = {
  procedure: "castration" | "spay";
  performed_by: string | null;
  clinic: string | null;
};

export type VetVisitPayload = {
  reason: string;
  diagnosis: string | null;
  vet_name: string | null;
  clinic: string | null;
};

export type AttendancePayload =
  | ({ kind: "vaccination" } & VaccinationPayload)
  | ({ kind: "deworming" } & DewormingPayload)
  | ({ kind: "sterilization" } & SterilizationPayload)
  | ({ kind: "vet_visit" } & VetVisitPayload);

// ============================================================================
// Authorship descriptor
// ============================================================================

export type AuthorDescriptor = {
  actorUserId: string;
  authorRole: "vet" | "shelter";
  authorOrganizationId: string | null;
  authorVerified: boolean;
};

// ============================================================================
// Inner writer
// ============================================================================

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

      // 4. If vaccination with next_due_at, insert a reminder for the owner.
      if (
        payload.kind === "vaccination" &&
        payload.next_due_at &&
        appointment.ownerUserId
      ) {
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
    throw err;
  }
}

// ============================================================================
// Org-side attendance action (Fase 5)
// ============================================================================

export async function markAppointmentAttendedAction(
  appointmentToken: string,
  payload: AttendancePayload,
): Promise<AttendanceResult> {
  // Load the appointment to determine provider type.
  const [appt] = await db
    .select({
      id: appointments.id,
      organizationId: appointments.organizationId,
      serviceOfferingId: appointments.serviceOfferingId,
    })
    .from(appointments)
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!appt) return { error: "Turno no encontrado." };

  if (appt.organizationId) {
    // Org-side path.
    const capResult = await requireCapability("appointment.manage", appt.organizationId);
    if (capResult.error) return { error: capResult.error };
    const cap = capResult as RequireCapabilitySuccess;

    // Determine author_role: vet_individual membership → 'vet', else 'shelter'.
    const authorRole: "vet" | "shelter" =
      cap.membership.role === "vet_individual" ? "vet" : "shelter";

    const author: AuthorDescriptor = {
      actorUserId: cap.user.id,
      authorRole,
      authorOrganizationId: appt.organizationId,
      authorVerified: cap.organization.verified,
    };

    const result = await markAppointmentAttendedWriter(appt.id, payload, author);
    if ("ok" in result) {
      revalidatePath(`/org/${cap.organization.publicToken}/agenda`);
      revalidatePath(`/mis-mascotas`);
    }
    return result;
  }

  // Independent vet path — check the offering's provider_user_id.
  const [offering] = await db
    .select({ providerUserId: serviceOfferings.providerUserId })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, appt.serviceOfferingId))
    .limit(1);

  if (!offering?.providerUserId) return { error: "Prestador no encontrado." };

  const vetSession = await requireVetProviderOrRedirect();
  if (vetSession.user.id !== offering.providerUserId) {
    return { error: "No tenés permiso para este turno." };
  }

  const author: AuthorDescriptor = {
    actorUserId: vetSession.user.id,
    authorRole: "vet",
    authorOrganizationId: null,
    authorVerified: true, // matriculaVerified is the gate in requireVetProviderOrRedirect
  };

  const result = await markAppointmentAttendedWriter(appt.id, payload, author);
  if ("ok" in result) {
    revalidatePath("/pro/agenda");
    revalidatePath("/mis-mascotas");
  }
  return result;
}

// ============================================================================
// No-show action (Fase 5)
// ============================================================================

export async function markAppointmentNoShowAction(
  appointmentToken: string,
  reason: string,
): Promise<AttendanceResult> {
  const [appt] = await db
    .select({
      id: appointments.id,
      organizationId: appointments.organizationId,
      status: appointments.status,
      serviceOfferingId: appointments.serviceOfferingId,
    })
    .from(appointments)
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!appt) return { error: "Turno no encontrado." };
  if (appt.status !== "confirmed") {
    return { error: "El turno ya fue procesado." };
  }

  let actorUserId: string;
  let orgPublicToken: string | null = null;

  if (appt.organizationId) {
    const capResult = await requireCapability("appointment.manage", appt.organizationId);
    if (capResult.error) return { error: capResult.error };
    const cap = capResult as RequireCapabilitySuccess;
    actorUserId = cap.user.id;
    orgPublicToken = cap.organization.publicToken;
  } else {
    const [offering] = await db
      .select({ providerUserId: serviceOfferings.providerUserId })
      .from(serviceOfferings)
      .where(eq(serviceOfferings.id, appt.serviceOfferingId))
      .limit(1);

    if (!offering?.providerUserId) return { error: "Prestador no encontrado." };
    const vetSession = await requireVetProviderOrRedirect();
    if (vetSession.user.id !== offering.providerUserId) {
      return { error: "No tenés permiso para este turno." };
    }
    actorUserId = vetSession.user.id;
  }

  const now = new Date();
  await db
    .update(appointments)
    .set({
      status: "no_show",
      noShowMarkedAt: now,
      notesFromOrg: reason || null,
      updatedAt: now,
    })
    .where(eq(appointments.id, appt.id));

  if (orgPublicToken) {
    revalidatePath(`/org/${orgPublicToken}/agenda`);
  } else {
    revalidatePath("/pro/agenda");
  }

  return { ok: true };
}

// ============================================================================
// Org cancellation action (Fase 5)
// ============================================================================

export async function cancelAppointmentByOrgAction(
  appointmentToken: string,
  reason: string,
): Promise<AttendanceResult> {
  const [appt] = await db
    .select({
      id: appointments.id,
      organizationId: appointments.organizationId,
      slotId: appointments.slotId,
      status: appointments.status,
      ownerUserId: appointments.ownerUserId,
      serviceOfferingId: appointments.serviceOfferingId,
    })
    .from(appointments)
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!appt) return { error: "Turno no encontrado." };
  if (appt.status !== "confirmed") {
    return { error: "El turno ya fue procesado." };
  }

  let actorUserId: string;
  let orgPublicToken: string | null = null;
  let orgDisplayName: string | null = null;

  if (appt.organizationId) {
    const capResult = await requireCapability("appointment.manage", appt.organizationId);
    if (capResult.error) return { error: capResult.error };
    const cap = capResult as RequireCapabilitySuccess;
    actorUserId = cap.user.id;
    orgPublicToken = cap.organization.publicToken;
    orgDisplayName = cap.organization.displayName;
  } else {
    const [offering] = await db
      .select({ providerUserId: serviceOfferings.providerUserId })
      .from(serviceOfferings)
      .where(eq(serviceOfferings.id, appt.serviceOfferingId))
      .limit(1);

    if (!offering?.providerUserId) return { error: "Prestador no encontrado." };
    const vetSession = await requireVetProviderOrRedirect();
    if (vetSession.user.id !== offering.providerUserId) {
      return { error: "No tenés permiso para este turno." };
    }
    actorUserId = vetSession.user.id;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Update appointment status.
    await tx
      .update(appointments)
      .set({
        status: "cancelled_by_org",
        cancelledAt: now,
        cancelledByUserId: actorUserId,
        cancellationReason: reason || null,
        updatedAt: now,
      })
      .where(eq(appointments.id, appt.id));

    // 2. Decrement bookings_count on the slot (free capacity).
    await tx
      .update(timeSlots)
      .set({
        bookingsCount: sql`${timeSlots.bookingsCount} - 1`,
        updatedAt: now,
      })
      .where(eq(timeSlots.id, appt.slotId));

    // 3. Notify the owner.
    if (appt.ownerUserId) {
      const providerLabel = orgDisplayName ?? "Tu prestador";
      await tx.insert(notifications).values({
        userId: appt.ownerUserId,
        notificationType: "appointment_cancelled_by_org",
        title: "Turno cancelado",
        body: reason
          ? `${providerLabel} canceló tu turno. Motivo: ${reason}`
          : `${providerLabel} canceló tu turno.`,
        severity: "warning",
        ctaLabel: "Ver mis turnos",
        ctaUrl: "/mis-turnos",
      });
    }
  });

  if (orgPublicToken) {
    revalidatePath(`/org/${orgPublicToken}/agenda`);
  } else {
    revalidatePath("/pro/agenda");
  }
  revalidatePath("/mis-turnos");

  return { ok: true };
}
