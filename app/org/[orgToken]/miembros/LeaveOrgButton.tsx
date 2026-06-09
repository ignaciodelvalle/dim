"use client";

// LeaveOrgButton — lets the current user leave the organization (self-leave path).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { leaveOrganizationAction } from "@/src/modules/organizations/actions";

type Props = {
  organizationId: string;
  isLastAdmin: boolean;
};

export function LeaveOrgButton({ organizationId, isLastAdmin }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const result = await leaveOrganizationAction({ organizationId });
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push("/");
    });
  }

  if (isLastAdmin) {
    return (
      <button
        type="button"
        disabled
        title="Sos el único administrador. Asigná otro administrador antes de salir."
        className="cursor-not-allowed rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-mute opacity-50"
      >
        Salir de la organización
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe"
      >
        Salir de la organización
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] text-ln-op-mute">¿Confirmar que querés salir de la organización?</p>
      {error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLeave}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-danger px-3 py-[5px] text-[12px] font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Saliendo..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
