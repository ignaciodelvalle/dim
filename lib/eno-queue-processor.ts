// ENO queue processor shim — re-exports processEnoQueueBatch from the surveillance module.
//
// WU-4: lib/eno-queue-processor.ts is now a thin shim delegating to
// src/modules/surveillance/application/process-eno-queue-batch.ts.
//
// The cron route at app/api/cron/process-eno-queue/route.ts continues importing
// from @/lib/eno-queue-processor and sees no API change. The integration test
// at __tests__/eno-trigger.test.ts also imports from here.
//
// Real logic lives in the module use-case. This shim wires the production deps
// (SurveillanceRepository + DB lookups + auditLog) and calls the use-case.
//
// PARITY QUIRKS preserved (spec §G):
//   - BATCH_SIZE=50, oldest first.
//   - audit_log conditional on vetUserId — wired via insertAuditLog dep.
//   - Owner notification only if !stigmaSensitive AND ownerUserId !== null.
//   - Per-row try/catch via use-case internals.

import { and, eq, isNull, or } from "drizzle-orm";

import { type AuditLogAction, auditLog, db, govtAssignments, ownerships, pets } from "@/db";
import { processEnoQueueBatch as _processEnoQueueBatch } from "@/src/modules/surveillance/application/process-eno-queue-batch";
import { getEnoDisease } from "@/src/modules/surveillance/domain/eno-catalog";
import { SurveillanceRepository } from "@/src/modules/surveillance/infrastructure/surveillance-repository";

// Re-export the result type for callers that imported it from here.
export type { EnoBatchResult } from "@/src/modules/surveillance/application/process-eno-queue-batch";

const repo = new SurveillanceRepository();

/**
 * Drain the ENO processing queue.
 * Delegates to the surveillance module use-case with all production DB deps wired.
 */
export async function processEnoQueueBatch() {
  return _processEnoQueueBatch({
    repo,

    getPet: async (petId: string) => {
      const [row] = await db
        .select({
          id: pets.id,
          name: pets.name,
          publicToken: pets.publicToken,
          jurisdictionProvince: pets.jurisdictionProvince,
          jurisdictionLocality: pets.jurisdictionLocality,
        })
        .from(pets)
        .where(eq(pets.id, petId))
        .limit(1);
      return row ?? null;
    },

    getOwnership: async (petId: string) => {
      const [row] = await db
        .select({ ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, petId),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      return row?.ownerUserId ? { ownerUserId: row.ownerUserId } : null;
    },

    getDisease: async (code: string) => {
      return getEnoDisease(code);
    },

    getGovtTargets: async (province: string, locality: string) => {
      return db
        .select({ userId: govtAssignments.userId })
        .from(govtAssignments)
        .where(
          and(
            eq(govtAssignments.jurisdictionProvince, province),
            isNull(govtAssignments.revokedAt),
            or(
              eq(govtAssignments.jurisdictionLocality, locality),
              eq(govtAssignments.jurisdictionLocality, ""),
            ),
          ),
        );
    },

    insertAuditLog: async (row: {
      actorUserId: string;
      action: string;
      payload: Record<string, unknown>;
    }) => {
      await db.insert(auditLog).values({
        actorUserId: row.actorUserId,
        action: row.action as AuditLogAction,
        payload: row.payload,
      });
    },
  });
}
