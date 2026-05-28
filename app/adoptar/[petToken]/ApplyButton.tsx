"use client";

import { useState, useTransition } from "react";

import { startApplyIntentAction } from "@/app/actions/apply-intent";

// Client-side CTA wrapper. Server action either redirects (authed → form,
// anon → signup) or returns `{ error }` (pet no longer listable, or
// institutional account). On error we render the message in-place so the
// visitor doesn't lose context.
//
// Sprint 6 PR-054: also render a mobile-only sticky version of the CTA at
// the viewport bottom so visitors don't have to scroll back up after reading
// the full pet story. The inline button stays in place on desktop where the
// CTA is already in-view.

export function ApplyButton({ petToken, petName }: { petToken: string; petName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await startApplyIntentAction(petToken);
      if (result && "error" in result) setError(result.error);
    });
  }

  const buttonLabel = pending ? "Procesando..." : `Postularme para adoptar a ${petName}`;

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="block w-full text-center px-6 py-4 rounded-lg bg-gob-success text-white text-lg font-semibold hover:bg-gob-success transition-colors disabled:opacity-60"
        >
          {buttonLabel}
        </button>
        {error && <output className="block text-sm text-gob-danger text-center">{error}</output>}
      </div>

      {/* Mobile-only sticky CTA at the viewport bottom. Hidden on desktop
          where the inline button above is already in view. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-gob-border  ">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="block w-full text-center px-5 py-3 rounded-xl bg-gob-success text-white text-base font-semibold hover:bg-gob-success transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-success focus-visible:ring-offset-2"
        >
          {pending ? "Procesando..." : `Postularme a ${petName}`}
        </button>
      </div>
    </>
  );
}
