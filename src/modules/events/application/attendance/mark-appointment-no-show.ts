// markAppointmentNoShow — no-show use-case (Fase 5).
// Moved verbatim from app/actions/attendance.ts (strangler 12/61).
//
// Auth guard (requireCapability) is handled by the thin shim in
// app/actions/attendance.ts before delegating here.

import { eq } from "drizzle-orm";

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
  await db
    .update(appointments)
    .set({
      status: "no_show",
      noShowMarkedAt: now,
      notesFromOrg: reason || null,
      updatedAt: now,
    })
    .where(eq(appointments.id, appointmentId));

  return { ok: true };
}
