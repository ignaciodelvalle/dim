"use client";

import type { EventFormState } from "@/app/actions/events";
import { Field, Input, Select, Textarea } from "@/components/poncho";
import { type DrugDef, drugsForSpecies, findDrugByLabel } from "@/lib/drugs";
import { FREQUENCY_LABELS } from "@/lib/medication-schedule";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function MedicationStartForm({
  action,
  species,
  defaultNotes,
  defaultOccurredAt,
}: {
  action: FormAction;
  species: string | null | undefined;
  defaultNotes?: string;
  defaultOccurredAt?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();

  const now = new Date();
  // Default firstDoseAt to current local datetime rounded down to the minute.
  const localDatetime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const catalogDrugs = drugsForSpecies(species);
  const [matchedDrug, setMatchedDrug] = useState<DrugDef | null>(null);
  const [doseValue, setDoseValue] = useState("");
  const [frequency, setFrequency] = useState<string>(matchedDrug?.typicalFrequency ?? "");
  const [showCustomHours, setShowCustomHours] = useState(false);

  function handleDrugNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const found = findDrugByLabel(val);
    setMatchedDrug(found);
    if (found) {
      setDoseValue(found.typicalDose);
      setFrequency(found.typicalFrequency);
      setShowCustomHours(found.typicalFrequency === "custom");
    }
  }

  function handleFrequencyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setFrequency(val);
    setShowCustomHours(val === "custom");
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      {/* Drug name with datalist */}
      <Field
        label="Medicamento"
        required
        help={
          matchedDrug
            ? `Categoría: ${matchedDrug.category}${
                matchedDrug.brandNames?.length
                  ? ` · Marcas: ${matchedDrug.brandNames.join(", ")}`
                  : ""
              }`
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="drugName"
            type="text"
            list="drug-options"
            required
            placeholder="Amoxicilina, Metronidazol..."
            onChange={handleDrugNameChange}
            autoComplete="off"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <datalist id="drug-options">
        {catalogDrugs.map((d) => (
          <option key={d.code} value={d.label} />
        ))}
      </datalist>

      {/* Dose — pre-fills from catalog match */}
      <Field
        label="Dosis"
        required
        help={
          matchedDrug
            ? `Sugerencia basada en ${matchedDrug.label}. Ajustá según indicación veterinaria.`
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="dose"
            type="text"
            required
            value={doseValue}
            onChange={(e) => setDoseValue(e.target.value)}
            placeholder="10 mg/kg, 1 comprimido..."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {/* Frequency — structured select */}
      <Field label="Frecuencia" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="frequency"
            required
            value={frequency}
            onChange={handleFrequencyChange}
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">Seleccioná una frecuencia</option>
            {(Object.entries(FREQUENCY_LABELS) as [string, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* Custom hours — revealed when frequency === "custom" */}
      {showCustomHours && (
        <Field label="Cada cuántas horas" required help="Ingresá un valor entre 1 y 24 horas.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="customHours"
              type="number"
              min="1"
              max="24"
              required
              placeholder="Ej. 8"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      )}

      {/* First dose datetime */}
      <Field
        label="Primera dosis"
        required
        help="Desde este momento se van a generar los recordatorios de dosis."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="firstDoseAt"
            type="datetime-local"
            required
            defaultValue={localDatetime}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {/* Duration — optional */}
      <Field
        label="Duración del tratamiento (días)"
        help="Sin duración: vamos a generar recordatorios para los próximos 14 días. Cuando termine el tratamiento, marcalo como fin y cancelamos los pendientes."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="durationDays"
            type="number"
            min="1"
            max="90"
            placeholder="Ej. 7"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {/* Prescribed by */}
      <Field label="Prescripto por">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="prescribedBy"
            type="text"
            placeholder="Nombre del veterinario/a"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {/* Start date — "día de inicio" (may differ from firstDoseAt) */}
      <Field
        label="Día de inicio"
        required
        help="Fecha en que empezó el tratamiento (puede diferir de la primera dosis registrada)."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="occurredAt"
            type="date"
            required
            defaultValue={defaultOccurredAt ?? today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Notas">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            defaultValue={defaultNotes ?? ""}
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
        {isPending ? "Guardando..." : "Registrar inicio de medicación"}
      </button>
    </form>
  );
}
