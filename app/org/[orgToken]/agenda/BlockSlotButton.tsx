"use client";

// BlockSlotButton — confirms and triggers slot blocking for org agenda.
// Only rendered for slots with bookingsCount === 0 and status "open".

import { useState, useTransition } from "react";

import { blockSlotAction } from "@/app/actions/slot-materialization";

type Props = {
  orgToken: string;
  slotId: string;
};

export function BlockSlotButton({ orgToken, slotId }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Tier B optimistic state: the cell flips to "Bloqueado" immediately and
  // reverts on error. No router.refresh() (banned — silent-drop defect, see
  // lib/ui/full-page-action-nav.ts); the SSR row status re-derives on the
  // next visit.
  const [blocked, setBlocked] = useState(false);

  function handleBlock() {
    setError(null);
    setConfirming(false);
    setBlocked(true);
    startTransition(async () => {
      const result = await blockSlotAction({ orgToken, slotId });
      if ("error" in result) {
        setBlocked(false);
        setError(result.error);
      }
    });
  }

  if (blocked) {
    return (
      <span className="inline-flex items-center rounded-[4px] border border-ln-op-line bg-ln-op-stripe px-3 py-[5px] text-sm font-medium text-ln-op-mute">
        Bloqueado
      </span>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-sm font-medium text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
        >
          Bloquear
        </button>
        {error && (
          <p className="text-sm text-ln-op-danger" role="alert">
            {error}
          </p>
        )}
      </div>
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
