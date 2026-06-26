// Use-case: addDisputePartyUseCase
//
// Registers a claimant / witness / org as a party to an open custody dispute.
// Auth guard lives in the action; this use-case receives a pre-authorized
// session object.
//
// Steps:
//   1. Validate that exactly one of (partyUserId, partyOrgId) is supplied.
//   2. Load dispute by publicToken; assert open + in-scope for govt.
//   3. Insert custody_dispute_parties row.
//   4. Insert audit_log entry.
//   5. Optionally notify the party user (no-cta: no citizen-facing dispute view yet).

import { eq } from "drizzle-orm";

import { auditLog, custodyDisputeParties, custodyDisputes, db, notifications } from "@/db";
import type { CustodyDispute } from "@/db";

import type { AddPartyInput, AddPartyResult } from "../domain/types";

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

export async function addDisputePartyUseCase(
  session: Session,
  input: AddPartyInput,
): Promise<AddPartyResult> {
  if (!input.partyUserId && !input.partyOrgId) {
    return { error: "Indicá un usuario o una organización para la parte." };
  }
  if (input.partyUserId && input.partyOrgId) {
    return { error: "La parte tiene que ser un usuario O una organización, no ambos." };
  }

  try {
    const partyId = await db.transaction(async (tx): Promise<string> => {
      const [dispute] = await tx
        .select()
        .from(custodyDisputes)
        .where(eq(custodyDisputes.publicToken, input.disputeToken))
        .limit(1);
      if (!dispute) throw new Error("Disputa no encontrada.");
      if (dispute.status !== "open") throw new Error("La disputa no está abierta.");

      if (session.profile.role === "govt" && !isGovtInScope(session.jurisdictions, dispute)) {
        throw new Error("Esta disputa está fuera de tu jurisdicción.");
      }

      const [party] = await tx
        .insert(custodyDisputeParties)
        .values({
          disputeId: dispute.id,
          partyUserId: input.partyUserId ?? null,
          partyOrganizationId: input.partyOrgId ?? null,
          partyRole: input.partyRole,
          partyPositionSummary: input.positionSummary?.trim() || null,
          addedByUserId: session.user.id,
        })
        .returning({ id: custodyDisputeParties.id });

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "dispute_party_added",
        payload: {
          dispute_id: dispute.id,
          party_id: party.id,
          party_role: input.partyRole,
        },
      });

      if (input.partyUserId) {
        await tx.insert(notifications).values({
          userId: input.partyUserId,
          notificationType: "custody_dispute_party_added",
          title: "Te sumaron a una disputa de custodia",
          body: "Una autoridad te registró como parte interesada en una disputa abierta sobre la custodia de un animal. Vas a poder ver el expediente desde tu cuenta.",
          severity: "info",
          // no-cta: disputes only have a govt-portal surface (/gob/disputas); there
          // is no citizen-facing dispute view yet, so a party recipient has no
          // accessible destination. Tracked as a product gap.
        });
      }

      return party.id;
    });

    return { partyId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}
