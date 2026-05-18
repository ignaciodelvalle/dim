"use server";

// bookSlotAction — owner-facing booking flow (Fase 4).
//
// Advisory lock strategy (D10):
//   1. Open a Drizzle transaction.
//   2. Acquire pg_advisory_xact_lock(hashtext(slot_id::text)) to serialize
//      concurrent booking attempts for the same slot.
//   3. Re-read the slot inside the lock: confirm bookings_count < capacity
//      AND starts_at > now(). If not, return a friendly error immediately.
//   4. INSERT the appointment.
//   5. UPDATE time_slots SET bookings_count = bookings_count + 1.
//   6. The DB CHECK constraint `slot_bookings_within_capacity` is the second
//      line of defense — if two transactions somehow raced past the lock, the
//      UPDATE triggers a constraint violation and the transaction rolls back.
//
// Writer/wrapper split:
//   bookSlotWriter — pure DB function, testable without HTTP context.
//   bookSlotAction — gates auth + pet ownership, then delegates to the writer.

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { appointments, db, ownerships, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { generateAppointmentToken } from "@/lib/publicToken";

// ============================================================================
// Types
// ============================================================================

export type BookSlotResult =
  | { ok: true; appointmentToken: string }
  | { error: string };

// ============================================================================
// Internal sentinel error (stays within this module)
// ============================================================================

class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}

// ============================================================================
// Inner writer — testable without auth context
// ============================================================================

/**
 * Core booking writer. Acquires a Postgres advisory lock keyed to the slot,
 * validates capacity + future window, inserts the appointment, and increments
 * bookings_count. The DB CHECK constraint is the final guardrail.
 *
 * The caller is responsible for verifying that `petId` belongs to `ownerUserId`
 * before calling this function. The writer is intentionally pet-agnostic to
 * keep the inner writer independently testable.
 *
 * @param slotId      UUID of the time_slot to book.
 * @param petId       UUID of the pet being booked (pre-verified as owned).
 * @param ownerUserId UUID of the booking owner.
 */
export async function bookSlotWriter(
  slotId: string,
  petId: string,
  ownerUserId: string,
): Promise<BookSlotResult> {
  const publicToken = generateAppointmentToken();

  try {
    await db.transaction(async (tx) => {
      // Step 1 — Advisory lock on slot_id. hashtext() maps the UUID string to
      // a bigint key. xact-scoped locks auto-release at transaction end.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${slotId}))`);

      // Step 2 — Re-read slot inside the lock.
      const [slot] = await tx
        .select({
          id: timeSlots.id,
          capacity: timeSlots.capacity,
          bookingsCount: timeSlots.bookingsCount,
          startsAt: timeSlots.startsAt,
          status: timeSlots.status,
          serviceOfferingId: timeSlots.serviceOfferingId,
        })
        .from(timeSlots)
        .where(eq(timeSlots.id, slotId))
        .limit(1);

      if (!slot) {
        throw new BookingError("El turno no existe.");
      }
      if (slot.status === "cancelled") {
        throw new BookingError("El turno fue cancelado.");
      }
      if (slot.bookingsCount >= slot.capacity) {
        throw new BookingError("Sin cupo disponible.");
      }
      if (slot.startsAt <= new Date()) {
        throw new BookingError("El turno ya pasó.");
      }

      // Step 3 — Fetch offering to denormalize organizationId.
      const offeringRows = await tx.execute(
        sql`SELECT organization_id FROM service_offerings WHERE id = ${slot.serviceOfferingId} LIMIT 1`,
      );
      const offeringRow = offeringRows[0] as { organization_id: string | null } | undefined;
      const organizationId = offeringRow?.organization_id ?? null;

      // Step 4 — INSERT appointment.
      await tx.insert(appointments).values({
        publicToken,
        slotId,
        petId,
        ownerUserId,
        serviceOfferingId: slot.serviceOfferingId,
        organizationId,
        status: "confirmed",
      });

      // Step 5 — Increment bookings_count (DB CHECK is the safety net).
      await tx
        .update(timeSlots)
        .set({
          bookingsCount: sql`${timeSlots.bookingsCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(timeSlots.id, slotId));
    });
  } catch (err) {
    if (err instanceof BookingError) {
      return { error: err.message };
    }
    // Re-throw unexpected errors (including constraint violations from the DB).
    throw err;
  }

  return { ok: true, appointmentToken: publicToken };
}

// ============================================================================
// Form-shaped wrapper — gates auth + pet ownership
// ============================================================================

export async function bookSlotAction(
  slotId: string,
  petId: string,
): Promise<BookSlotResult> {
  const { user } = await requireUserOrRedirect();

  // Verify the pet belongs to this user via an active ownership row.
  const [ownershipRow] = await db
    .select({ petId: ownerships.petId })
    .from(ownerships)
    .where(
      sql`${ownerships.ownerUserId} = ${user.id}
          AND ${ownerships.petId} = ${petId}
          AND ${ownerships.endedAt} IS NULL`,
    )
    .limit(1);

  if (!ownershipRow) {
    return { error: "Esta mascota no te pertenece." };
  }

  const result = await bookSlotWriter(slotId, petId, user.id);
  if ("error" in result) return result;

  revalidatePath("/mis-turnos");
  redirect(`/mis-turnos/${result.appointmentToken}`);
}
