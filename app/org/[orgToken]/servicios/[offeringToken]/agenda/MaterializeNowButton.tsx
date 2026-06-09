"use client";

// "Materializar ahora" button — org agenda page (Fase 3).
//
// Calls materializeOfferingNowAction(offeringToken) and shows a result toast.
// This is a thin client wrapper; the real work happens in the server action.

import { useState, useTransition } from "react";

import type { MaterializeNowResult } from "@/app/actions/slot-materialization";

type Props = {
  offeringToken: string;
  materializeAction: (token: string) => Promise<MaterializeNowResult>;
};

export function MaterializeNowButton({ offeringToken, materializeAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await materializeAction(offeringToken);
      if ("error" in result) {
        setMessage({ text: result.error, ok: false });
      } else {
        const { rulesProcessed, slotsInserted } = result;
        setMessage({
          text: `Listo. Reglas procesadas: ${rulesProcessed}. Turnos nuevos: ${slotsInserted}.`,
          ok: true,
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-1.5 text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
      >
        {isPending ? "Materializando…" : "Materializar ahora"}
      </button>
      {message && (
        <p className={`text-[12px] ${message.ok ? "text-ln-op-ok" : "text-ln-op-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
