"use server";

// Custody disputes — admin/govt resolve flow. Disputes are raised by an
// authority emitting `custody_dispute_raised` on the pet's timeline; this
// file exposes three actions for authorities to manage them:
//
//   - addDisputePartyAction       — register a claimant / witness / org
//   - resolveDisputeAction        — close with an outcome; if transferring,
//                                   atomically re-points ownership
//   - withdrawDisputeAction       — admin or raiser cancels the dispute
//
// `openDisputeFromEvent` is an internal helper called by the action that
// emits the raising event so the dispute row + initial parties + pet flag
// land in the same transaction. It is NOT a server action.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { Pet } from "@/db";
import {
  type CustodyDispute,
  type DisputePartyRole,
  type DisputeResolution,
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
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { generatePrefixedToken } from "@/lib/publicToken";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AddPartyInput = {
  disputeToken: string;
  partyUserId?: string | null;
  partyOrgId?: string | null;
  partyRole: DisputePartyRole;
  positionSummary?: string | null;
};

export type AddPartyResult = { partyId: string } | { error: string };

export type ResolveDisputeInput = {
  disputeToken: string;
  // Maps 1:1 with the Zod schema's `outcome` enum on
  // `custody_dispute_resolved`. The plan's spec lists 5 verbs but the canonical
  // event schema collapses them to 4 outcomes; we mirror the schema here.
  resolution: DisputeResolution;
  resolutionSummary: string;
  // Only relevant when resolution = 'ownership_transferred'.
  transferToUserId?: string | null;
  transferToOrgId?: string | null;
  notes?: string | null;
};

export type ResolveDisputeResult = { resolvedAt: Date } | { error: string };

export type WithdrawDisputeInput = {
  disputeToken: string;
  reason?: string | null;
};

export type WithdrawDisputeResult = { withdrawnAt: Date } | { error: string };

// Internal helper — called from the action that emits `custody_dispute_raised`.
// Inserts the dispute row, the initial parties, audit_log entry, and flips
// pets.in_custody_dispute = true. Caller must already have validated the
// raising event and pass it explicitly so the FK lands cleanly.
//
// Sequencing contract (ARCH-E): the caller MUST pre-create the case via
// openCase before inserting the raising pet_event, then pass the resulting
// caseId here. This ensures the raising event row carries case_id in the
// same transaction (pet_events.case_id is append-only — no post-insert update
// is possible without the GUC escape hatch). openDisputeFromEvent then updates
// the case row with custodyDisputeId once the dispute row exists.
export async function openDisputeFromEvent(
  tx: Tx,
  input: {
    petId: string;
    raisingEventId: string;
    raisedByUserId: string;
    raisedByOrgId?: string | null;
    raisedByRole: "owner" | "org" | "govt" | "admin";
    jurisdictionProvince: string;
    jurisdictionLocality: string;
    initialParties: {
      userId?: string | null;
      orgId?: string | null;
      role: DisputePartyRole;
      positionSummary?: string | null;
    }[];
    /**
     * Pre-created case id. The case MUST be opened BEFORE the raising event
     * is inserted (see sequencing contract above); openDisputeFromEvent links
     * the dispute row to this existing case instead of opening a new one.
     */
    preCreatedCaseId: string;
  },
): Promise<{ disputeId: string; publicToken: string }> {
  // Guard: no two open disputes per pet (enforced by partial unique index too,
  // but we want a clean error rather than a constraint violation).
  const [existing] = await tx
    .select({ id: custodyDisputes.id })
    .from(custodyDisputes)
    .where(and(eq(custodyDisputes.petId, input.petId), eq(custodyDisputes.status, "open")))
    .limit(1);
  if (existing) {
    throw new Error("Ya hay una disputa abierta para esta mascota.");
  }

  const publicToken = generatePrefixedToken("DIS");
  const [dispute] = await tx
    .insert(custodyDisputes)
    .values({
      publicToken,
      petId: input.petId,
      raisedByUserId: input.raisedByUserId,
      raisedByOrgId: input.raisedByOrgId ?? null,
      raisedByRole: input.raisedByRole,
      raisingEventId: input.raisingEventId,
      jurisdictionProvince: input.jurisdictionProvince,
      jurisdictionLocality: input.jurisdictionLocality,
    })
    .returning({ id: custodyDisputes.id });

  for (const p of input.initialParties) {
    await tx.insert(custodyDisputeParties).values({
      disputeId: dispute.id,
      partyUserId: p.userId ?? null,
      partyOrganizationId: p.orgId ?? null,
      partyRole: p.role,
      partyPositionSummary: p.positionSummary ?? null,
      addedByUserId: input.raisedByUserId,
    });
  }

  await tx
    .update(pets)
    .set({ inCustodyDispute: true, updatedAt: new Date() })
    .where(eq(pets.id, input.petId));

  // Link the now-known dispute id back to the pre-created case row. A zero-row
  // update would leave the case permanently unlinked (resolveDisputeAction
  // could never close it), so fail the transaction instead of continuing.
  const [linkedCase] = await tx
    .update(cases)
    .set({ custodyDisputeId: dispute.id, updatedAt: new Date() })
    .where(eq(cases.id, input.preCreatedCaseId))
    .returning({ id: cases.id });
  if (!linkedCase) {
    throw new Error(`Pre-created case ${input.preCreatedCaseId} not found while opening dispute.`);
  }

  await tx.insert(auditLog).values({
    actorUserId: input.raisedByUserId,
    action: "dispute_raised",
    payload: {
      dispute_id: dispute.id,
      pet_id: input.petId,
      raising_event_id: input.raisingEventId,
      raised_by_role: input.raisedByRole,
    },
  });

  return { disputeId: dispute.id, publicToken };
}

function isGovtInScope(
  jurisdictions: { province: string; locality: string }[],
  dispute: Pick<CustodyDispute, "jurisdictionProvince" | "jurisdictionLocality">,
): boolean {
  return jurisdictions.some(
    (j) =>
      j.province === dispute.jurisdictionProvince && j.locality === dispute.jurisdictionLocality,
  );
}

export async function addDisputePartyAction(input: AddPartyInput): Promise<AddPartyResult> {
  if (!input.partyUserId && !input.partyOrgId) {
    return { error: "Indicá un usuario o una organización para la parte." };
  }
  if (input.partyUserId && input.partyOrgId) {
    return { error: "La parte tiene que ser un usuario O una organización, no ambos." };
  }

  const session = await requireAdminOrGovtOrRedirect();

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
        });
      }

      return party.id;
    });

    revalidatePath(`/gob/disputas/${input.disputeToken}`);
    return { partyId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

export async function resolveDisputeAction(
  input: ResolveDisputeInput,
): Promise<ResolveDisputeResult> {
  const summary = input.resolutionSummary.trim();
  if (summary.length < 100) {
    return {
      error: "El resumen de la resolución debe tener al menos 100 caracteres.",
    };
  }

  const session = await requireAdminOrGovtOrRedirect();
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
        });
      }

      return now;
    });

    revalidatePath("/gob/disputas");
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
    return { resolvedAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

export async function withdrawDisputeAction(
  input: WithdrawDisputeInput,
): Promise<WithdrawDisputeResult> {
  const session = await requireAdminOrGovtOrRedirect();

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

    revalidatePath("/gob/disputas");
    revalidatePath(`/gob/disputas/${input.disputeToken}`);
    return { withdrawnAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

// ─── Transfer target lookup ──────────────────────────────────────────────────
//
// Quick existence + active-state check that the ResolveDisputeForm calls
// before submitting so the operator sees a human-readable confirmation rather
// than a raw UUID.

export type LookupTransferTargetInput = {
  kind: "user" | "org";
  id: string;
};

export type LookupTransferTargetResult =
  | { found: true; displayName: string; active: boolean }
  | { found: false; error: string };

export async function lookupTransferTargetAction(
  input: LookupTransferTargetInput,
): Promise<LookupTransferTargetResult> {
  await requireAdminOrGovtOrRedirect();
  const id = input.id.trim();
  if (!id) return { found: false, error: "ID vacío." };

  try {
    if (input.kind === "user") {
      const [row] = await db
        .select({ displayName: profiles.displayName, deactivatedAt: profiles.deactivatedAt })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      if (!row) return { found: false, error: "Usuario no encontrado." };
      return {
        found: true,
        displayName: row.displayName ?? id,
        active: row.deactivatedAt === null,
      };
    }
    const [row] = await db
      .select({ displayName: organizations.displayName, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!row) return { found: false, error: "Organización no encontrada." };
    return {
      found: true,
      displayName: row.displayName,
      active: row.status === "active",
    };
  } catch {
    return { found: false, error: "Error al verificar el destino." };
  }
}

// ─── Escalate (light) ────────────────────────────────────────────────────────
//
// No schema-level escalation state exists on custody_disputes (the only valid
// statuses are open / resolved / withdrawn). The light-escalation path keeps
// the dispute open and appends a `note_added` pet event that marks the
// escalation to judicial channels, plus an audit_log entry. The note surfaces
// in the detail page's custody timeline.

export type EscalateDisputeInput = {
  disputeToken: string;
  notes: string;
};

export type EscalateDisputeResult = { escalatedAt: Date } | { error: string };

export async function escalateDisputeAction(
  input: EscalateDisputeInput,
): Promise<EscalateDisputeResult> {
  const text = input.notes.trim();
  if (text.length < 20) {
    return { error: "El motivo de la escalada tiene que tener al menos 20 caracteres." };
  }

  const session = await requireAdminOrGovtOrRedirect();

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

    revalidatePath(`/gob/disputas/${input.disputeToken}`);
    return { escalatedAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }
}

// Convenience helper so callers don't have to import Pet just for typing.
export type DisputePet = Pick<Pet, "id" | "name" | "species" | "publicToken">;
