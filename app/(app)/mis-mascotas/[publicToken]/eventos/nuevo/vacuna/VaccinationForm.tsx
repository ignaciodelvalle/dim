"use client";

import type { EventFormState } from "@/app/actions/events";
import { Field, Input, Textarea } from "@/components/poncho";
import { findVaccineByName, vaccinesForSpecies } from "@/lib/lookups";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useMemo, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

import { useActionState } from "react";

export function VaccinationForm({
  action,
  species,
  initialVaccineName,
  sourceReminderId,
  defaults,
}: {
  action: FormAction;
  species: string;
  initialVaccineName?: string;
  sourceReminderId?: string;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const vaccines = vaccinesForSpecies(species);
  const today = new Date().toISOString().slice(0, 10);

  const [vaccineName, setVaccineName] = useState(initialVaccineName ?? "");
  const [nextDueAt, setNextDueAt] = useState("");
  const [nextDueOverridden, setNextDueOverridden] = useState(false);

  const suggestedNextDue = useMemo(() => {
    const def = findVaccineByName(vaccineName);
    if (!def || !def.intervalMonths) return "";
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + def.intervalMonths);
    return d.toISOString().slice(0, 10);
  }, [vaccineName]);

  const effectiveNextDue = nextDueOverridden ? nextDueAt : suggestedNextDue || nextDueAt;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      {sourceReminderId && <input type="hidden" name="sourceReminderId" value={sourceReminderId} />}

      <Field label="Vacuna" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="vaccineName"
            type="text"
            required
            list="vaccine-options"
            placeholder="Empezá a tipear o elegí…"
            autoComplete="off"
            value={vaccineName}
            onChange={(e) => setVaccineName(e.target.value)}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <datalist id="vaccine-options">
        {vaccines.map((v) => (
          <option key={v.name} value={v.name} />
        ))}
      </datalist>

      <Field label="Fecha de aplicación" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="occurredAt"
            type="date"
            required
            defaultValue={defaults?.occurredAt ?? today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Marca / laboratorio">
        {({ id, describedBy }) => (
          <Input id={id} name="brand" type="text" aria-describedby={describedBy} />
        )}
      </Field>

      <Field label="Lote">
        {({ id, describedBy }) => (
          <Input id={id} name="batch" type="text" aria-describedby={describedBy} />
        )}
      </Field>

      <Field label="Aplicada por (vet / clínica)">
        {({ id, describedBy }) => (
          <Input id={id} name="administeredBy" type="text" aria-describedby={describedBy} />
        )}
      </Field>

      <Field
        label="Próxima dosis (opcional — crea recordatorio)"
        optional={false}
        help={
          !nextDueOverridden && suggestedNextDue
            ? "Sugerencia automática según el catálogo. Editá libremente si corresponde."
            : undefined
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="nextDueAt"
            type="date"
            value={effectiveNextDue}
            onChange={(e) => {
              setNextDueOverridden(true);
              setNextDueAt(e.target.value);
            }}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field label="Notas">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            defaultValue={defaults?.notes ?? ""}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <AttachmentField />

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
        {isPending ? "Guardando..." : "Registrar vacuna"}
      </button>
    </form>
  );
}
