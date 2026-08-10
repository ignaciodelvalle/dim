"use server";

// attendance.ts — thin shim (strangler migration 12/61).
//
// Business logic moved to:
//   src/modules/events/application/attendance/
//
// This file re-exports all types and the pure writer (used by integration
// tests and form components) and provides thin Action wrappers (used by UI
// components) that add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { appointments, db, pets, profiles } from "@/db";
import { cancelAppointmentByOrg as _cancelAppointmentByOrg } from "@/src/modules/events/application/attendance/cancel-appointment-by-org";
import { markAppointmentAttendedWriter as _markAppointmentAttendedWriter } from "@/src/modules/events/application/attendance/mark-appointment-attended";
import { markAppointmentNoShow as _markAppointmentNoShow } from "@/src/modules/events/application/attendance/mark-appointment-no-show";
import {
  type RequireCapabilitySuccess,
  requireCapability,
} from "@/src/modules/organizations/infrastructure/authz-resolver";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  AttendancePayload,
  AttendanceResult,
  AuthorDescriptor,
  DewormingPayload,
  MicrochipPayload,
  SterilizationPayload,
  VaccinationPayload,
  VetVisitPayload,
} from "@/src/modules/events/application/attendance/types";

// Bare writer is NOT re-exported here (impersonation triage, review 07).
// markAppointmentAttendedWriter takes a caller-supplied author descriptor
// (actorUserId, authorOrganizationId, authorVerified); exporting it from a
// "use server" file would let any client write attendance events as any
// vet/org. It lives on in
// src/modules/events/application/attendance/mark-appointment-attended;
// integration tests import it from there, and markAppointmentAttendedAction
// below derives the author from requireCapability("appointment.manage").

// ---------------------------------------------------------------------------
// Action wrappers — thin controllers for UI components
// ---------------------------------------------------------------------------

// ============================================================================
// Org-side attendance action (Fase 5)
// ============================================================================

export async function markAppointmentAttendedAction(
  appointmentToken: string,
  payload: Parameters<typeof _markAppointmentAttendedWriter>[1],
): Promise<Awaited<ReturnType<typeof _markAppointmentAttendedWriter>>> {
  // Load the appointment (with pet public token) to determine provider type.
  const [appt] = await db
    .select({
      id: appointments.id,
      organizationId: appointments.organizationId,
      serviceOfferingId: appointments.serviceOfferingId,
      petPublicToken: pets.publicToken,
    })
    .from(appointments)
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!appt) return { error: "Turno no encontrado." };

  if (!appt.organizationId) return { error: "Prestador no encontrado." };

  const capResult = await requireCapability("appointment.manage", appt.organizationId);
  if (capResult.error) return { error: capResult.error };
  const cap = capResult as RequireCapabilitySuccess;

  // #43/#45 provenance — bind the tier to the SIGNER's validated matrícula, not
  // to the membership role and not to the ORGANIZATION's verified flag.
  //
  // FIXED 2026-08-10. This read `role === "vet_individual" ? "vet" : "shelter"`
  // with `authorVerified: cap.organization.verified`, and produced two false
  // tiers. A volunteer with role `member` in a verified refugio wrote
  // shelter + verified=true, which computeConfidence resolves to
  // `institutional_verified` — the HIGHEST tier, above professional_verified —
  // with no matrícula anywhere in the chain. And an admin can invite anyone as
  // `vet_individual` with no matrícula check at all, producing
  // professional_verified labelled on screen as "Verificado por veterinario
  // matriculado". Both clear the official "al día" gate in
  // lib/projections/pet-compliance.ts, whose own copy promises the opposite:
  // "un veterinario matriculado tiene que firmarla".
  //
  // The walk-in twin got this right (atender-access.ts:163-176) when #45 closed
  // the "verificación profesional" theater. The scheduled-appointment path was
  // the gemelo that escaped.
  const [signerProfile] = await db
    .select({ matriculaVerified: profiles.matriculaVerified })
    .from(profiles)
    .where(eq(profiles.id, cap.user.id))
    .limit(1);
  const matriculaVerified = signerProfile?.matriculaVerified === true;

  const author = {
    actorUserId: cap.user.id,
    authorRole: matriculaVerified ? ("vet" as const) : ("shelter" as const),
    authorOrganizationId: appt.organizationId,
    authorVerified: matriculaVerified,
  };

  const result = await _markAppointmentAttendedWriter(appt.id, payload, author);
  if ("ok" in result) {
    revalidatePath(`/org/${cap.organization.publicToken}/agenda`);
    revalidatePath("/mis-mascotas");
    revalidatePath(`/mis-mascotas/${appt.petPublicToken}/libreta`);
  }
  return result;
}

// ============================================================================
// No-show action (Fase 5)
// ============================================================================

export async function markAppointmentNoShowAction(
  appointmentToken: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
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

  if (!appt.organizationId) return { error: "Prestador no encontrado." };

  const capResult = await requireCapability("appointment.manage", appt.organizationId);
  if (capResult.error) return { error: capResult.error };
  const cap = capResult as RequireCapabilitySuccess;

  const result = await _markAppointmentNoShow(appt.id, reason);
  if ("ok" in result) {
    revalidatePath(`/org/${cap.organization.publicToken}/agenda`);
    revalidatePath("/mis-turnos");
  }
  return result;
}

// ============================================================================
// Org cancellation action (Fase 5)
// ============================================================================

export async function cancelAppointmentByOrgAction(
  appointmentToken: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
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

  if (!appt.organizationId) return { error: "Prestador no encontrado." };

  const capResult = await requireCapability("appointment.manage", appt.organizationId);
  if (capResult.error) return { error: capResult.error };
  const cap = capResult as RequireCapabilitySuccess;

  const result = await _cancelAppointmentByOrg(
    { id: appt.id, slotId: appt.slotId, ownerUserId: appt.ownerUserId },
    cap.user.id,
    cap.organization.displayName,
    reason,
  );

  if ("ok" in result) {
    revalidatePath(`/org/${cap.organization.publicToken}/agenda`);
    revalidatePath("/mis-turnos");
  }

  return result;
}
