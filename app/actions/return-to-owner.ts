"use server";

// return-to-owner.ts — Lost & Found Fase 5 (thin controller).
//
// Business logic lives in src/modules/return-to-owner/application/.
// This file: auth guard → delegate to use-case → return result.
//
// Strangler migration: 1928 lines → thin controllers.
// Writer-pattern preserved: each action has a public wrapper (handles auth /
// session) and an inner writer (exported for direct test access, no session
// required). Existing callers and tests import these names unchanged.

import { and, eq, isNull } from "drizzle-orm";

import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken, requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { actorCancelProposalUseCase } from "@/src/modules/return-to-owner/application/actor-cancel-proposal";
import { orgAcceptOwnerReturnUseCase } from "@/src/modules/return-to-owner/application/org-accept-owner-return";
import { orgRejectOwnerReturnUseCase } from "@/src/modules/return-to-owner/application/org-reject-owner-return";
import { ownerAcceptReturnUseCase } from "@/src/modules/return-to-owner/application/owner-accept-return";
import { ownerProposeReturnToOrgUseCase } from "@/src/modules/return-to-owner/application/owner-propose-return-to-org";
import { ownerRejectReturnUseCase } from "@/src/modules/return-to-owner/application/owner-reject-return";
import { proposeReturnAsRefugioUseCase } from "@/src/modules/return-to-owner/application/propose-return-as-refugio";
import { proposeReturnAsVecinoUseCase } from "@/src/modules/return-to-owner/application/propose-return-as-vecino";

// ---------------------------------------------------------------------------
// Re-export public types (callers must not change)
// ---------------------------------------------------------------------------

export type {
  AcceptReturnResult,
  CancelProposalResult,
  OrgAcceptOwnerReturnResult,
  OrgRejectOwnerReturnResult,
  OwnerProposeReturnToOrgResult,
  ProposeReturnResult,
  RejectReturnResult,
} from "@/src/modules/return-to-owner/domain/types";

// ---------------------------------------------------------------------------
// Public action — proposeReturnToOwnerAction
// ---------------------------------------------------------------------------

export async function proposeReturnToOwnerAction({
  petPublicToken,
  actorMode,
  orgToken,
  notes,
}: {
  petPublicToken: string;
  actorMode: "refugio" | "vecino";
  orgToken?: string;
  notes?: string | null;
}) {
  if (actorMode === "refugio") {
    if (!orgToken) return { error: "orgToken requerido para actorMode='refugio'." };
    const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
    const granted = await getGrantedCapabilities(membership);
    if (!granted.has("custody.transfer")) {
      return { error: "Se necesita el permiso custody.transfer para proponer una devolución." };
    }
    return proposeReturnAsRefugioWriter({
      userId: user.id,
      organization: { id: organization.id, displayName: organization.displayName },
      petPublicToken,
      notes: notes ?? null,
    });
  }

  if (actorMode === "vecino") {
    const { user } = await requireUserOrRedirect();
    return proposeReturnAsVecinoWriter({ userId: user.id, petPublicToken, notes: notes ?? null });
  }

  return { error: "actorMode inválido. Debe ser 'refugio' o 'vecino'." };
}

// ---------------------------------------------------------------------------
// Inner writer — proposeReturn (refugio path)
// ---------------------------------------------------------------------------

export async function proposeReturnAsRefugioWriter(args: {
  userId: string;
  organization: { id: string; displayName: string };
  petPublicToken: string;
  notes: string | null;
}) {
  return proposeReturnAsRefugioUseCase(args);
}

// ---------------------------------------------------------------------------
// Inner writer — proposeReturn (vecino path)
// ---------------------------------------------------------------------------

export async function proposeReturnAsVecinoWriter(args: {
  userId: string;
  petPublicToken: string;
  notes: string | null;
}) {
  return proposeReturnAsVecinoUseCase(args);
}

// ---------------------------------------------------------------------------
// Public action — ownerAcceptReturnAction
// ---------------------------------------------------------------------------

