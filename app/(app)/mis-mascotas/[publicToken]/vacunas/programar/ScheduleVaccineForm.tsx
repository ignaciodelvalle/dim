"use client";

import type { ReminderFormState } from "@/app/actions/reminders";
import { vaccinesForSpecies } from "@/lib/lookups";
import { useActionState } from "react";

const initialState: ReminderFormState = { error: null };

type FormAction = (prev: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;

export function ScheduleVaccineForm({
  action,
  species,
}: {
  action: FormAction;
  species: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const vaccines = vaccinesForSpecies(species);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="vaccineName"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Vacuna<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="vaccineName"
          name="vaccineName"
          type="text"
          required
          list="schedule-vaccine-options"
          placeholder="Empezá a tipear o elegí…"
          autoComplete="off"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <datalist id="schedule-vaccine-options">
          {vaccines.map((v) => (
            <option key={v.name} value={v.name} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="dueAt"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Fecha estimada<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="dueAt"
          name="dueAt"
          type="date"
          required
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Notas
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Cualquier detalle (clínica habitual, dosis, etc.)"
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
        {isPending ? "Guardando..." : "Programar vacuna"}
      </button>
    </form>
  );
}
