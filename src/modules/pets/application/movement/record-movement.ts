// Writer: recordMovementWriter (movilidad-jurisdiccional Fase 1, Capability 6).
//
// Fork 4 — highest blast radius in the change. Write order (R6.1):
// ONE transaction, event INSERT first, then the pets.jurisdiction*
// denormalization. Event-insert failure prevents the column update — no
// denormalized state without a corresponding event. This is the same
// event-first-then-denormalize shape as recordPregnancyStartedWriter
// (pregnancyStatus) and prevents a microchipHeroTag-class divergence: two
// surfaces reading one fact from two stores after a partial write.
//
// Denormalization gate (R6.2): pets.jurisdictionCountry/Province/Locality are
// updated EXCLUSIVELY for sub_kind === "jurisdiction_changed". cvi_issued and
// transport_recorded MUST NOT touch those columns under any circumstance —
// every resolveBusinessRule call site keys off them (locality → province →
// country fallback), so a travel/CVI event writing them would retroactively
// shift the domestic 4-card compliance, the PPP jurisdiction gate, and every
// other jurisdiction-keyed read path. Regression-locked by
// __tests__/movement-writer.test.ts (S10).

import { eq } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";

import type { RecordMovementParams, RecordMovementResult } from "./types";

export async function recordMovementWriter(
  params: RecordMovementParams,
): Promise<RecordMovementResult> {
  const now = params.now ?? new Date();

  let eventId = "";
  try {
    // Validate BEFORE opening the transaction: an invalid payload (e.g. the
    // S2 no-op move) writes nothing at all.
    const payload = validateEventPayload("movement_recorded", params.movement);

    await db.transaction(async (tx) => {
      // (1) Event row FIRST — the immutable fact.
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: params.pet.id,
          eventType: "movement_recorded",
          occurredAt: params.occurredAt,
          recordedAt: now,
          recordedByUserId: params.recordedByUserId,
          ...params.eventAuthorship,
          payload,
          notes: params.notes,
        })
        .returning();
      eventId = event.id;

      // (2) Denormalize ONLY for jurisdiction_changed (R6.2).
      if (params.movement.sub_kind === "jurisdiction_changed") {
        await tx
          .update(pets)
          .set({
            jurisdictionCountry: params.movement.to_country,
            jurisdictionProvince: params.movement.to_province,
            jurisdictionLocality: params.movement.to_locality,
          })
          .where(eq(pets.id, params.pet.id));
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }

  return { ok: true, eventId };
}
