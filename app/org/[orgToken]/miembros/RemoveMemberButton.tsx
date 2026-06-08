"use client";

// RemoveMemberButton — confirms and calls removeMemberAction for a member row.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeMemberAction } from "@/src/modules/organizations/actions";

type Props = {
  organizationId: string;
  membershipId: string;
  displayName: string;
};

export function RemoveMemberButton({ organizationId, membershipId, displayName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction({ organizationId, membershipId });
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
        className="rounded-full border border-gob-danger px-3 py-1 text-xs font-medium text-gob-danger transition-colors hover:bg-gob-danger hover:text-white"
      >
        Quitar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-gob-text-muted">
        ¿Quitar a <strong>{displayName}</strong> de la organización?
      </p>
      {error && (
        <p className="text-xs text-gob-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending}
          className="rounded-full bg-gob-danger px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gob-danger disabled:opacity-60"
        >
          {pending ? "Quitando..." : "Confirmar"}
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
