"use client";

import type { SymptomFormState } from "@/app/actions/events";
import { useActionState } from "react";

const initialState: SymptomFormState = { error: null };

type FormAction = (prev: SymptomFormState, formData: FormData) => Promise<SymptomFormState>;

export function SymptomForm({
  action,
  petName,
}: {
  action: FormAction;
  petName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="freeText"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          ¿Qué estás viendo?<span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="freeText"
          name="freeText"
          required
          rows={5}
          placeholder={`Ej: hace dos días que ${petName} vomita y está decaída. Hoy no quiso comer.`}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="severity"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          ¿Cuán grave te parece?
        </label>
        <select
          id="severity"
          name="severity"
          defaultValue=""
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        >
          <option value="">No sé / prefiero no decir</option>
          <option value="mild">Leve</option>
          <option value="moderate">Moderado</option>
          <option value="severe">Grave</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="onsetAt"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          ¿Desde cuándo notás esto?
        </label>
        <input
          id="onsetAt"
          name="onsetAt"
          type="date"
          max={today}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar en la libreta"}
      </button>

      <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
        Si los síntomas persisten o empeoran, consultá al veterinario.
      </p>
    </form>
  );
}
