"use client";

// CloseRabiesObservationButton — "Confirmar fin de observación" CTA from the
// RabiesObservationBanner (10-day post-bite rabies watch).
//
// RA-2 F3. The banner used to call ownerCloseRabiesObservationAction from an
// inline server action inside <form action={…}> and DISCARD its return value.
// That action's most important answer is a refusal:
//
//   "Hubo síntomas compatibles con rabia durante la observación. Este cierre
//    requiere intervención profesional (veterinario o autoridad sanitaria).
//    Contactá a tu vet."
//
// (owner-close-observation.ts, the escalating-symptom leg). It is the one
// message that tells an owner their animal may be rabid, and the UI dropped it
// on the floor — the button simply appeared to do nothing, so the owner is left
// believing the observation is closed. Every refusal leg is surfaced here: the
// premature close ("aún no se cumplieron los 10 días"), the internal
// inconsistency legs and the transaction failure, not just the rabies one.
//
// On success the action revalidates the pet profile, but router-level
// transitions are known to be dropped in this app (see
// lib/ui/full-page-action-nav.ts), and "did the observation actually close?" is
// not a question to leave ambiguous on a rabies surface. So success does one
// full document navigation and the owner sees the banner gone, or not at all.

import { useState, useTransition } from "react";

import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

type Props = {
  petPublicToken: string;
};

export function CloseRabiesObservationButton({ petPublicToken }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      setError(null);
      const { ownerCloseRabiesObservationAction } = await import(
        "@/src/modules/surveillance/actions"
      );
      const result = await ownerCloseRabiesObservationAction(petPublicToken);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      navigateAfterActionSuccess(`/mis-mascotas/${petPublicToken}`);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-white px-3 py-1.5 font-ln-sans text-md font-medium text-[var(--color-ln-warn)] transition-opacity hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Cerrando…" : "Confirmar fin de observación"}
      </button>
      {error && (
        <p role="alert" className="text-md font-medium text-[var(--color-ln-err)]">
          {error}
        </p>
      )}
    </div>
  );
}
