// Use-case: withdrawDisputeUseCase
//
// Admin or the raiser cancels an open custody dispute.
//
// Steps:
//   1. Load and validate dispute (open, caller authorized).
//   2. Update custody_disputes row to withdrawn.
//   3. Clear pets.in_custody_dispute.
//   4. Close the linked case as cancelled.
//   5. Insert audit_log entry.

import { eq } from "drizzle-orm";

import { auditLog, cases, custodyDisputes, db, pets } from "@/db";
import { closeCase } from "@/lib/infra/case-helpers";

import type { WithdrawDisputeInput, WithdrawDisputeResult } from "../domain/types";

type Session = {
  user: { id: string };
  profile: { role: string };
};

export async function withdrawDisputeUseCase(
  session: Session,
  input: WithdrawDisputeInput,
): Promise<WithdrawDisputeResult> {
  try {
    const withdrawnAt = await db.transaction(async (tx): Promise<Date> => {
      const [dispute] = await tx
        .select()
        .from(custodyDisputes)
        .where(eq(custodyDisputes.publicToken, input.disputeToken))
        .limit(1);
      if (!dispute) throw new Error("Disputa no encontrada.");
      if (dispute.status !== "open") throw new Error("La disputa no está abierta.");

      // Admins can withdraw anything; govts can only withdraw what they
      // raised. Out-of-scope govt is implicitly blocked by the raiser check
      // because they wouldn't be the raiser anyway.
      if (session.profile.role === "govt" && dispute.raisedByUserId !== session.user.id) {
        throw new Error("Solo un admin o quien la levantó puede retirarla.");
      }

      const now = new Date();
      await tx
        .update(custodyDisputes)
        .set({
          status: "withdrawn",
          resolvedByUserId: session.user.id,
          resolvedAt: now,
          resolutionSummary: input.reason?.trim() || null,
          updatedAt: now,
        })
        .where(eq(custodyDisputes.id, dispute.id));

      await tx
        .update(pets)
        .set({ inCustodyDispute: false, updatedAt: now })
        .where(eq(pets.id, dispute.petId));

      // Cases system (Fase D4): close the linked case as `cancelled`.
      // Withdrawal isn't a real determination — the case is set aside.
      const [linkedCase] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(eq(cases.custodyDisputeId, dispute.id))
        .limit(1);
      if (linkedCase) {
        await closeCase(
          { caseId: linkedCase.id, reason: "cancelled", closedByUserId: session.user.id },
          tx,
        );
      }

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "dispute_withdrawn",
        payload: {
          dispute_id: dispute.id,
          withdrawn_by_user_id: session.user.id,
          reason: input.reason ?? null,
        },
      });

      return now;
    });

    return { withdrawnAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}
