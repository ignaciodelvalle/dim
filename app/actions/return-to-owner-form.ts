"use server";

// return-to-owner-form.ts — thin shim (strangler 37/61, 2026-06-30).
//
// Form-adapter use-cases moved to:
//   src/modules/return-to-owner/application/forms/
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

export type {
  AcceptReturnFormState,
  CancelProposalFormState,
  OwnerProposeReturnToOrgFormState,
  RejectReturnFormState,
} from "@/src/modules/return-to-owner/application/forms/types";

export {
  actorCancelProposalFormAction,
  ownerAcceptReturnFormAction,
  ownerProposeReturnToOrgFormAction,
  ownerRejectReturnFormAction,
  proposeReturnToOwnerFormAction,
} from "@/src/modules/return-to-owner/application/forms/return-to-owner-forms";
