"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelFosterProposalAction } from "@/src/modules/foster/actions";

export function CancelProposalButton({ proposalPublicToken }: { proposalPublicToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelFosterProposalAction({
        proposalPublicToken,
        cancellationReason: "org_cancelled",
      });
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
      <div className="text-right">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="rounded-[4px] border border-ln-op-danger px-3 py-[5px] text-[12px] text-ln-op-danger transition-colors hover:bg-ln-op-danger-bg disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-[12px] text-ln-op-ink-2">El voluntario va a recibir aviso.</p>
      {error && (
        <output role="alert" className="text-[12px] text-ln-op-danger">
          {error}
        </output>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-danger px-3 py-[5px] text-[12px] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? "Cancelando..." : "Confirmar cancelación"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50 transition-colors"
        >
          No, volver
        </button>
      </div>
    </div>
  );
}
