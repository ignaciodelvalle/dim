// Use-case: fetchLatestAmendmentsForEvents — strangler migration 27/61.
// Moved verbatim from app/actions/amendment.ts.
//
// Pure DB query — no auth (caller is responsible for scoping to pet.id).

import { db, petEvents } from "@/db";
import { and, eq } from "drizzle-orm";

import type { AmendmentSummary } from "./types";

/**
 * Returns the LATEST amendment for each target event ID in the provided set.
 * Used by the libreta and historial projections to show the "Corregido" badge.
 *
 * Pure DB query — no auth (caller is responsible for scoping to pet.id from an already-authenticated context).
 */
// @no-auth-required: pure projection query; caller must scope to pet.id from an already-authenticated context.
export async function fetchLatestAmendmentsForEvents(
  petId: string,
  targetEventIds: string[],
): Promise<Map<string, AmendmentSummary>> {
  if (targetEventIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: petEvents.id,
      occurredAt: petEvents.occurredAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "event_amended")));

  // Group by target_event_id, keep latest per target.
  const map = new Map<string, AmendmentSummary>();
  for (const row of rows) {
    const p = row.payload as Record<string, unknown>;
    const targetId = typeof p.target_event_id === "string" ? p.target_event_id : null;
    if (!targetId || !targetEventIds.includes(targetId)) continue;

    const existing = map.get(targetId);
    if (!existing || new Date(row.occurredAt) > new Date(existing.occurredAt)) {
      map.set(targetId, {
        targetEventId: targetId,
        amendmentId: row.id,
        occurredAt: row.occurredAt,
        reason: typeof p.reason === "string" ? p.reason : null,
        actorRole: typeof p.actor_role === "string" ? p.actor_role : "owner",
        changes: Array.isArray(p.changes)
          ? (p.changes as Array<{ field: string; old: unknown; new: unknown }>)
          : [],
      });
    }
  }

  return map;
}
