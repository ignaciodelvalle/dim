// lib/event-idempotency.ts
//
// Server-side idempotency helpers for pet_events inserts.
//
// Design: ENO Event-Trust Tier 1 Fase B — decisions B1-B8 closed.
// Spec: docs/superpowers/plans/2026-05-22-event-trust-tier-1.md §4 Fase B
//
// Two exported functions:
//
//   findExistingByKey(petId, eventType, key, executor?)
//     → PetEvent | null
//     Pure lookup — checks whether a row with this (pet_id, event_type,
//     client_idempotency_key) already exists. Injected executor makes it
//     unit-testable without a real DB connection.
//
//   insertEventIdempotent<T extends NewPetEvent>(values, executor?)
//     → { event: PetEvent; wasNoop: boolean }
//     Wraps db.insert(petEvents).values(...).onConflictDoNothing().returning().
//     If clientIdempotencyKey is null/undefined, falls back to a plain insert
//     (no conflict logic — admin-tool path, decision B4).
//     If the INSERT returns empty rows (conflict), fetches the existing row via
//     findExistingByKey and returns it with wasNoop=true (last-stable-wins, B8).

import "server-only";

import { and, eq } from "drizzle-orm";

import { db, petEvents } from "@/db";
import type { NewPetEvent, PetEvent } from "@/db/schema";

// Minimal db-shaped executor interface used for test injection.
// In production, the real `db` instance satisfies this at runtime.
type DbExecutor = Pick<typeof db, "select" | "insert">;

// ─── findExistingByKey ────────────────────────────────────────────────────────

/**
 * Look up a pet event by its idempotency key.
 *
 * Returns the first matching row or null. Callers pass an optional executor
 * so tests can inject a mock without a real DB.
 */
export async function findExistingByKey(
  petId: string,
  eventType: string,
  key: string,
  executor: DbExecutor = db,
): Promise<PetEvent | null> {
  const [row] = await executor
    .select()
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, eventType),
        eq(petEvents.clientIdempotencyKey, key),
      ),
    )
    .limit(1);

  return row ?? null;
}

// ─── insertEventIdempotent ────────────────────────────────────────────────────

export type IdempotentInsertResult = {
  event: PetEvent;
  /** True when the insert was a no-op and the returned row is the original. */
  wasNoop: boolean;
};

/**
 * Insert a pet event with idempotency-key deduplication.
 *
 * When `values.clientIdempotencyKey` is absent or null, this behaves like a
 * plain insert (admin-tool / legacy path — decision B4).
 *
 * When the key is present:
 *   - Uses ON CONFLICT DO NOTHING on the partial unique index
 *     `pet_events_idempotency_idx` (pet_id, event_type, key WHERE key IS NOT NULL).
 *   - If the conflict fires (returning is empty), fetches the original row via
 *     findExistingByKey and returns it with wasNoop=true.
 *   - The original row is returned regardless of whether the payload differs —
 *     last-stable-wins semantics (decision B8).
 *
 * Throws when:
 *   - A key was provided but the conflict-fetch returns null (should never
 *     happen in practice; means the unique index exists but the row is gone).
 */
export async function insertEventIdempotent(
  values: NewPetEvent,
  executor: DbExecutor = db,
): Promise<IdempotentInsertResult> {
  const key = values.clientIdempotencyKey ?? null;

  // No key → plain insert (no conflict-resolution path).
  if (!key) {
    const [event] = await executor
      .insert(petEvents)
      .values(values)
      .returning();

    if (!event) throw new Error("insertEventIdempotent: insert returned no rows");
    return { event, wasNoop: false };
  }

  // Key present → try insert with conflict guard.
  const inserted = await executor
    .insert(petEvents)
    .values(values)
    .onConflictDoNothing({
      target: [petEvents.petId, petEvents.eventType, petEvents.clientIdempotencyKey],
    })
    .returning();

  if (inserted.length > 0) {
    // New row — success.
    return { event: inserted[0], wasNoop: false };
  }

  // Conflict fired → fetch the original row (last-stable-wins, B8).
  const existing = await findExistingByKey(
    values.petId,
    values.eventType,
    key,
    executor,
  );

  if (!existing) {
    throw new Error(
      `insertEventIdempotent: conflict detected but original row not found ` +
        `(petId=${values.petId}, eventType=${values.eventType}, key=${key})`,
    );
  }

  return { event: existing, wasNoop: true };
}
