"use server";

// Strangler-fig shim: all symbols now live in src/modules/organizations/actions.ts.
// This file re-exports them to avoid breaking existing importers.
// Delete only when all importers have been repointed to the module path.

export type { CapabilityActionState } from "@/src/modules/organizations/actions";

export {
  requestCapabilityAction,
  decideCapabilityAction,
} from "@/src/modules/organizations/actions";
