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
        className="rounded-[4px] border border-ln-op-danger px-3 py-[5px] text-[12px] font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger hover:text-white"
      >
        Quitar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] text-ln-op-mute">
        ¿Quitar a <strong>{displayName}</strong> de la organización?
      </p>
      {error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-danger px-3 py-[5px] text-[12px] font-medium text-white transition-colors disabled:opacity-60"
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
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
