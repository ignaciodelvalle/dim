"use client";

// useActionRedirect — client half of the `redirectTo` post-action navigation
// contract (nav burn-down N3, 2026-07-04).
//
// WHY: server actions in this codebase no longer call next/navigation's
// redirect() on success. Next.js 15.5.x's App Router has a production-mode
// defect where the action's redirect response resolves correctly (the
// mutation commits, the RSC fetch completes with `x-action-redirect`) but
// the client router silently drops the transition — no pushState, no
// re-render, no error (engram #621/#622; verify-report #650 WARNING-1; see
// lib/ui/full-page-action-nav.ts for the full mechanism). Actions instead
// RETURN a form state carrying `redirectTo`, and the calling form mounts
// this hook to perform a full document navigation — the one mechanism
// proven immune to the drop.
//
// Usage (with useActionState):
//   const [state, formAction, isPending] = useActionState(action, initial);
//   useActionRedirect(state.redirectTo, state);
//
// `fireKey` (pass the WHOLE action state) exists because keying the effect on
// the redirect STRING alone silently no-ops when two submissions in one
// mounted document resolve to the identical destination — e.g. a vet
// re-entering the same DIM code after a bfcache back-restore (cursor citizen
// UX C1, verified 2026-07-24): deps unchanged → no navigation, no error, no
// feedback. Each submission returns a NEW state object, so keying on result
// identity re-fires the redirect every time the action succeeds.

import { useEffect } from "react";

import { navigateAfterActionSuccess } from "./full-page-action-nav";

export function useActionRedirect(redirectTo: string | null | undefined, fireKey?: unknown): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies(fireKey): fireKey is a DELIBERATE extra dependency — it is not read inside the effect; its only job is re-firing the redirect when a new submission resolves to the identical destination string (see module comment).
  useEffect(() => {
    if (redirectTo) navigateAfterActionSuccess(redirectTo);
  }, [redirectTo, fireKey]);
}
