"use client";

import {
  type CapabilityActionState,
  requestCapabilityAction,
} from "@/src/modules/organizations/actions";
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
        className="text-[12px] px-2 py-1 rounded-[4px] border border-ln-op-line text-ln-op-azul hover:bg-ln-op-stripe transition-colors"
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
        className="text-[12px] w-full rounded-[4px] border border-ln-op-line bg-ln-op-card p-2 text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="text-[12px] px-2 py-1 rounded-[4px] bg-ln-op-azul text-white disabled:opacity-50 transition-colors"
        >
          {isPending ? "Enviando…" : "Enviar pedido"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[12px] px-2 py-1 rounded-[4px] text-ln-op-mute hover:underline"
        >
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-[12px] text-ln-op-danger">{state.error}</p>}
      {state.ok && (
        <p className="text-[12px] text-ln-op-ok">
          Solicitud enviada. Te avisamos cuando alguien decida.
        </p>
      )}
    </form>
  );
}
