// cancelAppointmentByOrg — org cancellation use-case (Fase 5).
// Moved verbatim from app/actions/attendance.ts (strangler 12/61).
//
// Auth guard (requireCapability) is handled by the thin shim in
// app/actions/attendance.ts before delegating here.

import { eq, sql } from "drizzle-orm";

import { appointments, db, notifications, timeSlots } from "@/db";

import type { AttendanceResult } from "./types";

/**
 * Cancels an appointment on behalf of the org: updates status, frees slot
 * capacity, and notifies the owner. The caller (thin shim) is responsible for
 * authenticating the actor and verifying organization capability before calling.
 */
export async function cancelAppointmentByOrg(
  appt: { id: string; slotId: string; ownerUserId: string | null },
  actorUserId: string,
  orgDisplayName: string | null,
  reason: string,
): Promise<AttendanceResult> {
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

  return { ok: true };
}
