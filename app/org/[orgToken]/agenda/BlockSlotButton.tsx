"use client";

// BlockSlotButton — confirms and triggers slot blocking for org agenda.
// Only rendered for slots with bookingsCount === 0 and status "open".

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { blockSlotAction } from "@/app/actions/slot-materialization";

type Props = {
  orgToken: string;
  slotId: string;
};

export function BlockSlotButton({ orgToken, slotId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleBlock() {
    setError(null);
    startTransition(async () => {
      const result = await blockSlotAction({ orgToken, slotId });
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-sm font-medium text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
      >
        Bloquear
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ln-op-mute">¿Bloquear este cupo? Nadie va a poder reservarlo.</p>
      {error && (
        <p className="text-sm text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleBlock}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-danger px-3 py-[5px] text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Bloqueando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-sm font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
