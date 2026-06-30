// Shared types for the booking application layer.
// Moved verbatim from app/actions/booking.ts (strangler 23/61).

export type BookSlotResult = { ok: true; appointmentToken: string } | { error: string };

export type CancelAppointmentResult = { ok: true } | { error: string };
