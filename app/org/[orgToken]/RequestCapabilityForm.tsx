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
        className="text-xs px-2 py-1 rounded border border-gob-border-strong hover:bg-gob-surface-alt"
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
        className="text-xs w-full rounded border border-gob-border-strong bg-white p-2"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-2 py-1 rounded bg-gob-primary text-white disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar pedido"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs px-2 py-1 rounded text-gob-text-gray hover:underline"
        >
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-xs text-gob-danger">{state.error}</p>}
      {state.ok && (
        <p className="text-xs text-gob-success">
          Solicitud enviada. Te avisamos cuando alguien decida.
        </p>
      )}
    </form>
  );
}
