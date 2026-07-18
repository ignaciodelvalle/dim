// Declared-by-owner chip/esterilización sign-off (#3 — vet-signs keystone
// extension, PO 2026-07-18).
//
// PO model: "el vet lo puede firmar cuando entra la mascota en su sistema; el
// dueño solo carga y va a una vet físicamente." A microchip_implanted or
// sterilization_performed event the OWNER declared (authorRole="owner") has
// no professional signature. This module:
//   - surfaces the pet's most recent still-unverified declared event of each
//     signable type (fetchPendingDeclaredEvents — read for page.tsx), and
//   - guards the sign-off actions so an already-verified event can never be
//     "re-signed" (rejectIfAlreadySigned — a no-op/rejection, not a crash).
//
// Append-only: rejectIfAlreadySigned only READS the target row. Signing
// itself is a brand-new pet_event insert (same #43 provenance mechanism the
// vaccine keystone already uses via atenderVaccinationAction) — the original
// declared event is never updated or deleted.

import { and, desc, eq } from "drizzle-orm";

import { type EventType, db, petEvents } from "@/db";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { upcastPayload } from "@/lib/events/event-upcasters";
import type { EventFormState } from "@/src/modules/events/actions";

export type SignableEventType = "microchip_implanted" | "sterilization_performed";

const SIGNABLE_EVENT_TYPES: ReadonlySet<SignableEventType> = new Set([
  "microchip_implanted",
  "sterilization_performed",
]);

export type PendingDeclaredEvent = {
  id: string;
  eventType: SignableEventType;
  /** Short es-AR label for the card row, e.g. "Microchip 985141004321456". */
  summary: string;
  /** Query-string values the confirm form reads as prefill (AtenderCaptureMounter). */
  prefill: Record<string, string>;
};

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type DeclaredEventRow = {
  id: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
};

type ProvenanceRow = Pick<
  DeclaredEventRow,
  "payload" | "authorRole" | "authorVerified" | "authorOrganizationId"
>;

/** True when the row's provenance already reached professional verification —
 * a signable row at/above this tier is excluded from the pending list. */
function isAlreadySigned(row: ProvenanceRow): boolean {
  const tier = computeConfidence({
    authorRole: row.authorRole,
    authorVerified: row.authorVerified,
    authorOrganizationId: row.authorOrganizationId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  });
  return isAtLeast(tier, "professional_verified");
}

/** Projects one signable row into its card summary + confirm-form prefill. */
function toPendingDeclaredEvent(
  row: DeclaredEventRow,
  eventType: SignableEventType,
): PendingDeclaredEvent {
  const p = (upcastPayload(eventType as EventType, row.payload) ?? {}) as Record<string, unknown>;
  const occurredAtStr = toDateInputValue(new Date(row.occurredAt));

  if (eventType === "microchip_implanted") {
    const chipNumber = typeof p.chip_number === "string" ? p.chip_number : "";
    return {
      id: row.id,
      eventType,
      summary: chipNumber ? `Microchip ${chipNumber}` : "Microchip",
      prefill: { chipNumber, occurredAt: occurredAtStr },
    };
  }

  const procedure = typeof p.procedure === "string" ? p.procedure : "";
  const label =
    procedure === "castration"
      ? "Castración"
      : procedure === "spay"
        ? "Ovariectomía"
        : "Esterilización";
  return {
    id: row.id,
    eventType,
    summary: label,
    prefill: { occurredAt: occurredAtStr },
  };
}

/**
 * The pet's most recent OWNER-declared event of each signable type that has
 * not yet reached professional verification — at most one per type (the
 * latest); older undeclared records stay visible in the full libreta, this
 * card is a nudge, not the historical record.
 */
export async function fetchPendingDeclaredEvents(petId: string): Promise<PendingDeclaredEvent[]> {
  const rows = await db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.authorRole, "owner")))
    .orderBy(desc(petEvents.occurredAt));

  const out: PendingDeclaredEvent[] = [];
  const seenTypes = new Set<SignableEventType>();

  for (const row of rows) {
    if (!SIGNABLE_EVENT_TYPES.has(row.eventType as SignableEventType)) continue;
    const eventType = row.eventType as SignableEventType;
    // Keep only the latest row per type — even when it's already verified,
    // don't fall through to an older unverified one of the same type.
    if (seenTypes.has(eventType)) continue;
    seenTypes.add(eventType);

    if (isAlreadySigned(row)) continue;
    out.push(toPendingDeclaredEvent(row, eventType));
  }

  return out;
}

/**
 * Guard for the sign-off actions (atenderMicrochipAction /
 * atenderSterilizationAction): rejects — a no-op, not an edit — when the
 * declared event `confirmEventId` points at no longer exists on this pet, is
 * a different event type, or has ALREADY reached professional verification.
 * Returns null when it's safe to proceed and sign.
 */
export async function rejectIfAlreadySigned(
  petId: string,
  eventType: SignableEventType,
  confirmEventId: string,
): Promise<EventFormState | null> {
  const [row] = await db
    .select({
      id: petEvents.id,
      petId: petEvents.petId,
      eventType: petEvents.eventType,
      payload: petEvents.payload,
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
    })
    .from(petEvents)
    .where(eq(petEvents.id, confirmEventId))
    .limit(1);

  if (!row || row.petId !== petId || row.eventType !== eventType) {
    return { error: "El evento declarado ya no está disponible." };
  }

  if (isAlreadySigned(row)) {
    return { error: "Este registro ya fue firmado por un profesional." };
  }

  return null;
}
