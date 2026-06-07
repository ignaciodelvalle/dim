// Re-export barrel (NOT a "use server" file): the re-exported actions keep their own
// "use server" directive at their definition in src/modules/organizations/actions.ts.
// A "use server" file may only export locally-declared async functions, so a barrel
// re-exporting bindings/types must not carry the directive.
//
// Strangler-fig shim: all symbols now live in src/modules/organizations/actions.ts.
// This file re-exports them to avoid breaking existing importers.
// Delete only when all importers have been repointed to the module path.

export type {
  AddCoverageZoneInput,
  RemoveCoverageZoneInput,
  SetPrimaryCoverageZoneInput,
  ActionResult,
} from "@/src/modules/organizations/actions";

export {
  addCoverageZoneAction,
  removeCoverageZoneAction,
  setPrimaryCoverageZoneAction,
} from "@/src/modules/organizations/actions";
