// Use-case: close adoption_listing cases whose followup window has elapsed.
//
// Migrated from lib/case-closers/close-followup-expired-adoptions.ts.
// The lib file becomes a thin re-export shim (strangler pattern).
//
// Scan: adoption_listing cases with status='open' that have an
// `adoption_finalized` pet_event whose payload.followup_until is in the past.
// Process: in ONE tx — UPDATE status='closed', closed_reason='resolved'
// (guarded AND status='open'); if 0 rows → return (anti-race); if
// primaryPetId then insert note_added(category=system, Spanish copy).
//
// Auth: none (system-initiated cron). No user authz inside.

import { and, eq, sql } from "drizzle-orm";

import { cases, db, petEvents } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";

export interface CloseFollowupExpiredAdoptionsOptions {
  now?: Date;
}

export interface FollowupExpiredCandidate {
  id: string;
  primaryPetId: string | null;
  publicCode: string;
}

export async function findFollowupExpiredAdoptions(
  options?: CloseFollowupExpiredAdoptionsOptions,
): Promise<FollowupExpiredCandidate[]> {
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();

  const rows = await db
    .select({
      id: cases.id,
      primaryPetId: cases.primaryPetId,
      publicCode: cases.publicCode,
    })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "adoption_listing"),
        eq(cases.status, "open"),
        sql`EXISTS (
          SELECT 1 FROM ${petEvents}
          WHERE ${petEvents.caseId} = ${cases.id}
            AND ${petEvents.eventType} = 'adoption_finalized'
            AND (${petEvents.payload}->>'followup_until') IS NOT NULL
            AND (${petEvents.payload}->>'followup_until')::timestamptz < ${nowIso}::timestamptz
        )`,
      ),
    );

  return rows;
}

export async function closeFollowupExpiredAdoption(
  candidate: FollowupExpiredCandidate,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(cases)
      .set({
        status: "closed",
        closedReason: "resolved",
        closedAt: now,
        updatedAt: now,
      })
      .where(and(eq(cases.id, candidate.id), eq(cases.status, "open")))
      .returning({ id: cases.id });
    if (updated.length === 0) return;

    if (candidate.primaryPetId) {
      const payload = validateEventPayload("note_added", {
        category: "system",
        text: "Adopción completada — ventana de seguimiento finalizada. La mascota queda integrada al hogar adoptante.",
      });
      await tx.insert(petEvents).values({
        petId: candidate.primaryPetId,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: null,
        authorRole: "system",
        authorOrganizationId: null,
        authorVerified: false,
        payload,
        caseId: candidate.id,
      });
    }
  });
}
