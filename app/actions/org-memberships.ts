// Re-export barrel (NOT a "use server" file): the re-exported actions keep their own
// "use server" directive at their definition in src/modules/organizations/actions.ts.
// A "use server" file may only export locally-declared async functions, so a barrel
// re-exporting bindings/types must not carry the directive.
//
// SHIM — re-exports from src/modules/organizations/actions.ts.
//
// This file is kept so all existing import sites (UI pages, tests) continue
// to work unchanged. WU-5 (strangler) will delete this shim after every
// importer has been repointed and parity tests are green.

export type {
  RemoveMemberResult,
  ChangeMemberRoleResult,
  SetMemberEventWriteResult,
  LeaveOrganizationResult,
} from "@/src/modules/organizations/actions";
export {
  removeMemberAction,
  changeMemberRoleAction,
  setMemberEventWriteAction,
  leaveOrganizationAction,
} from "@/src/modules/organizations/actions";
