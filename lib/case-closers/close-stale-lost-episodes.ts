// Cron closer for stale lost_pet_episode cases (lifecycles spec §6.10).
//
// Scan: lost_pet_episode cases with status='open', opened_at < now-180d,
// AND no pet_events attached in the last 60 days (no scans, no proposes,
// no notes).
// Process: emit a `note_added(category='system')` with case_id, then
// UPDATE cases.status='closed', closed_reason='auto_expired'.
//
// Idempotent: closed cases are excluded by the scan filter.

import { and, eq, lt, sql } from "drizzle-orm";

import { cases, db, petEvents } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";

export interface CloseStaleLostEpisodesOptions {
  now?: Date;
  /** Days a case must have been open before becoming eligible. Default 180. */
  staleAfterDays?: number;
  /** Days of inactivity required to consider a case stale. Default 60. */
  inactivityDays?: number;
}

export interface CloseStaleLostEpisodesCandidate {
  id: string;
  primaryPetId: string | null;
  publicCode: string;
}

export async function findStaleLostEpisodes(
  options?: CloseStaleLostEpisodesOptions,
): Promise<CloseStaleLostEpisodesCandidate[]> {
  const now = options?.now ?? new Date();
  const staleAfterMs = (options?.staleAfterDays ?? 180) * 24 * 60 * 60 * 1000;
  const inactivityMs = (options?.inactivityDays ?? 60) * 24 * 60 * 60 * 1000;
  const openedBefore = new Date(now.getTime() - staleAfterMs);
  const inactiveSince = new Date(now.getTime() - inactivityMs);

  const inactiveSinceIso = inactiveSince.toISOString();
  const rows = await db
    .select({
      id: cases.id,
      primaryPetId: cases.primaryPetId,
      publicCode: cases.publicCode,
    })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
        lt(cases.openedAt, openedBefore),
        sql`NOT EXISTS (
          SELECT 1 FROM ${petEvents}
          WHERE ${petEvents.caseId} = ${cases.id}
            AND ${petEvents.occurredAt} >= ${inactiveSinceIso}::timestamptz
        )`,
      ),
    );

  return rows;
}

export async function closeStaleLostEpisode(
  candidate: CloseStaleLostEpisodesCandidate,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();

  await db.transaction(async (tx) => {
    // Anti-race: only close if still open.
    const updated = await tx
      .update(cases)
      .set({
        status: "closed",
        closedReason: "auto_expired",
        closedAt: now,
        updatedAt: now,
      })
      .where(and(eq(cases.id, candidate.id), eq(cases.status, "open")))
      .returning({ id: cases.id });
    if (updated.length === 0) return;

    if (candidate.primaryPetId) {
      const payload = validateEventPayload("note_added", {
        category: "system",
        text: "Caso cerrado automáticamente por inactividad. La mascota sigue marcada perdida; el dueño puede reactivar reportándola encontrada o marcándola nuevamente como perdida.",
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
