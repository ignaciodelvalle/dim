"use server";

// return-to-owner-form.ts — thin shim (strangler 37/61, 2026-06-30).
//
// Form-adapter use-cases moved to:
//   src/modules/return-to-owner/application/forms/
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import {
  actorCancelProposalFormAction as _actorCancelProposalFormAction,
  ownerAcceptReturnFormAction as _ownerAcceptReturnFormAction,
  ownerProposeReturnToOrgFormAction as _ownerProposeReturnToOrgFormAction,
  ownerRejectReturnFormAction as _ownerRejectReturnFormAction,
  proposeReturnToOwnerFormAction as _proposeReturnToOwnerFormAction,
} from "@/src/modules/return-to-owner/application/forms/return-to-owner-forms";

export type {
  AcceptReturnFormState,
  CancelProposalFormState,
  OwnerProposeReturnToOrgFormState,
  RejectReturnFormState,
} from "@/src/modules/return-to-owner/application/forms/types";

export async function actorCancelProposalFormAction(
  ...args: Parameters<typeof _actorCancelProposalFormAction>
) {
  return _actorCancelProposalFormAction(...args);
}

export async function ownerAcceptReturnFormAction(
  ...args: Parameters<typeof _ownerAcceptReturnFormAction>
) {
  return _ownerAcceptReturnFormAction(...args);
}

export async function ownerProposeReturnToOrgFormAction(
  ...args: Parameters<typeof _ownerProposeReturnToOrgFormAction>
) {
  return _ownerProposeReturnToOrgFormAction(...args);
}

export async function ownerRejectReturnFormAction(
  ...args: Parameters<typeof _ownerRejectReturnFormAction>
) {
  return _ownerRejectReturnFormAction(...args);
}

export async function proposeReturnToOwnerFormAction(
  ...args: Parameters<typeof _proposeReturnToOwnerFormAction>
) {
  return _proposeReturnToOwnerFormAction(...args);
}
