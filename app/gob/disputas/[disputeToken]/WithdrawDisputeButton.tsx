"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withdrawDisputeAction } from "@/app/actions/custody-disputes";

export function WithdrawDisputeButton({ disputeToken }: { disputeToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const reason = prompt(
      "Motivo del retiro (opcional). Esto cierra la disputa sin resolucion y desbloquea la mascota.",
    );
    if (reason === null) return;
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

  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="px-3 py-1.5 rounded-[6px] text-[13px] border border-ln-op-danger text-ln-op-danger hover:bg-ln-op-danger-bg disabled:opacity-50 transition-colors"
      >
        {pending ? "Retirando..." : "Retirar disputa"}
      </button>
      {error && <output className="block text-[13px] text-ln-op-danger mt-2">{error}</output>}
    </div>
  );
}
