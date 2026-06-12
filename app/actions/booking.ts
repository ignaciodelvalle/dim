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

import { appointments, db, notifications, ownerships, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { matchesDbError } from "@/lib/db-errors";
import { generateAppointmentToken } from "@/lib/publicToken";
import { generateUniqueToken } from "@/lib/unique-token";

// ============================================================================
// Types
// ============================================================================

export type BookSlotResult = { ok: true; appointmentToken: string } | { error: string };

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
  const publicToken = await generateUniqueToken(
    appointments,
    appointments.publicToken,
    generateAppointmentToken,
  );

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
    // If the advisory-lock + manual capacity check raced past somehow and
    // the DB CHECK constraint caught it (review 2026-05-19 §2.8), translate
    // the raw Postgres message into the same user-facing copy the in-tx
    // path uses, instead of bubbling up "new row for relation 'time_slots'
    // violates check constraint 'slot_bookings_within_capacity'".
    if (isSlotCapacityViolation(err)) {
      return { error: "Sin cupo disponible." };
    }
    throw err;
  }

  return { ok: true, appointmentToken: publicToken };
}

// Postgres 23514 = check_violation. The CHECK is named
// `slot_bookings_within_capacity` (db/migrations/0008_scheduling_core.sql).
// matchesDbError walks drizzle 0.45's `.cause` chain (the real pg error is no
// longer top-level) and tests the constraint name against both the
// constraint_name field and the pg error message.
function isSlotCapacityViolation(err: unknown): boolean {
  return matchesDbError(err, {
    code: "23514",
    constraint: /slot_bookings_within_capacity/,
  });
}

// ============================================================================
// Form-shaped wrapper — gates auth + pet ownership
// ============================================================================

export async function bookSlotAction(slotId: string, petId: string): Promise<BookSlotResult> {
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

// ============================================================================
// Owner cancellation action (Fase 6)
// ============================================================================

export type CancelAppointmentResult = { ok: true } | { error: string };

/**
 * Owner cancels their own appointment.
 * Guards:
 *   - Must be the authenticated owner of the pet on the appointment.
 *   - The slot must still be in the future.
 * Side-effects:
 *   - UPDATE appointments status → cancelled_by_owner.
 *   - DECREMENT time_slots.bookings_count (frees capacity).
 *   - INSERT notification to the provider org (if org-side).
 */
export async function cancelAppointmentByOwnerAction(
  appointmentToken: string,
): Promise<CancelAppointmentResult> {
  const { user } = await requireUserOrRedirect();

  // Load appointment + slot + offering (for provider notification).
  const [row] = await db
    .select({
      id: appointments.id,
      slotId: appointments.slotId,
      ownerUserId: appointments.ownerUserId,
      organizationId: appointments.organizationId,
      status: appointments.status,
      serviceOfferingId: appointments.serviceOfferingId,
      startsAt: timeSlots.startsAt,
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!row) return { error: "Turno no encontrado." };

  // Ownership check.
  if (row.ownerUserId !== user.id) {
    return { error: "Este turno no te pertenece." };
  }

  if (row.status !== "confirmed") {
    return { error: "El turno ya fue procesado." };
  }

  // Can only cancel future slots.
  if (row.startsAt <= new Date()) {
    return { error: "No podés cancelar un turno que ya pasó." };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Update appointment status.
    await tx
      .update(appointments)
      .set({
        status: "cancelled_by_owner",
        cancelledAt: now,
        cancelledByUserId: user.id,
        updatedAt: now,
      })
      .where(eq(appointments.id, row.id));

    // 2. Decrement bookings_count (free capacity).
    await tx
      .update(timeSlots)
      .set({
        bookingsCount: sql`${timeSlots.bookingsCount} - 1`,
        updatedAt: now,
      })
      .where(eq(timeSlots.id, row.slotId));

    // 3. Notify the provider org members (org_id path only).
    if (row.organizationId) {
      // Find all admin/coordinator/member/vet_individual members of the org to notify.
      const orgMembers = await tx.execute(
        sql`SELECT user_id FROM organization_memberships
            WHERE organization_id = ${row.organizationId}
              AND left_at IS NULL
              AND role IN ('admin', 'coordinator', 'member', 'vet_individual')
            LIMIT 10`,
      );

      for (const m of orgMembers as unknown as { user_id: string }[]) {
        await tx.insert(notifications).values({
          userId: m.user_id,
          notificationType: "appointment_cancelled_by_owner",
          title: "Turno cancelado por el propietario",
          body: "Un propietario canceló su turno reservado.",
          severity: "info",
          ctaLabel: "Ver agenda",
          ctaUrl: "/org/agenda",
        });
      }
    }
  });

  revalidatePath("/mis-turnos");
  revalidatePath(`/mis-turnos/${appointmentToken}`);

  return { ok: true };
}
