// Role-rank constants for org member invitations.
// Extracted from org-invitations.ts so "use server" is not polluted with
// non-async-function exports (Next.js 15 strict "use server" contract).

import type { OrganizationMembership } from "@/db";

// Invitable roles (foster excluded — comes via foster-proposal flow).
const INVITABLE_ROLES = ["admin", "coordinator", "member", "volunteer", "vet_individual"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_RANK: Record<OrganizationMembership["role"], number> = {
  admin: 5,
  coordinator: 4,
  member: 3,
  vet_individual: 3,
  volunteer: 2,
  foster: 1,
};

export { INVITABLE_ROLES };
