"use client";

// ProposeReturnForm — submits the return-to-owner proposal via
// proposeReturnToOwnerFormAction. Renders success/error inline.

import { proposeReturnToOwnerFormAction } from "@/app/actions/return-to-owner-form";
import { useActionState } from "react";

export type ProposeReturnFormState = {
  error: string | null;
  success?: boolean;
};

const initialState: ProposeReturnFormState = { error: null };

export function ProposeReturnForm({
  orgToken,
  petPublicToken,
}: {
  orgToken: string;
  petPublicToken: string;
}) {
  const action = proposeReturnToOwnerFormAction.bind(null, orgToken, petPublicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);

  if (state.success) {
    return (
      <div className="rounded border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-gob-text text-sm">
        Propuesta enviada correctamente. El dueño recibio una notificación para confirmar la
        devolución.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="notes" className="block text-sm font-medium text-gob-text-gray">
          Notas para el dueño (opcional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          placeholder="Ej: El animal está en buen estado, coordinamos horario de búsqueda..."
          className="w-full rounded border border-gob-border-strong bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 resize-y"
        />
      </div>

      {state.error && (
        <p className="text-sm rounded border border-gob-danger/30 bg-gob-danger/10 px-3 py-2 text-gob-danger">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 items-center">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {isPending ? "Enviando…" : "Proponer devolución"}
        </button>
      </div>
    </form>
  );
}
