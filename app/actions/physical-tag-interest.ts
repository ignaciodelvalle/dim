"use server";

// physical-tag-interest.ts — thin shim (strangler migration 53/61).
//
// Business logic moved to:
//   src/modules/pets/application/physical-tag-interest/
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import type { TogglePhysicalTagInterestResult } from "@/src/modules/pets/application/physical-tag-interest/types";
import { togglePhysicalTagInterest } from "@/src/modules/pets/application/physical-tag-interest/toggle-physical-tag-interest";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { TogglePhysicalTagInterestResult };

// ---------------------------------------------------------------------------
// Action wrapper — thin shim delegating to the use-case
// ---------------------------------------------------------------------------

export async function togglePhysicalTagInterestAction(
  petPublicToken: string,
): Promise<TogglePhysicalTagInterestResult> {
  return togglePhysicalTagInterest(petPublicToken);
}
