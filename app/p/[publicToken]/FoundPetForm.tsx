"use client";

import { type PublicActionState, notifyOwnerOfFoundPetAction } from "@/app/actions/public";
import { useActionState } from "react";

const initialState: PublicActionState = { ok: false, error: null };

export function FoundPetForm({ publicToken }: { publicToken: string }) {
  const boundAction = notifyOwnerOfFoundPetAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-900 dark:text-emerald-200">
        <p className="font-medium">¡Gracias!</p>
        <p className="mt-1 text-xs">
          Le avisamos al dueño. Mientras tanto, cuidala lo mejor que puedas.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent";

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor="finderName"
          className="block text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          Tu nombre<span className="text-red-500 ml-0.5">*</span>
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
        <label
          htmlFor="finderContact"
          className="block text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          Cómo te contactamos<span className="text-red-500 ml-0.5">*</span>
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
        <label
          htmlFor="message"
          className="block text-xs font-medium text-amber-900 dark:text-amber-200"
        >
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
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Avisar al dueño"}
      </button>
    </form>
  );
}
