"use client";

import type { ReminderFormState } from "@/app/actions/reminders";
import { Field, Input, Textarea } from "@/components/poncho";
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
      <Field label="Vacuna" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="vaccineName"
            type="text"
            required
            list="schedule-vaccine-options"
            placeholder="Empezá a tipear o elegí…"
            autoComplete="off"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <datalist id="schedule-vaccine-options">
        {vaccines.map((v) => (
          <option key={v.name} value={v.name} />
        ))}
      </datalist>

      <Field label="Fecha estimada" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="dueAt"
            type="date"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Notas">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="description"
            rows={3}
            placeholder="Cualquier detalle (clínica habitual, dosis, etc.)"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

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
