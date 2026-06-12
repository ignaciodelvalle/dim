"use client";

// WithdrawApplicationButton — applicant retracts a still-pending adoption
// application. Inline 2-step confirm (same pattern as LeaveMembershipButton);
// router.refresh() on success so the row re-derives out of "pending".

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withdrawAdoptionApplicationAction } from "@/src/modules/adoption/actions";

type Props = {
  applicationEventId: string;
};

export function WithdrawApplicationButton({ applicationEventId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawAdoptionApplicationAction({ applicationEventId });
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-medium text-[var(--color-ln-err)] transition-colors hover:bg-[var(--color-ln-stripe)]"
      >
        Retirar postulación
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-[6px]">
      <p className="m-0 text-[11.5px] text-[var(--color-ln-mute)]">
        ¿Confirmás que querés retirar esta postulación? No se puede deshacer.
      </p>
      {error && (
        <p className="m-0 text-[11.5px] text-[var(--color-ln-err)]" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-[6px]">
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={pending}
          className="rounded-[3px] bg-[var(--color-ln-err)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Retirando..." : "Sí, retirar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[3px] border border-[var(--color-ln-line-strong)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-medium text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
