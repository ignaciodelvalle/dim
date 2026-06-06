// Use-case: accept a cross-org custody transfer (receiver org side).
//
// Migrated from app/actions/cross-org-transfer.ts::acceptCrossOrgTransferAction.
// Auth (requireCapability('org.transfer.accept')) is handled by the caller.
// org token match + canonical receiver resolution + drift detection in this use-case.
//
// Orchestrates:
//   1. Receiver org token match
//   2. Load case by publicCode + validate kind/status/pet
//   3. Load proposal events (LIMIT 2) + duplicate-proposal guard
//   4. Canonical sender + drift detection (validateSenderOrgScope)
//   5. Canonical receiver + drift detection (validateReceiverOrgScope) — SECURITY BOUNDARY
//   6. Pre-tx: findOpenCustodyEpisode
//   7. ATOMIC tx:
//      a. insertPetEvent(custody_transferred, authorRole=shelter)
//      b. endShelterCustody(sender)
//      c. insertShelterCustody(receiver)
//      d. closeCase(handshake, resolved)
//      e. closeCase(custody_episode, resolved) if open
//      f. collect sender coordinator notifications + receiver user notification
//   8. Return UseCaseResult<{ publicCode }> + notifications

import {
  validateDuplicateProposalGuard,
  validateOrgTokenMatch,
  validateReceiverOrgScope,
  validateSenderOrgScope,
} from "../domain/cross-org-rules";
import type { TransfersRepository } from "../infrastructure/transfers-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
  organization: {
    id: string;
    publicToken: string;
    verified: boolean;
    displayName: string;
  };
};

type Deps = {
  repo: typeof TransfersRepository;
  actor: Actor;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type AcceptCrossOrgTransferInput = {
  receiverOrgToken: string;
  casePublicCode: string;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function acceptCrossOrgTransfer(
  input: AcceptCrossOrgTransferInput,
  deps: Deps,
): Promise<UseCaseResult<{ publicCode: string }>> {
  const { repo, actor, transaction } = deps;
  const { user, organization } = actor;

  // 1. Receiver org token match.
  const tokenMatch = validateOrgTokenMatch(
    organization.publicToken,
    input.receiverOrgToken,
    "receiver",
  );
  if (!tokenMatch.ok) return tokenMatch;

  // 2. Load case.
  const caseRow = await repo.findCaseByPublicCode(input.casePublicCode);
  if (!caseRow) return { ok: false, error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_transfer_handshake") {
    return { ok: false, error: "Este caso no es un handshake de transferencia." };
  }
  if (caseRow.status !== "open") {
    return { ok: false, error: "Este caso ya no está abierto." };
  }
  if (!caseRow.primaryPetId) {
    return { ok: false, error: "Caso sin mascota asociada." };
  }

  // 3. Load proposal events (LIMIT 2) + duplicate-proposal guard.
  const proposalEvents = await repo.proposalEventsForCase(caseRow.id);
  const dupGuard = validateDuplicateProposalGuard(proposalEvents.length);
  if (!dupGuard.ok) return dupGuard;
  const [proposalEvent] = proposalEvents;
  const proposalPayload = proposalEvent.payload as {
    from_organization_id?: string;
    to_organization_id?: string;
    reason?: string;
  };

  // 4. Canonical sender resolution + drift detection.
  const senderResult = validateSenderOrgScope({
    caseOpenedByOrganizationId: caseRow.openedByOrganizationId,
    payloadFromOrganizationId: proposalPayload.from_organization_id,
  });
  if (!senderResult.ok) return senderResult;
  const { canonicalSenderOrgId } = senderResult.value;

  // 5. Canonical receiver resolution + drift detection — SECURITY BOUNDARY.
  const receiverResult = validateReceiverOrgScope({
    caseReceiverOrganizationId: caseRow.receiverOrganizationId,
    payloadToOrganizationId: proposalPayload.to_organization_id,
    callerOrgId: organization.id,
  });
  if (!receiverResult.ok) return receiverResult;

  // 6. Pre-tx: find open custody_episode.
  const custodyCase = await repo.findOpenCustodyEpisode(caseRow.primaryPetId);

  const pendingNotifications: NewNotification[] = [];

  // 7. Atomic transaction.
  try {
    await transaction(async (tx) => {
      const now = new Date();

      await repo.insertPetEvent(
        {
          petId: caseRow.primaryPetId as string,
          eventType: "custody_transferred",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          authorVerified: organization.verified,
          payload: {
            from_user_id: null,
            from_organization_id: canonicalSenderOrgId,
            to_user_id: null,
            to_organization_id: organization.id,
            from_role: "shelter_custody",
            to_role: "shelter_custody",
            reason: proposalPayload.reason ?? "org_to_org_handoff",
            matched_against_pet_id: null,
            foster_ended_event_id: null,
            notes: null,
          },
          caseId: caseRow.id,
        },
        tx as Parameters<typeof repo.insertPetEvent>[1],
      );

      await repo.endShelterCustody(
        caseRow.primaryPetId as string,
        canonicalSenderOrgId,
        tx as Parameters<typeof repo.endShelterCustody>[2],
      );

      await repo.insertShelterCustody(
        {
          petId: caseRow.primaryPetId as string,
          ownerOrganizationId: organization.id,
          startedAt: now,
        },
        tx as Parameters<typeof repo.insertShelterCustody>[1],
      );

      await repo.closeCase(
        { caseId: caseRow.id, reason: "resolved", closedByUserId: user.id },
        tx as Parameters<typeof repo.closeCase>[1],
      );

      if (custodyCase) {
        await repo.closeCase(
          { caseId: custodyCase.id, reason: "resolved", closedByUserId: user.id },
          tx as Parameters<typeof repo.closeCase>[1],
        );
      }

      // Sender coordinators notification.
      const senderCoords = await repo.orgCoordinatorAdminUserIds(
        canonicalSenderOrgId,
        tx as Parameters<typeof repo.orgCoordinatorAdminUserIds>[1],
      );
      for (const r of senderCoords) {
        pendingNotifications.push({
          userId: r.userId,
          notificationType: "cross_org_transfer_accepted_sender",
          severity: "success",
          title: "Tu transferencia fue aceptada",
          body: `${organization.displayName} recibió la custodia. La transferencia está completa.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      // Receiver user notification.
      pendingNotifications.push({
        userId: user.id,
        notificationType: "cross_org_transfer_accepted_receiver",
        severity: "success",
        title: "Transferencia confirmada",
        body: `La pet pasó formalmente a custodia de ${organization.displayName}.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
        relatedPetId: caseRow.primaryPetId,
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo aceptar la transferencia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return {
    ok: true,
    value: { publicCode: caseRow.publicCode },
    notifications: pendingNotifications,
  };
}
