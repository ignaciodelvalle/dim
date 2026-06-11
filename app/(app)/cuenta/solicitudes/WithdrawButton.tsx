"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withdrawApprovalRequestAction } from "@/app/actions/approval-requests";

type Props = {
  requestId: string;
};

export function WithdrawButton({ requestId }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawApprovalRequestAction(requestId);
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
        className="inline-flex items-center px-3 py-1.5 rounded-[3px] border border-[var(--color-ln-line-strong)] text-xs font-medium text-[var(--color-ln-ink-2)] bg-[var(--color-ln-card)] hover:bg-[var(--color-ln-stripe)] transition-colors"
      >
        Retirar solicitud
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-[6px]">
      <p className="m-0 text-right text-xs text-[var(--color-ln-mute)]">
        ¿Seguro que querés retirar esta solicitud?
      </p>
      {error && (
        <p role="alert" className="m-0 text-right text-xs text-[var(--color-ln-err)]">
          {error}
        </p>
      )}
      <div className="flex gap-[6px]">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="rounded-[3px] bg-[var(--color-ln-seal)] px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Retirando…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[3px] border border-[var(--color-ln-line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
