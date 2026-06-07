// Re-export shim. Role-rank constants now live in the organizations domain layer.
// This file is kept so existing importers continue to work unchanged until they are
// repointed in a later PR (app/actions/org-invitations.ts, org-memberships.ts,
// app/org/[orgToken]/miembros/*).
// Do NOT delete until all importers are repointed and parity tests pass.

export {
  INVITABLE_ROLES,
  type InvitableRole,
  ROLE_RANK,
} from "@/src/modules/organizations/domain/role-rules";
