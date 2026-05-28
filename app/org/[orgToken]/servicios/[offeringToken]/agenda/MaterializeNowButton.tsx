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
        className="inline-flex items-center gap-2 rounded border border-gob-border-strong bg-white px-3 py-1.5 text-sm font-medium text-gob-text-gray shadow-sm hover:bg-gob-surface-alt disabled:cursor-not-allowed disabled:opacity-60    "
      >
        {isPending ? "Materializando…" : "Materializar ahora"}
      </button>
      {message && (
        <p className={`text-xs ${message.ok ? "text-gob-success " : "text-gob-danger "}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
