"use client";

import type { ReminderFormState } from "@/app/actions/reminders";
import { LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { vaccinesForSpecies } from "@/lib/lookups";
import { useActionState, useState } from "react";

const initialState: ReminderFormState = { error: null };

type FormAction = (prev: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;

/** ISO date string (YYYY-MM-DD) from today + N months. */
function isoDateFromNowPlusMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function ScheduleVaccineForm({
  action,
  species,
}: {
  action: FormAction;
  species: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const vaccines = vaccinesForSpecies(species);
  const [suggestedDate, setSuggestedDate] = useState<string>("");
  const [dateValue, setDateValue] = useState<string>("");

  function handleVaccineChange(name: string) {
    const def = vaccines.find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
    if (def?.intervalMonths) {
      const suggested = isoDateFromNowPlusMonths(def.intervalMonths);
      setSuggestedDate(suggested);
      // Pre-fill the date only if the user hasn't already entered one.
      setDateValue((prev) => (prev ? prev : suggested));
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <LnField label="Vacuna" required>
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="vaccineName"
            type="text"
            required
            list="schedule-vaccine-options"
            placeholder="Empezá a tipear o elegí…"
            autoComplete="off"
            aria-describedby={describedBy}
            invalid={invalid}
            onChange={(e) => handleVaccineChange(e.target.value)}
          />
        )}
      </LnField>
      <datalist id="schedule-vaccine-options">
        {vaccines.map((v) => (
          <option key={v.name} value={v.name} />
        ))}
      </datalist>

      <LnField
        label="Fecha estimada"
        required
        hint={
          suggestedDate
            ? "Fecha sugerida según el intervalo de la vacuna. Podés ajustarla."
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="dueAt"
            type="date"
            required
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Notas">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="description"
            rows={3}
            placeholder="Cualquier detalle (clínica habitual, dosis, etc.)"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {state.error && (
        <p className="text-sm text-[var(--color-ln-err)]" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Programar vacuna"}
      </button>
    </form>
  );
}
