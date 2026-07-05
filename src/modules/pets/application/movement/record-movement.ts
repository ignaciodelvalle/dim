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
import { normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { validateEventPayload } from "@/lib/events/event-schemas";

import type { MovementInput, RecordMovementParams, RecordMovementResult } from "./types";

/**
 * Canonicalize the destination jurisdiction of a jurisdiction_changed move
 * against the INDEC catalog BEFORE it is persisted (review 14 item 11). The
 * denormalized pets.jurisdiction* columns are read by every resolveBusinessRule
 * call site, so an un-canonicalized locality here would fork the PPP gate and
 * the domestic compliance cards off a spelling the catalog doesn't know.
 *
 * Only AR destinations with both province and locality present are resolved.
 * "soft" mode (never throws) is used deliberately: canonicalization must not
 * introduce a NEW hard rejection that breaks the atomic event-first write —
 * an off-catalog pair falls through as-is, exactly as before this hardening.
 * The action edge (recordMoveAction) applies the strict, user-facing rejection.
 */
async function canonicalizeMovement(movement: MovementInput): Promise<MovementInput> {
  if (
    movement.sub_kind !== "jurisdiction_changed" ||
    movement.to_country !== "AR" ||
    !movement.to_province ||
    !movement.to_locality
  ) {
    return movement;
  }

  const normalized = await normalizeLocationForWrite(
    {
      province: movement.to_province,
      provinceCode: null,
      locality: movement.to_locality,
      localityIndecId: null,
      lat: null,
      lng: null,
      address: null,
    },
    { locality: "soft" },
  );

  return {
    ...movement,
    to_province: normalized.province,
    to_locality: normalized.locality,
  };
}

export async function recordMovementWriter(
  params: RecordMovementParams,
): Promise<RecordMovementResult> {
  const now = params.now ?? new Date();

  let eventId = "";
  try {
    // Canonicalize the destination jurisdiction before both the event payload
    // and the denormalization so they never diverge (review 14 item 11).
    const movement = await canonicalizeMovement(params.movement);

    // Validate BEFORE opening the transaction: an invalid payload (e.g. the
    // S2 no-op move) writes nothing at all.
    const payload = validateEventPayload("movement_recorded", movement);

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

      // (2) Denormalize ONLY for jurisdiction_changed (R6.2) — using the
      // canonicalized destination resolved above.
      if (movement.sub_kind === "jurisdiction_changed") {
        await tx
          .update(pets)
          .set({
            jurisdictionCountry: movement.to_country,
            jurisdictionProvince: movement.to_province,
            jurisdictionLocality: movement.to_locality,
          })
          .where(eq(pets.id, params.pet.id));
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }

  return { ok: true, eventId };
}
