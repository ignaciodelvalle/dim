// Foster proposal expirer — sweeps `foster_proposals` rows with
// status='pending' AND expires_at < now and marks them 'expired'. Emits the
// foster_proposal_expired event + notifications to volunteer and org
// coordinators. Used by app/api/cron/expire-foster-proposals/route.ts and
// scripts/expire-foster-proposals.ts.
//
// Race resistance: each candidate is re-checked inside its own tx (anti-race
// with accept/reject/cancel actions that may have flipped status between
// the candidate scan and the per-row update).

import { and, eq, isNull, lt } from "drizzle-orm";

import {
  db,
  fosterProposals,
  notifications,
  organizationCapabilityGrants,
  organizationMemberships,
  petEvents,
} from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";

export type ExpireFosterProposalsStats = {
  candidates: number;
  expired: number;
  errors: number;
};

async function getOrgFosterCoordinatorUserIds(orgId: string): Promise<string[]> {
  const ids = new Set<string>();
  const admins = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.role, "admin"),
        isNull(organizationMemberships.leftAt),
      ),
    );
  for (const a of admins) ids.add(a.userId);
  const explicit = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .innerJoin(
      organizationCapabilityGrants,
      and(
        eq(organizationCapabilityGrants.membershipId, organizationMemberships.id),
        eq(organizationCapabilityGrants.capability, "foster.assign"),
        eq(organizationCapabilityGrants.status, "approved"),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        isNull(organizationMemberships.leftAt),
      ),
    );
  for (const e of explicit) ids.add(e.userId);
  return Array.from(ids);
}

export async function expireFosterProposals(): Promise<ExpireFosterProposalsStats> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(fosterProposals)
    .where(and(eq(fosterProposals.status, "pending"), lt(fosterProposals.expiresAt, now)));

  let expired = 0;
  let errors = 0;

  for (const p of candidates) {
    try {
      await db.transaction(async (tx) => {
        // Defense-in-depth — recheck status inside the tx.
        const [fresh] = await tx
          .select({ status: fosterProposals.status })
          .from(fosterProposals)
          .where(eq(fosterProposals.id, p.id))
          .limit(1);
        if (!fresh || fresh.status !== "pending") return;

        await tx
          .update(fosterProposals)
          .set({ status: "expired", updatedAt: now })
          .where(eq(fosterProposals.id, p.id));

        const payload = validateEventPayload("foster_proposal_expired", {
          proposal_public_token: p.publicToken,
        });
        await tx.insert(petEvents).values({
          petId: p.petId,
          eventType: "foster_proposal_expired",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: null,
          authorRole: "system",
          authorOrganizationId: p.organizationId,
          authorVerified: false,
          payload,
        });

        await tx.insert(notifications).values({
          userId: p.volunteerUserId,
          notificationType: "foster_proposal_expired",
          severity: "info",
          title: "Una propuesta de tránsito expiró",
          body: "La propuesta que recibiste expiró sin respuesta. Si te interesa, pedile al refugio que vuelva a proponer.",
          relatedPetId: p.petId,
        });

        const orgIds = await getOrgFosterCoordinatorUserIds(p.organizationId);
        for (const uid of orgIds) {
          await tx.insert(notifications).values({
            userId: uid,
            notificationType: "foster_proposal_expired",
            severity: "info",
            title: "Tu propuesta de tránsito expiró",
            body: "El voluntario no respondió en 7 días. Probá con otro candidato del pool.",
            relatedPetId: p.petId,
          });
        }
      });
      expired += 1;
    } catch (err) {
      console.error("[expireFosterProposals] failed for", p.id, err);
      errors += 1;
    }
  }

  return { candidates: candidates.length, expired, errors };
}
