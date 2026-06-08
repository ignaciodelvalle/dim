// Use-cases and pure helpers for the "Buscar nuevo hogar" foster CTA.
//
// findRehomeOrgs — query: verified shelter/rescue_network orgs covering the
//   pet's jurisdiction (province/locality). NO capacity filter.
//
// filterRehomeOrgCandidates — pure filter: shelter + rescue_network + verified.
//   Extracted so it can be unit-tested without a DB.
//
// sendRehomeRequest — use-case: notify org admins/coordinators about the foster
//   user's rehome request. Lean MVP — no new schema, best-effort notification.
//   Auth: caller must be the active foster of this pet.

import type { FosterRepository } from "../infrastructure/foster-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Pure type — org candidate shape (subset returned from the repo query)
// ---------------------------------------------------------------------------

export type RehomeOrgCandidate = {
  id: string;
  displayName: string;
  orgType: string;
  verified: boolean;
  publicToken: string;
  email: string;
  phone: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

// ---------------------------------------------------------------------------
// Pure filter — testable without DB
// ---------------------------------------------------------------------------

const REHOME_ELIGIBLE_ORG_TYPES = new Set(["shelter", "rescue_network"]);

/**
 * Filters a list of org candidates to those eligible for rehome requests:
 * verified + shelter or rescue_network type.
 */
export function filterRehomeOrgCandidates(orgs: RehomeOrgCandidate[]): RehomeOrgCandidate[] {
  return orgs.filter((org) => org.verified && REHOME_ELIGIBLE_ORG_TYPES.has(org.orgType));
}

// ---------------------------------------------------------------------------
// sendRehomeRequest use-case
// ---------------------------------------------------------------------------

type Actor = {
  user: { id: string };
};

type SendRehomeRequestDeps = {
  repo: typeof FosterRepository;
  actor: Actor;
};

export type SendRehomeRequestInput = {
  petPublicToken: string;
  targetOrgId: string;
};

export async function sendRehomeRequest(
  input: SendRehomeRequestInput,
  deps: SendRehomeRequestDeps,
): Promise<UseCaseResult<void>> {
  const { repo, actor } = deps;
  const { user } = actor;

  // 1. Pet lookup.
  const petRow = await repo.findPetByToken(input.petPublicToken);
  if (!petRow) {
    return { ok: false, error: "Mascota no encontrada." };
  }

  // 2. Auth: verify caller is the active foster.
  const fosterRow = await repo.findActiveFosterByUser(petRow.id, user.id);
  if (!fosterRow) {
    return {
      ok: false,
      error: "No tenés un tránsito activo para esta mascota.",
    };
  }

  // 3. Validate target org — must exist and be verified shelter/rescue_network.
  const orgRow = await repo.findOrgById(input.targetOrgId);
  if (!orgRow) {
    return { ok: false, error: "Organización no encontrada." };
  }
  if (!REHOME_ELIGIBLE_ORG_TYPES.has(orgRow.orgType)) {
    return {
      ok: false,
      error: "La organización no es de tipo válido para recibir solicitudes de nuevo hogar.",
    };
  }
  if (!orgRow.verified) {
    return { ok: false, error: "La organización no está verificada." };
  }

  // 4. Resolve foster user contact info.
  const fosterProfile = await repo.findProfileById(user.id);
  const fosterName = fosterProfile?.displayName ?? "Tránsito";
  const fosterPhone = fosterProfile?.phone ?? null;

  const petName = (petRow as { name: string }).name;
  const petToken = (petRow as { publicToken: string }).publicToken;

  // 5. Resolve org admins + coordinators for notification fan-out.
  const recipients = await repo.orgAdminAndCoordinatorUserIds(input.targetOrgId);

  const pendingNotifications: NewNotification[] = recipients.map((r) => ({
    userId: r.userId,
    notificationType: "rehome_request_received",
    title: `Solicitud de nuevo hogar: ${petName}`,
    body: [
      `${fosterName} está cuidando a ${petName} en tránsito y busca darle un hogar definitivo.`,
      fosterPhone ? `Contacto: ${fosterPhone}.` : null,
      `Ver mascota: /p/${petToken}`,
    ]
      .filter(Boolean)
      .join(" "),
    severity: "info",
    ctaLabel: "Ver mascota",
    ctaUrl: `/p/${petToken}`,
    relatedPetId: petRow.id,
  }));

  return { ok: true, value: undefined, notifications: pendingNotifications };
}
