// markAppointmentNoShow — no-show use-case (Fase 5).
// Moved verbatim from app/actions/attendance.ts (strangler 12/61).
//
// Auth guard (requireCapability) is handled by the thin shim in
// app/actions/attendance.ts before delegating here.

import { and, eq } from "drizzle-orm";

import { appointments, db } from "@/db";

import type { AttendanceResult } from "./types";

/**
 * Marks an appointment as no-show. The caller (thin shim) is responsible for
 * authenticating the actor and verifying organization capability before calling.
 */
export async function markAppointmentNoShow(
  appointmentId: string,
  reason: string,
): Promise<AttendanceResult> {
  const now = new Date();
  // TOCTOU guard (SC2): flip CONDITIONALLY on status='confirmed'. Without it a
  // no-show racing a cancel/attend would blindly overwrite the final status.
  const updated = await db
    .update(appointments)
    .set({
      status: "no_show",
      noShowMarkedAt: now,
      notesFromOrg: reason || null,
      updatedAt: now,
    })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.status, "confirmed")))
    .returning({ id: appointments.id });

  if (updated.length === 0) {
    return { error: "El turno ya fue procesado (asistido, cancelado o ausente)." };
  }

  return { ok: true };
}
