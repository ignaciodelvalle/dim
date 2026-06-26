// Use-case: escalateDisputeUseCase
//
// No schema-level escalation state exists on custody_disputes (the only valid
// statuses are open / resolved / withdrawn). The light-escalation path keeps
// the dispute open and appends a `note_added` pet event that marks the
// escalation to judicial channels, plus an audit_log entry. The note surfaces
// in the detail page's custody timeline.

import { eq } from "drizzle-orm";

import { auditLog, cases, custodyDisputes, db, petEvents } from "@/db";
import type { CustodyDispute } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";

import type { EscalateDisputeInput, EscalateDisputeResult } from "../domain/types";

type Session = {
  user: { id: string };
  profile: { role: string };
  jurisdictions: { province: string; locality: string }[];
};

function isGovtInScope(
  jurisdictions: { province: string; locality: string }[],
  dispute: Pick<CustodyDispute, "jurisdictionProvince" | "jurisdictionLocality">,
): boolean {
  return jurisdictions.some(
    (j) =>
      j.province === dispute.jurisdictionProvince && j.locality === dispute.jurisdictionLocality,
  );
}

export async function escalateDisputeUseCase(
  session: Session,
  input: EscalateDisputeInput,
): Promise<EscalateDisputeResult> {
  const text = input.notes.trim();
  if (text.length < 20) {
    return { error: "El motivo de la escalada tiene que tener al menos 20 caracteres." };
  }

  try {
    const escalatedAt = await db.transaction(async (tx): Promise<Date> => {
      const [dispute] = await tx
        .select()
        .from(custodyDisputes)
        .where(eq(custodyDisputes.publicToken, input.disputeToken))
        .limit(1);
      if (!dispute) throw new Error("Disputa no encontrada.");
      if (dispute.status !== "open") throw new Error("Solo se pueden escalar disputas abiertas.");

      if (session.profile.role === "govt" && !isGovtInScope(session.jurisdictions, dispute)) {
        throw new Error("Esta disputa está fuera de tu jurisdicción.");
      }

      const now = new Date();

      // Find the linked case (for caseId on the pet event).
      const [linkedCase] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(eq(cases.custodyDisputeId, dispute.id))
        .limit(1);

      const notePayload = validateEventPayload("note_added", {
        category: "otro",
        text: `[Escalada vía judicial] ${text}`,
      });

      await tx.insert(petEvents).values({
        petId: dispute.petId,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: session.user.id,
        authorRole: "govt",
        authorOrganizationId: null,
        authorVerified: true,
        payload: notePayload,
        caseId: linkedCase?.id ?? null,
      });

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "dispute_escalated",
        payload: {
          dispute_id: dispute.id,
          notes_excerpt: text.slice(0, 200),
        },
      });

      return now;
    });

    return { escalatedAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}
