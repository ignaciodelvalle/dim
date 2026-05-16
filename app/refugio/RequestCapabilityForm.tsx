"use client";

import { type CapabilityActionState, requestCapabilityAction } from "@/app/actions/capabilities";
import { useActionState, useState } from "react";

const initialState: CapabilityActionState = { error: null };

export function RequestCapabilityForm({
  capability,
  label,
}: {
  capability: string;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(requestCapabilityAction, initialState);
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        Solicitar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 w-full">
      <input type="hidden" name="capability" value={capability} />
      <textarea
        name="reason"
        rows={2}
        maxLength={500}
        placeholder={`¿Por qué necesitás "${label}"? (opcional)`}
        className="text-xs w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-2 py-1 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar pedido"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs px-2 py-1 rounded text-neutral-600 dark:text-neutral-400 hover:underline"
        >
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.ok && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Solicitud enviada. Te avisamos cuando alguien decida.
        </p>
      )}
    </form>
  );
}
