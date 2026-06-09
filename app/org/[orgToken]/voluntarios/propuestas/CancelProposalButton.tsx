"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelFosterProposalAction } from "@/src/modules/foster/actions";

export function CancelProposalButton({ proposalPublicToken }: { proposalPublicToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!confirm("¿Cancelar la propuesta? El voluntario va a recibir aviso.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelFosterProposalAction({
        proposalPublicToken,
        cancellationReason: "org_cancelled",
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="rounded-[4px] border border-ln-op-danger px-3 py-[5px] text-[12px] text-ln-op-danger transition-colors hover:bg-ln-op-danger-bg disabled:opacity-50"
      >
        {pending ? "Cancelando..." : "Cancelar"}
      </button>
      {error && <output className="mt-1 block text-[12px] text-ln-op-danger">{error}</output>}
    </div>
  );
}
