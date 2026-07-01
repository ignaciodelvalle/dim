// Use-case: resolveDisputeUseCase
//
// Closes a custody dispute with one of 4 outcomes:
//   ownership_confirmed | ownership_transferred | case_dismissed | other
//
// For ownership_transferred, atomically:
//   1. Validates the transfer target (user/org existence and active state).
//   2. Closes every active ownership row.
//   3. Emits foster_ended (if applicable) + custody_transferred events.
//   4. Opens a new ownership row for the transfer target.
//
// For all outcomes:
//   - Emits custody_dispute_resolved pet event.
//   - Updates custody_disputes row to resolved.
//   - Clears pets.in_custody_dispute.
//   - Closes the linked case as resolved.
//   - Inserts audit_log entry.
//   - Fans out notifications to all parties + raiser.

import { and, eq, isNull } from "drizzle-orm";

import {
  auditLog,
  cases,
  custodyDisputeParties,
  custodyDisputes,
  db,
  notifications,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import type { CustodyDispute } from "@/db";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/events/event-schemas";

import type { ResolveDisputeInput, ResolveDisputeResult } from "../domain/types";

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

export async function resolveDisputeUseCase(
  session: Session,
  input: ResolveDisputeInput,
): Promise<ResolveDisputeResult> {
  const summary = input.resolutionSummary.trim();
  if (summary.length < 100) {
    return {
      error: "El resumen de la resolución debe tener al menos 100 caracteres.",
    };
  }

  if (session.profile.role !== "admin" && session.profile.role !== "govt") {
    return { error: "No tenés permiso para resolver disputas." };
  }

  try {
    const resolvedAt = await db.transaction(async (tx): Promise<Date> => {
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

      // Cases system (Fase D4): find the case opened for this dispute
      // so cascade events carry case_id + the case closes alongside.
      const [linkedCase] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(eq(cases.custodyDisputeId, dispute.id))
        .limit(1);

      let transferEventId: string | null = null;

      if (input.resolution === "ownership_transferred") {
        if (!input.transferToUserId && !input.transferToOrgId) {
          throw new Error(
            "Para una transferencia tenés que indicar el usuario o la organización destino.",
          );
        }

        // Validate target user/org existence to prevent orphaned ownership rows.
        if (input.transferToUserId) {
          const [targetUser] = await tx
            .select({ id: profiles.id, deactivatedAt: profiles.deactivatedAt })
            .from(profiles)
            .where(eq(profiles.id, input.transferToUserId))
            .limit(1);
          if (!targetUser) {
            throw new Error("El usuario destino no existe en el sistema.");
          }
          if (targetUser.deactivatedAt !== null) {
            throw new Error("El usuario destino tiene la cuenta desactivada.");
          }
        }

        if (input.transferToOrgId) {
          const [targetOrg] = await tx
            .select({ id: organizations.id, status: organizations.status })
            .from(organizations)
            .where(eq(organizations.id, input.transferToOrgId))
            .limit(1);
          if (!targetOrg) {
            throw new Error("La organización destino no existe en el sistema.");
          }
          if (targetOrg.status !== "active") {
            throw new Error("La organización destino no está activa.");
          }
        }

        // Find the active foster row (if any) so the custody_transferred
        // payload can link to the foster_ended that we'll emit too.
        const [fosterRow] = await tx
          .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
          .from(ownerships)
          .where(
            and(
              eq(ownerships.petId, dispute.petId),
              eq(ownerships.role, "foster"),
              isNull(ownerships.endedAt),
            ),
          )
          .limit(1);

        let fosterEndedEventId: string | null = null;
        const now = new Date();

        // Close every active ownership row (owner / shelter_custody / foster).
        await tx
          .update(ownerships)
          .set({ endedAt: now })
          .where(and(eq(ownerships.petId, dispute.petId), isNull(ownerships.endedAt)));

        // Emit foster_ended first so the custody_transferred payload can
        // reference its id (mirrors the pattern in app/actions/transfer.ts).
        if (fosterRow?.ownerUserId) {
          const fosterEndedPayload = validateEventPayload("foster_ended", {
            foster_user_id: fosterRow.ownerUserId,
            reason: "other",
            notes: "Cerrado por resolución de disputa de custodia.",
          });
          const [fEnded] = await tx
            .insert(petEvents)
            .values({
              petId: dispute.petId,
              eventType: "foster_ended",
              occurredAt: now,
              recordedAt: now,
              recordedByUserId: session.user.id,
              authorRole: "govt",
              authorOrganizationId: null,
              authorVerified: true,
              payload: fosterEndedPayload,
              caseId: linkedCase?.id ?? null,
            })
            .returning({ id: petEvents.id });
          fosterEndedEventId = fEnded.id;
        }

        const transferPayload = validateEventPayload("custody_transferred", {
          from_user_id: null,
          from_organization_id: null,
          to_user_id: input.transferToUserId ?? null,
          to_organization_id: input.transferToOrgId ?? null,
          from_role: "owner",
          to_role: input.transferToOrgId ? "shelter_custody" : "owner",
          matched_against_pet_id: null,
          foster_ended_event_id: fosterEndedEventId,
          notes: input.notes?.trim() || null,
        });
        const [te] = await tx
          .insert(petEvents)
          .values({
            petId: dispute.petId,
            eventType: "custody_transferred",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: session.user.id,
            authorRole: "govt",
            authorOrganizationId: null,
            authorVerified: true,
            payload: transferPayload,
            caseId: linkedCase?.id ?? null,
          })
          .returning({ id: petEvents.id });
        transferEventId = te.id;

        await tx.insert(ownerships).values({
          petId: dispute.petId,
          ownerUserId: input.transferToUserId ?? null,
          ownerOrganizationId: input.transferToOrgId ?? null,
          role: input.transferToOrgId ? "shelter_custody" : "owner",
          startedAt: now,
        });
      }

      const resolvedPayload = validateEventPayload("custody_dispute_resolved", {
        raised_event_id: dispute.raisingEventId,
        resolved_by_role: session.profile.role,
        resolved_by_user_id: session.user.id,
        outcome: input.resolution,
        notes: input.notes?.trim() || summary.slice(0, 500),
      });
      const now = new Date();
      const [resolvedEvent] = await tx
        .insert(petEvents)
        .values({
          petId: dispute.petId,
          eventType: "custody_dispute_resolved",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: session.user.id,
          // `authorRole` enum on pet_events doesn't include 'admin'; both
          // admin and govt map to 'govt' for authorship attribution. The
          // precise role lives in the payload (resolved_by_role).
          authorRole: "govt",
          authorOrganizationId: null,
          authorVerified: true,
          payload: resolvedPayload,
          caseId: linkedCase?.id ?? null,
        })
        .returning({ id: petEvents.id });

      await tx
        .update(custodyDisputes)
        .set({
          status: "resolved",
          resolution: input.resolution,
          resolutionSummary: summary,
          resolutionEventId: resolvedEvent.id,
          resolvedByUserId: session.user.id,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(custodyDisputes.id, dispute.id));

      await tx
        .update(pets)
        .set({ inCustodyDispute: false, updatedAt: now })
        .where(eq(pets.id, dispute.petId));

      // Cases system (Fase D4): close the linked case. All 4 outcomes
      // (ownership_confirmed / ownership_transferred / case_dismissed /
      // other) are "real" determinations — map to closed_reason='resolved'.
      if (linkedCase) {
        await closeCase(
          { caseId: linkedCase.id, reason: "resolved", closedByUserId: session.user.id },
          tx,
        );
      }

      await tx.insert(auditLog).values({
        actorUserId: session.user.id,
        action: "dispute_resolved",
        payload: {
          dispute_id: dispute.id,
          resolution: input.resolution,
          transfer_event_id: transferEventId,
          resolution_summary_excerpt: summary.slice(0, 200),
        },
      });

      // Fan out to every party + the raiser.
      const parties = await tx
        .select({ partyUserId: custodyDisputeParties.partyUserId })
        .from(custodyDisputeParties)
        .where(eq(custodyDisputeParties.disputeId, dispute.id));
      const userIds = new Set<string>();
      for (const p of parties) if (p.partyUserId) userIds.add(p.partyUserId);
      if (dispute.raisedByUserId) userIds.add(dispute.raisedByUserId);
      for (const uid of userIds) {
        await tx.insert(notifications).values({
          userId: uid,
          notificationType: "custody_dispute_resolved",
          title: "Disputa de custodia resuelta",
          body: `Resolución: ${input.resolution}. La autoridad cerró el caso.`,
          severity: "info",
          // no-cta: disputes only have a govt-portal surface (/gob/disputas); there
          // is no citizen-facing dispute view yet, so a party recipient has no
          // accessible destination. Tracked as a product gap.
        });
      }

      return now;
    });

    return { resolvedAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}
