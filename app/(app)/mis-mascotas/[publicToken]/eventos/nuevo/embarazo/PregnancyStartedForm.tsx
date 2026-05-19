"use client";

import { useActionState } from "react";

import type { PregnancyFormState } from "@/app/actions/pregnancy";

const initialState: PregnancyFormState = { error: null };

type FormAction = (prev: PregnancyFormState, formData: FormData) => Promise<PregnancyFormState>;

export function PregnancyStartedForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

  return (
    <form action={formAction} className="space-y-5">
      <p className="text-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
        Esta acción dispara recordatorios automáticos de controles veterinarios cada dos semanas.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha estimada de inicio<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="weeksAtDiagnosis" className={labelClass}>
          Semanas estimadas al diagnóstico
        </label>
        <input
          id="weeksAtDiagnosis"
          name="weeksAtDiagnosis"
          type="number"
          min={0}
          max={12}
          placeholder="0–12 (opcional)"
          className={inputClass}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Si tu vet te dio una estimación, ingresala. Sino dejalo vacío.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="vetConsulted" className={labelClass}>
          Veterinario consultado
        </label>
        <input
          id="vetConsulted"
          name="vetConsulted"
          type="text"
          placeholder="Dr. García · Clínica Veterinaria X"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas adicionales
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Detalles que quieras recordar…"
          className={inputClass}
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
        {isPending ? "Registrando…" : "Registrar embarazo"}
      </button>
    </form>
  );
}
