"use server";

// apply-intent.ts — thin shim (strangler migration 39/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/adoption/application/apply-intent/
//
// This file re-exports all originally-exported symbols (3 actions + 1 type)
// with identical signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import type { StartApplyIntentResult } from "@/src/modules/adoption/application/apply-intent/types";
import {
  startApplyIntentAction as _startApplyIntentAction,
  startApplyIntentFormAction as _startApplyIntentFormAction,
} from "@/src/modules/adoption/application/apply-intent/start-apply-intent";
import { dismissApplyIntentAction as _dismissApplyIntentAction } from "@/src/modules/adoption/application/apply-intent/dismiss-apply-intent";

export type { StartApplyIntentResult };

export async function startApplyIntentAction(petToken: string): Promise<StartApplyIntentResult> {
  return _startApplyIntentAction(petToken);
}

export async function startApplyIntentFormAction(
  _prevState: StartApplyIntentResult | null,
  formData: FormData,
): Promise<StartApplyIntentResult> {
  return _startApplyIntentFormAction(_prevState, formData);
}

export async function dismissApplyIntentAction(): Promise<void> {
  return _dismissApplyIntentAction();
}
