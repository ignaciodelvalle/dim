// Use-case: the titular cancels a rehome_request the org has NOT answered yet
// (rehome-by-titular, spec REQ-3; WU3 review M-3).
//
// WHY THIS EXISTS. The lifecycle has no event opener and no event terminal:
// the case opens with the request action and closes with an action. Until
// this use-case, the only closing action was the org's answer — an org that
// never answers left the request open forever, and REQ-16 then refused the
// titular every other org ("ya hay una solicitud pendiente"). This is the
// titular's own way out of that, and it is the same class of act as the org's
// decline: an action-close, NOT an operator's manual close
// (`manualCloseAllowed` stays false — that flag is the admin/govt generic
// close button on the case detail).
//
// NOTHING ON THE SPINE. A pending request is workflow state, not a fact about
// the animal; cancelling it is the same (design ADR-1, "decline / withdraw
// before accept"). The case row carries `cancelled` + the TITULAR as actor —
// the same closedReason an org decline uses, told apart by who closed it —
// and the `case_closed` timeline entry says so in words (REQ-3: "textually
// distinct from an org decline and from an operator's manual close").

import {
  NOT_TITULAR_ERROR,
  NO_PENDING_REQUEST_ERROR,
  validateWithdrawRequest,
} from "../domain/rehome-rules";
import type { RehomeWithdrawPort } from "./ports";
import type { NewNotification, UseCaseResult } from "./types";

type Deps = {
  repo: RehomeWithdrawPort;
  now: () => Date;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type WithdrawRehomeRequestInput = {
  petPublicToken: string;
  titularUserId: string;
};

export type WithdrawRehomeRequestValue = {
  caseId: string;
  casePublicCode: string;
  petId: string;
  petPublicToken: string;
  receiverOrganizationId: string;
};

type TxOutcome =
  | { ok: true; caseId: string; casePublicCode: string; orgId: string; orgDisplayName: string }
  | { ok: false; error: string };

export async function withdrawRehomeRequest(
  input: WithdrawRehomeRequestInput,
  deps: Deps,
): Promise<UseCaseResult<WithdrawRehomeRequestValue>> {
  const { repo } = deps;

  const pet = await repo.findPetByToken(input.petPublicToken);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // REQ-1 / REQ-14, re-asserted: the live OWNER row and only that.
  const ownerRow = await repo.findLiveOwnerRow(pet.id, input.titularUserId);
  if (!ownerRow) return { ok: false, error: NOT_TITULAR_ERROR };

  // Pre-transaction read: a readable refusal. Re-read under the lock below.
  const pre = await repo.findOpenRequestForPet(pet.id);
  if (!pre) return { ok: false, error: NO_PENDING_REQUEST_ERROR };

  const now = deps.now();

  const outcome = await deps.transaction<TxOutcome>(async (tx) => {
    // The org's answer and this cancel race for the same row; the lock
    // serialises them and the loser reads the flipped status.
    const locked = await repo.lockRequestCase(pre.id, tx);
    if (!locked) return { ok: false, error: NO_PENDING_REQUEST_ERROR };
    const gate = validateWithdrawRequest({
      caseKind: locked.caseKind,
      caseStatus: locked.status,
      caseOpenedByUserId: locked.openedByUserId,
      actingUserId: input.titularUserId,
    });
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!locked.receiverOrganizationId) {
      return { ok: false, error: "La solicitud no tiene una organización destinataria." };
    }

    const org = await repo.findOrgById(locked.receiverOrganizationId, tx);
    const orgName = org?.displayName ?? "la organización";

    await repo.closeRequestCase(
      {
        caseId: locked.id,
        reason: "cancelled",
        closedByUserId: input.titularUserId,
        decision: "withdrawn",
        organizationId: locked.receiverOrganizationId,
        timelineNote: `El titular canceló la solicitud de nuevo hogar antes de que ${orgName} respondiera. El animal sigue con su titular y no se creó ninguna publicación.`,
        now,
      },
      tx,
    );

    return {
      ok: true,
      caseId: locked.id,
      casePublicCode: locked.publicCode,
      orgId: locked.receiverOrganizationId,
      orgDisplayName: orgName,
    };
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };

  const titularName = (await repo.findDisplayName(input.titularUserId)) ?? "El titular";
  const recipients = await repo.orgAdminAndCoordinatorUserIds(outcome.orgId);
  const notifications: NewNotification[] = recipients.map((userId) => ({
    userId,
    notificationType: "rehome_request_withdrawn",
    severity: "info",
    title: `Solicitud de nuevo hogar cancelada: ${pet.name}`,
    body: `${titularName} canceló la solicitud antes de que ${outcome.orgDisplayName} respondiera. No hace falta hacer nada.`,
    dedupeKey: `rehome:request_withdrawn:${outcome.caseId}:${userId}`,
    ctaLabel: "Ver solicitud",
    ctaUrl: `/casos/${outcome.casePublicCode}`,
    relatedPetId: pet.id,
    relatedCaseId: outcome.caseId,
    category: "custody",
  }));

  return {
    ok: true,
    value: {
      caseId: outcome.caseId,
      casePublicCode: outcome.casePublicCode,
      petId: pet.id,
      petPublicToken: pet.publicToken,
      receiverOrganizationId: outcome.orgId,
    },
    notifications,
  };
}
