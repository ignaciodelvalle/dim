"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withdrawDisputeAction } from "@/app/actions/custody-disputes";

export function WithdrawDisputeButton({ disputeToken }: { disputeToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawDisputeAction({
        disputeToken,
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-[6px] text-[13px] border border-ln-op-danger text-ln-op-danger hover:bg-ln-op-danger-bg transition-colors"
      >
        Retirar disputa
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-ln-op-danger p-4">
      <p className="text-[13px] font-medium text-ln-op-danger">Retirar disputa</p>
      <p className="text-[12px] text-ln-op-mute">
        Esto cierra la disputa sin resolución y desbloquea la mascota para transferencias.
      </p>
      <div>
        <label htmlFor="withdraw-reason" className="block text-[12px] text-ln-op-mute mb-1">
          Motivo del retiro (opcional)
        </label>
        <textarea
          id="withdraw-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Motivo (opcional)."
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-danger"
        />
      </div>

      {error && <output className="block text-[13px] text-ln-op-danger">{error}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 rounded-[6px] bg-ln-op-danger text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? "Retirando..." : "Confirmar retiro"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="px-3 py-2 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
