"use client";

import { useState, useTransition } from "react";

import { startApplyIntentAction } from "@/app/actions/apply-intent";

// Client-side CTA wrapper. Server action either redirects (authed → form,
// anon → signup) or returns `{ error }` (pet no longer listable, or
// institutional account). On error we render the message in-place so the
// visitor doesn't lose context.

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

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="block w-full text-center px-6 py-4 rounded-lg bg-emerald-600 text-white text-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
      >
        {pending ? "Procesando..." : `Postularme para adoptar a ${petName}`}
      </button>
      {error && <output className="block text-sm text-gob-danger text-center">{error}</output>}
    </div>
  );
}
