// Use-case: set canWritePetEvents on an org member (admin action).
//
// Migrated from app/actions/org-memberships.ts::setMemberEventWriteAction.
// Auth (requireCapability("member.invite", organizationId)) handled by caller.
//
// Rules (exact parity with original):
//   1. Load target membership.
//   2. Self-check.
//   3. Rank rule.
//   4. setEventWrite.

import { ROLE_RANK } from "@/src/modules/organizations/domain/role-rules";
import type { OrgRepository } from "@/src/modules/organizations/infrastructure/org-repository";
import type { UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Input / Deps
// ---------------------------------------------------------------------------

export type SetMemberEventWriteInput = {
  organizationId: string;
  membershipId: string;
  canWrite: boolean;
  actor: {
    userId: string;
    role: string;
    membershipId: string;
  };
  organization: {
    publicToken: string;
  };
};

type RepoDeps = Pick<OrgRepository, "findActiveMembership" | "setEventWrite">;

type Deps = {
  repo: RepoDeps;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function setMemberEventWrite(
  input: SetMemberEventWriteInput,
  deps: Deps,
): Promise<UseCaseResult<void>> {
  const { repo } = deps;

  // 1. Load target.
  const target = await repo.findActiveMembership(input.organizationId, input.membershipId);
  if (!target) return { ok: false, error: "Membresía no encontrada o ya inactiva." };

  // 2. Self-check.
  if (target.userId === input.actor.userId) {
    return {
      ok: false,
      error: "No podés modificar tu propio permiso de escritura por esta vía.",
    };
  }

  // 3. Rank rule.
  const actorRank = ROLE_RANK[input.actor.role as keyof typeof ROLE_RANK] ?? 0;
  const targetRank = ROLE_RANK[target.role] ?? 0;
  if (targetRank > actorRank) {
    return { ok: false, error: "No podés gestionar a alguien con un rol mayor al tuyo." };
  }

  // 4. Update (no tx — uses default db executor).
  await repo.setEventWrite(input.membershipId, input.canWrite);

  return { ok: true, value: undefined, notifications: [] };
}