export async function ownerAcceptReturnAction({ petPublicToken }: { petPublicToken: string }) {
  const { user } = await requireUserOrRedirect();
  return ownerAcceptReturnWriter({ userId: user.id, petPublicToken });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerAcceptReturn
// ---------------------------------------------------------------------------

export async function ownerAcceptReturnWriter(args: {
  userId: string;
  petPublicToken: string;
}) {
  return ownerAcceptReturnUseCase(args);
}

// ---------------------------------------------------------------------------
// Public action — ownerRejectReturnAction
// ---------------------------------------------------------------------------

export async function ownerRejectReturnAction({
  petPublicToken,
  reason,
}: {
  petPublicToken: string;
  reason: string;
}) {
  const { user } = await requireUserOrRedirect();
  return ownerRejectReturnWriter({ userId: user.id, petPublicToken, reason });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerRejectReturn
// ---------------------------------------------------------------------------

export async function ownerRejectReturnWriter(args: {
  userId: string;
  petPublicToken: string;
  reason: string;
}) {
  return ownerRejectReturnUseCase(args);
}

// ---------------------------------------------------------------------------
// Public action — actorCancelProposalAction
// ---------------------------------------------------------------------------

export async function actorCancelProposalAction({
  petPublicToken,
  reason,
  orgToken,
}: {
  petPublicToken: string;
  reason: string;
  orgToken?: string;
}) {
  const { user } = await requireUserOrRedirect();
  let actorOrgId: string | undefined;
  if (orgToken) {
    const { organization } = await requireOrgAccessByToken(orgToken);
    actorOrgId = organization.id;
  }
  return actorCancelProposalWriter({ userId: user.id, petPublicToken, reason, actorOrgId });
}

// ---------------------------------------------------------------------------
// Inner writer — actorCancelProposal
// ---------------------------------------------------------------------------

export async function actorCancelProposalWriter(args: {
  userId: string;
  petPublicToken: string;
  reason: string;
  actorOrgId?: string;
}) {
  return actorCancelProposalUseCase(args);
}

// ---------------------------------------------------------------------------
// Read helpers — intentionally NOT exported from this "use server" file.
// fetchPendingReturnProposalForOwner / fetchPendingOwnerReturnProposalForOrg /
// loadProposalContext are unguarded projection queries; exporting them here
// made each an independently-addressable server action (read leak — authz
// triage 2026-07-04). Server components import them from
// src/modules/return-to-owner/application/{proposal-queries,load-proposal-context}.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public action — ownerProposeReturnToOrgAction
// ---------------------------------------------------------------------------

export async function ownerProposeReturnToOrgAction({
  petPublicToken,
  reason,
  notes,
  proposedAt,
}: {
  petPublicToken: string;
  reason: string;
  notes: string | null;
  proposedAt: string;
}) {
  const { user } = await requireUserOrRedirect();

  const [petRow] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.publicToken, petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada." };

  const [callerOwnership] = await db
    .select({ role: ownerships.role })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, petRow.id),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  const callerRole: "owner" | "foster" = callerOwnership?.role === "foster" ? "foster" : "owner";

  return ownerProposeReturnToOrgWriter({
    userId: user.id,
    petPublicToken,
    reason,
    notes,
    proposedAt,
    callerRole,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — ownerProposeReturnToOrg
// ---------------------------------------------------------------------------

export async function ownerProposeReturnToOrgWriter(args: {
  userId: string;
  petPublicToken: string;
  reason: string;
  notes: string | null;
  proposedAt: string;
  callerRole?: "owner" | "foster";
}) {
  return ownerProposeReturnToOrgUseCase(args);
}

// ---------------------------------------------------------------------------
// Public action — orgAcceptOwnerReturnAction
// ---------------------------------------------------------------------------

export async function orgAcceptOwnerReturnAction({
  petPublicToken,
  orgToken,
}: {
  petPublicToken: string;
  orgToken: string;
}) {
  const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("custody.transfer")) {
    return { error: "Se necesita el permiso custody.transfer para aceptar la devolución." };
  }
  return orgAcceptOwnerReturnWriter({
    orgId: organization.id,
    orgDisplayName: organization.displayName,
    actingUserId: user.id,
    petPublicToken,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — orgAcceptOwnerReturn
// ---------------------------------------------------------------------------

export async function orgAcceptOwnerReturnWriter(args: {
  orgId: string;
  orgDisplayName: string;
  actingUserId: string;
  petPublicToken: string;
}) {
  return orgAcceptOwnerReturnUseCase(args);
}

// ---------------------------------------------------------------------------
// Public action — orgRejectOwnerReturnAction
// ---------------------------------------------------------------------------

export async function orgRejectOwnerReturnAction({
  petPublicToken,
  orgToken,
  reason,
}: {
  petPublicToken: string;
  orgToken: string;
  reason: string;
}) {
  const { organization, membership, user } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("custody.transfer")) {
    return { error: "Se necesita el permiso custody.transfer para rechazar la devolución." };
  }
  return orgRejectOwnerReturnWriter({
    orgId: organization.id,
    orgDisplayName: organization.displayName,
    actingUserId: user.id,
    petPublicToken,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Inner writer — orgRejectOwnerReturn
// ---------------------------------------------------------------------------

export async function orgRejectOwnerReturnWriter(args: {
  orgId: string;
  orgDisplayName: string;
  actingUserId: string;
  petPublicToken: string;
  reason: string;
}) {
  return orgRejectOwnerReturnUseCase(args);
}
