"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
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

      <div className="space-y-1.5">
        <label htmlFor="vaccineName" className={labelClass}>
          Vacuna<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="vaccineName"
          name="vaccineName"
          type="text"
          required
          list="vaccine-options"
          placeholder="Empezá a tipear o elegí…"
          autoComplete="off"
          value={vaccineName}
          onChange={(e) => setVaccineName(e.target.value)}
          className={inputClass}
        />
        <datalist id="vaccine-options">
          {vaccines.map((v) => (
            <option key={v.name} value={v.name} />
          ))}
        </datalist>
      </div>

      <Field
        id="occurredAt"
        name="occurredAt"
        type="date"
        label="Fecha de aplicación"
        required
        defaultValue={defaults?.occurredAt ?? today}
      />

      <Field id="brand" name="brand" type="text" label="Marca / laboratorio" />

      <Field id="batch" name="batch" type="text" label="Lote" />

      <Field
        id="administeredBy"
        name="administeredBy"
        type="text"
        label="Aplicada por (vet / clínica)"
      />

      <div className="space-y-1.5">
        <label htmlFor="nextDueAt" className={labelClass}>
          Próxima dosis (opcional — crea recordatorio)
        </label>
        <input
          id="nextDueAt"
          name="nextDueAt"
          type="date"
          value={effectiveNextDue}
          onChange={(e) => {
            setNextDueOverridden(true);
            setNextDueAt(e.target.value);
          }}
          className={inputClass}
        />
        {!nextDueOverridden && suggestedNextDue && (
          <p className="text-xs text-gob-text-muted ">
            Sugerencia automática según el catálogo. Editá libremente si corresponde.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ""}
          className={inputClass}
        />
      </div>

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

function Field({
  id,
  name,
  type,
  label,
  required,
  defaultValue,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-gob-danger ml-0.5">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={inputClass}
      />
    </div>
  );
}
