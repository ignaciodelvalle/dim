"use client";

// "Materializar ahora" button — /pro agenda page (Fase 3).
//
// Identical to the org-side variant. Extracted into each route folder so each
// page can pass its own server action binding without a shared module coupling.

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
        className="inline-flex items-center gap-2 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {isPending ? "Materializando…" : "Materializar ahora"}
      </button>
      {message && (
        <p
          className={`text-xs ${
            message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
