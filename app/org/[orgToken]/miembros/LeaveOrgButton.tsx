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
        className="rounded-full border border-gob-border px-3 py-1 text-xs font-medium text-gob-text-muted opacity-50 cursor-not-allowed"
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
        className="rounded-full border border-gob-border-strong px-3 py-1 text-xs font-medium text-gob-text transition-colors hover:bg-gob-surface-alt"
      >
        Salir de la organización
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-gob-text-muted">¿Confirmar que querés salir de la organización?</p>
      {error && (
        <p className="text-xs text-gob-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLeave}
          disabled={pending}
          className="rounded-full bg-gob-danger px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gob-danger disabled:opacity-60"
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
          className="rounded-full border border-gob-border-strong px-3 py-1 text-xs font-medium text-gob-text transition-colors hover:bg-gob-surface-alt disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
