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

export function ApplyButton({
  petToken,
  petName,
  isAuthenticated = true,
}: {
  petToken: string;
  petName: string;
  /** Pass false for anonymous visitors so the CTA copy reflects the auth gate. */
  isAuthenticated?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await startApplyIntentAction(petToken);
      if (result && "error" in result) setError(result.error);
    });
  }

  const buttonLabel = pending
    ? "Procesando..."
    : isAuthenticated
      ? `Postular para adoptar a ${petName}`
      : "Iniciá sesión para postular";

  return (
    <>
      {/* Inline CTA — visible on all viewports */}
      <div
        className="rounded-[6px] border px-[24px] py-[20px] space-y-[10px]"
        style={{
          background: "var(--color-ln-card)",
          borderColor: "var(--color-ln-line-strong)",
        }}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="flex w-full items-center justify-center gap-[8px] rounded-[6px] border-0 px-[16px] py-[13px] text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--color-ln-azul)" }}
        >
          {buttonLabel}
        </button>
        <p className="text-center text-[11px]" style={{ color: "var(--color-ln-mute)" }}>
          El refugio responde en aproximadamente 5 días.
        </p>
        {error && (
          <output
            className="block text-center text-[13px]"
            style={{ color: "var(--color-ln-err)" }}
          >
            {error}
          </output>
        )}
      </div>

      {/* Mobile-only sticky CTA at the viewport bottom. Hidden on desktop
          where the inline button above is already in view. */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-30 px-[16px] pt-[12px] pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t"
        style={{
          background: "rgba(251,250,245,.95)",
          backdropFilter: "blur(6px)",
          borderColor: "var(--color-ln-line)",
        }}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="block w-full rounded-[6px] border-0 px-[16px] py-[13px] text-[14px] font-semibold text-white transition-opacity disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ background: "var(--color-ln-azul)" }}
        >
          {pending
            ? "Procesando..."
            : isAuthenticated
              ? `Postularme a ${petName}`
              : "Iniciá sesión para postular"}
        </button>
      </div>
    </>
  );
}
