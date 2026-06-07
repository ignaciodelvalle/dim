"use server";

// Strangler-fig shim: all symbols now live in src/modules/organizations/actions.ts.
// This file re-exports them to avoid breaking existing importers.
// Delete only when all importers have been repointed to the module path.

export type { SubmitOrgContactState } from "@/src/modules/organizations/actions";

export { submitOrgContactAction } from "@/src/modules/organizations/actions";
