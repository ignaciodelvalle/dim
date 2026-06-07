"use server";

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
