// Use-case: the titular asks a verified org to sponsor their pet's adoption
// listing (rehome-by-titular, spec REQ-1, REQ-2, REQ-16).
//
// AUTH IS THE ACTION'S JOB. `requireTitularAccess` plus the owner-role check
// run at the edge and hand this layer an already-authorized `titularUserId`.
// This layer still re-asserts the live `owner` row (defense in depth): a
// foster, a caretaker or a co-owner holds a Path-1 row and would pass the
// pet-access guard, and none of them may consent to this arrangement.
//
// NO SPINE EVENT IS WRITTEN HERE. A pending request is workflow state, not a
// fact about the animal. `rehome_sponsorship_started` is emitted at ACCEPT, by
// respond-to-rehome-request.ts, in the same transaction that grants custody.
// This file opens a case — the org's inbox item — and nothing else.

import { validateRequestOpen, validateSponsorTarget } from "../domain/rehome-rules";
import type { RehomeRequestPort } from "./ports";
import type { NewNotification, UseCaseResult } from "./types";

type Deps = {
  repo: RehomeRequestPort;
  now: () => Date;
};

export type RequestRehomeSponsorshipInput = {
  petPublicToken: string;
  titularUserId: string;
  targetOrgId: string;
};

export type RequestRehomeSponsorshipValue = {
  caseId: string;
  casePublicCode: string;
  orgDisplayName: string;
};

export const NOT_TITULAR_ERROR =
  "Solo el titular de la mascota puede pedir un acompañamiento de adopción.";

export async function requestRehomeSponsorship(
  input: RequestRehomeSponsorshipInput,
  deps: Deps,
): Promise<UseCaseResult<RequestRehomeSponsorshipValue>> {
  const { repo } = deps;

  const pet = await repo.findPetByToken(input.petPublicToken);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // REQ-1 / REQ-14: the live OWNER row, and only that. This is the check that
  // keeps the foster's pre-existing "find my foster a home" flow distinct from
  // a titular's consent (spec §3) — they never share an authorization check.
  const ownerRow = await repo.findLiveOwnerRow(pet.id, input.titularUserId);
  if (!ownerRow) return { ok: false, error: NOT_TITULAR_ERROR };

  const org = await repo.findOrgById(input.targetOrgId);
  const target = validateSponsorTarget(org);
  if (!target.ok) return { ok: false, error: target.error };
  if (!org) return { ok: false, error: "Organización no encontrada." };

  // REQ-16: one open request OR one running sponsorship per pet. The readable
  // refusal lives here; the invariant itself is `cases_open_per_pet_kind_idx`
  // (a partial unique index over open cases per pet and kind), which is what
  // holds under a race.
  const [openRequest, openSponsorship] = [
    await repo.findOpenRequestForPet(pet.id),
    await repo.hasOpenSponsorship(pet.id),
  ];
  const gate = validateRequestOpen({
    petStatus: pet.status,
    hasOpenRequest: openRequest !== null,
    hasOpenSponsorship: openSponsorship,
  });
  if (!gate.ok) return { ok: false, error: gate.error };

  const caseRow = await repo.openRequestCase({
    petId: pet.id,
    titularUserId: input.titularUserId,
    orgId: org.id,
    orgDisplayName: org.displayName,
    jurisdictionProvince: pet.jurisdictionProvince,
    jurisdictionLocality: pet.jurisdictionLocality,
    localityId: pet.localityId,
  });

  const titularName = (await repo.findDisplayName(input.titularUserId)) ?? "El titular";
  const recipients = await repo.orgAdminAndCoordinatorUserIds(org.id);
  const notifications: NewNotification[] = recipients.map((userId) => ({
    userId,
    notificationType: "rehome_request_received",
    severity: "info",
    title: `Solicitud de nuevo hogar: ${pet.name}`,
    body: `${titularName} pide que ${org.displayName} acompañe la adopción de ${pet.name}. El animal sigue viviendo con su familia mientras dure el acompañamiento.`,
    dedupeKey: `rehome:requested:${caseRow.id}:${userId}`,
    ctaLabel: "Ver solicitud",
    ctaUrl: `/casos/${caseRow.publicCode}`,
    relatedPetId: pet.id,
    relatedCaseId: caseRow.id,
    category: "custody",
  }));

  return {
    ok: true,
    value: {
      caseId: caseRow.id,
      casePublicCode: caseRow.publicCode,
      orgDisplayName: org.displayName,
    },
    notifications,
  };
}
