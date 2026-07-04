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
//   useActionRedirect(state.redirectTo);

import { useEffect } from "react";

import { navigateAfterActionSuccess } from "./full-page-action-nav";

export function useActionRedirect(redirectTo: string | null | undefined): void {
  useEffect(() => {
    if (redirectTo) navigateAfterActionSuccess(redirectTo);
  }, [redirectTo]);
}
