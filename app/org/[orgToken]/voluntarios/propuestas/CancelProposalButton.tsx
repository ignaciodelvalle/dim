"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelFosterProposalAction } from "@/app/actions/foster-proposals";

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
        className="px-3 py-1 rounded-lg border border-gob-danger text-gob-danger   text-xs hover:bg-gob-danger/10  disabled:opacity-50"
      >
        {pending ? "Cancelando..." : "Cancelar"}
      </button>
      {error && <output className="block text-xs text-gob-danger mt-1">{error}</output>}
    </div>
  );
}
