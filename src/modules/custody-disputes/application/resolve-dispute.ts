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
import { jurisdictionScopeContains } from "@/lib/domain/jurisdiction-canonical";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { closeCase } from "@/lib/infra/case-helpers";

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
  // Subsumption-aware: a whole-province assignment (e.g. whole-CABA) governs
  // every barrio in it; barrio assignments stay exact (never widens security).
  return jurisdictionScopeContains(
    jurisdictions,
    dispute.jurisdictionProvince,
    dispute.jurisdictionLocality,
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
      // Lock the dispute row FOR UPDATE (TR-M1). Two concurrent resolves used to
      // both pass the status check (stale reads) and race the writes — for
      // ownership_transferred the unique-active-owner index backstopped but
      // surfaced a raw 23505, and for the other outcomes there was NO backstop
      // (double resolution, duplicate events + notifications). The row lock
      // serializes them: the loser blocks until the winner commits, re-reads the
      // now-resolved status here, and aborts with a clean es-AR error. Mirrors
      // the FOR UPDATE pattern used by the sibling custody writers.
      const [dispute] = await tx
        .select()
        .from(custodyDisputes)
        .where(eq(custodyDisputes.publicToken, input.disputeToken))
        .limit(1)
        .for("update");
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
        // Symmetric guard: the payload's "to" actor is exclusive (toCount <= 1)
        // and the ownerships row has a polymorphic-holder CHECK. Without this,
        // a caller passing both would fail deep inside the tx with a raw Zod or
        // constraint error instead of a readable one.
        if (input.transferToUserId && input.transferToOrgId) {
          throw new Error(
            "Una transferencia tiene un solo destino: indicá el usuario o la organización, no ambos.",
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

        // Every active ownership row for this pet, read ONCE before we close
        // them below. Both things we need live in here: the foster row (to link
        // the foster_ended we emit) and the outgoing holder that becomes the
        // transfer's "from" actor.
        const activeRows = await tx
          .select({
            id: ownerships.id,
            role: ownerships.role,
            ownerUserId: ownerships.ownerUserId,
            ownerOrganizationId: ownerships.ownerOrganizationId,
          })
          .from(ownerships)
          .where(and(eq(ownerships.petId, dispute.petId), isNull(ownerships.endedAt)));

        const fosterRow = activeRows.find((r) => r.role === "foster");

        // The "from" actor of custody_transferred (audit 2026-08-04). This was
        // hardcoded null/null with from_role "owner", which the payload refine
        // rejects ("at least one of from_user_id / from_organization_id must be
        // set") — so validateEventPayload threw INSIDE this transaction and
        // every resolution-by-transfer rolled back with a raw error in the
        // operator's face. The provenance was always available right here: it is
        // the holder whose row we are about to close.
        //
        // `owner` outranks `shelter_custody` because from_role admits only those
        // two (custodyTransferred in lib/events/event-schemas.ts) and a
        // permanent owner is the more meaningful predecessor when both exist.
        const fromRow =
          activeRows.find((r) => r.role === "owner") ??
          activeRows.find((r) => r.role === "shelter_custody");
        if (!fromRow) {
          throw new Error(
            "No se puede transferir: la mascota no tiene titular ni custodia activa que registrar como origen.",
          );
        }

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
          from_user_id: fromRow.ownerUserId,
          from_organization_id: fromRow.ownerOrganizationId,
          to_user_id: input.transferToUserId ?? null,
          to_organization_id: input.transferToOrgId ?? null,
          from_role: fromRow.role === "shelter_custody" ? "shelter_custody" : "owner",
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
