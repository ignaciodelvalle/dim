// Use-case: setPetFound
//
// Migrated from app/actions/events.ts::setPetFoundAction.
//
// AUTH: requirePetAccess (accepts deceased/lost) at the action layer.
//   This function is auth-agnostic — exported for tests.
//
// Parity:
//   - status=deceased → throw with "fallecida" message.
//   - status≠lost → idempotent early return (NO write) — returns { ok: true, alreadyActive: true }.
//   - Normal path: findOpenCaseForPetAndKind(lost_pet_episode) + insert status_changed(lost→active)
//     + updateStatusProjection(active) + closeCase (if case found).
//   - Result: { ok: true, alreadyActive: boolean }

import "server-only";

import { closeCase, findOpenCaseForPetAndKind } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";

import type { EventsRepository } from "../../infrastructure/events-repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SetPetFoundParams = {
  petId: string;
  petStatus: string;
  petPublicToken: string;
  recordedByUserId: string;
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  now?: Date;
};

export type SetPetFoundResult = { ok: true; alreadyActive: boolean };

type Deps = {
  repo: Pick<EventsRepository, "insertEvent" | "updateStatusProjection">;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

/**
 * Mark a pet as found (active) from lost status.
 * Throws for deceased pets (parity with original which throws inside setPetFoundAction).
 * Returns alreadyActive=true without writing when pet is not lost (idempotent guard).
 */
export async function setPetFound(
  params: SetPetFoundParams,
  deps: Deps,
): Promise<SetPetFoundResult> {
  const { petId, petStatus, recordedByUserId, eventAuthorship, now = new Date() } = params;

  if (petStatus === "deceased") {
    throw new Error("Esta mascota está registrada como fallecida y no acepta nuevos eventos.");
  }

  if (petStatus !== "lost") {
    // Idempotent — pet is already active (or in some other non-lost status).
    return { ok: true, alreadyActive: true };
  }

  // Look up the open lost_pet_episode so the status_changed event carries case_id.
  const lostCase = await findOpenCaseForPetAndKind(petId, "lost_pet_episode");

  await deps.transaction(async (tx) => {
    const eventPayload = validateEventPayload("status_changed", {
      from_status: "lost",
      to_status: "active",
    });

    await deps.repo.insertEvent(
      {
        petId,
        eventType: "status_changed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId,
        ...eventAuthorship,
        payload: eventPayload,
        caseId: lostCase?.id ?? null,
      } as Parameters<typeof deps.repo.insertEvent>[0],
      tx as Parameters<typeof deps.repo.insertEvent>[1],
    );

    await deps.repo.updateStatusProjection(
      petId,
      "active",
      now,
      tx as Parameters<typeof deps.repo.updateStatusProjection>[3],
    );

    if (lostCase) {
      await closeCase(
        { caseId: lostCase.id, reason: "resolved", closedByUserId: recordedByUserId },
        // biome-ignore lint/suspicious/noExplicitAny: CaseExecutor is a Drizzle internal type; unknown tx is compatible at runtime
        tx as any,
      );
    }
  });

  return { ok: true, alreadyActive: false };
}
