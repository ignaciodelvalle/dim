"use client";

import type { ReminderFormState } from "@/app/actions/reminders";
import { inputClass, labelClass } from "@/lib/form-classes";
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
        <label htmlFor="vaccineName" className={labelClass}>
          Vacuna<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="vaccineName"
          name="vaccineName"
          type="text"
          required
          list="schedule-vaccine-options"
          placeholder="Empezá a tipear o elegí…"
          autoComplete="off"
          className={inputClass}
        />
        <datalist id="schedule-vaccine-options">
          {vaccines.map((v) => (
            <option key={v.name} value={v.name} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="dueAt" className={labelClass}>
          Fecha estimada<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input id="dueAt" name="dueAt" type="date" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className={labelClass}>
          Notas
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Cualquier detalle (clínica habitual, dosis, etc.)"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Programar vacuna"}
      </button>
    </form>
  );
}
