"use client";

import { type PublicActionState, notifyOwnerOfFoundPetAction } from "@/app/actions/public";
import { useActionState } from "react";

const initialState: PublicActionState = { ok: false, error: null };

export function FoundPetForm({ publicToken }: { publicToken: string }) {
  const boundAction = notifyOwnerOfFoundPetAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-ln-ok bg-ln-ok/10 p-4 text-sm text-ln-ok">
        <p className="font-medium">¡Gracias!</p>
        <p className="mt-1 text-xs">
          Le avisamos al dueño. Mientras tanto, cuidala lo mejor que puedas.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-ln-warn bg-ln-card text-ln-ink text-sm focus:outline-none focus:ring-2 focus:ring-ln-warn focus:border-transparent";

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="finderName" className="block text-xs font-medium text-ln-warn">
          Tu nombre<span className="text-ln-err ml-0.5">*</span>
        </label>
        <input
          id="finderName"
          name="finderName"
          type="text"
          required
          placeholder="Nombre y apellido"
          className={inputClass}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="finderContact" className="block text-xs font-medium text-ln-warn">
          Cómo te contactamos<span className="text-ln-err ml-0.5">*</span>
        </label>
        <input
          id="finderContact"
          name="finderContact"
          type="text"
          required
          placeholder="Teléfono o email"
          className={inputClass}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="message" className="block text-xs font-medium text-ln-warn">
          Mensaje (opcional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="¿Dónde la encontraste? ¿Cómo está?"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="text-xs text-ln-err" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 rounded-lg bg-ln-warn text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño"}
      </button>
    </form>
  );
}
