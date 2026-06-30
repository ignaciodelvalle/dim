"use server";

// performed-by.ts — thin shim (strangler migration 60/61).
//
// Business logic moved to:
//   src/modules/search/application/performed-by/
//
// This file re-exports the type and provides thin Action wrappers so all
// existing UI importers and the parity test keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requireUserOrRedirect } from "@/lib/auth-guards";
import type { SearchJurisdiction } from "@/lib/performed-by-search";
import {
  __resetPerformedByRateLimitForTests as _reset,
  searchVetsAndClinicsAction as _searchVetsAndClinicsAction,
} from "@/src/modules/search/application/performed-by/search-performed-by";

// ---------------------------------------------------------------------------
// Type re-export (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { SearchPerformedByResult } from "@/src/modules/search/application/performed-by/types";

// ---------------------------------------------------------------------------
// Action wrappers — auth-gated: guard here, module does the work
// ---------------------------------------------------------------------------

export async function searchVetsAndClinicsAction(input: {
  query: string;
  jurisdiction?: SearchJurisdiction;
}): Promise<Awaited<ReturnType<typeof _searchVetsAndClinicsAction>>> {
  const { user } = await requireUserOrRedirect();
  return _searchVetsAndClinicsAction(user.id, input);
}

// @no-auth-required: test-only reset helper — delegates to the module that
// owns the rate-limit state so the reset resets the live state.
export async function __resetPerformedByRateLimitForTests(): Promise<void> {
  return _reset();
}
