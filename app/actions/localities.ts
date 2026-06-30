"use server";

// localities.ts — thin shim (strangler migration 46/61).
//
// Business logic moved to:
//   src/modules/localities/application/search/
//
// This file re-exports the type and provides thin Action wrappers so all
// existing UI importers and the parity test keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import {
  __resetRateLimitForTests as _reset,
  searchLocalitiesAction as _searchLocalitiesAction,
  searchLocalitiesPublicAction as _searchLocalitiesPublicAction,
} from "@/src/modules/localities/application/search/search-localities";

// ---------------------------------------------------------------------------
// Type re-export (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { SearchLocalitiesResult } from "@/src/modules/localities/application/search/types";

// ---------------------------------------------------------------------------
// Action wrappers — thin delegating async functions
// ---------------------------------------------------------------------------

export async function searchLocalitiesAction(
  ...args: Parameters<typeof _searchLocalitiesAction>
): Promise<Awaited<ReturnType<typeof _searchLocalitiesAction>>> {
  return _searchLocalitiesAction(...args);
}

export async function searchLocalitiesPublicAction(
  ...args: Parameters<typeof _searchLocalitiesPublicAction>
): Promise<Awaited<ReturnType<typeof _searchLocalitiesPublicAction>>> {
  return _searchLocalitiesPublicAction(...args);
}

// @no-auth-required: test-only reset helper — delegates to the module that
// owns the rate-limit state so the reset resets the live state.
export async function __resetRateLimitForTests(): Promise<void> {
  return _reset();
}
