"use client";

import type { EventFormState } from "@/app/actions/events";
import { type DrugDef, drugsForSpecies, findDrugByLabel } from "@/lib/drugs";
import { FREQUENCY_LABELS } from "@/lib/medication-schedule";
import { useActionState, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

const hintClass = "text-xs text-neutral-500 dark:text-neutral-500";

export function MedicationStartForm({
  action,
  species,
}: {
  action: FormAction;
  species: string | null | undefined;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

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
      {/* Drug name with datalist */}
      <div className="space-y-1.5">
        <label htmlFor="drugName" className={labelClass}>
          Medicamento<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="drugName"
          name="drugName"
          type="text"
          list="drug-options"
          required
          placeholder="Amoxicilina, Metronidazol..."
          className={inputClass}
          onChange={handleDrugNameChange}
          autoComplete="off"
        />
        <datalist id="drug-options">
          {catalogDrugs.map((d) => (
            <option key={d.code} value={d.label} />
          ))}
        </datalist>
        {matchedDrug && (
          <p className={hintClass}>
            Categoría: {matchedDrug.category}
            {matchedDrug.brandNames?.length
              ? ` · Marcas: ${matchedDrug.brandNames.join(", ")}`
              : ""}
          </p>
        )}
      </div>

      {/* Dose — pre-fills from catalog match */}
      <div className="space-y-1.5">
        <label htmlFor="dose" className={labelClass}>
          Dosis<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="dose"
          name="dose"
          type="text"
          required
          value={doseValue}
          onChange={(e) => setDoseValue(e.target.value)}
          placeholder="10 mg/kg, 1 comprimido..."
          className={inputClass}
        />
        {matchedDrug && (
          <p className={hintClass}>
            Sugerencia basada en {matchedDrug.label}. Ajustá según indicación veterinaria.
          </p>
        )}
      </div>

      {/* Frequency — structured select */}
      <div className="space-y-1.5">
        <label htmlFor="frequency" className={labelClass}>
          Frecuencia<span className="text-red-500 ml-0.5">*</span>
        </label>
        <select
          id="frequency"
          name="frequency"
          required
          value={frequency}
          onChange={handleFrequencyChange}
          className={inputClass}
        >
          <option value="">Seleccioná una frecuencia</option>
          {(Object.entries(FREQUENCY_LABELS) as [string, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom hours — revealed when frequency === "custom" */}
      {showCustomHours && (
        <div className="space-y-1.5">
          <label htmlFor="customHours" className={labelClass}>
            Cada cuántas horas<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="customHours"
            name="customHours"
            type="number"
            min="1"
            max="24"
            required
            placeholder="Ej. 8"
            className={inputClass}
          />
          <p className={hintClass}>Ingresá un valor entre 1 y 24 horas.</p>
        </div>
      )}

      {/* First dose datetime */}
      <div className="space-y-1.5">
        <label htmlFor="firstDoseAt" className={labelClass}>
          Primera dosis<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="firstDoseAt"
          name="firstDoseAt"
          type="datetime-local"
          required
          defaultValue={localDatetime}
          className={inputClass}
        />
        <p className={hintClass}>Desde este momento se van a generar los recordatorios de dosis.</p>
      </div>

      {/* Duration — optional */}
      <div className="space-y-1.5">
        <label htmlFor="durationDays" className={labelClass}>
          Duración del tratamiento (días)
        </label>
        <input
          id="durationDays"
          name="durationDays"
          type="number"
          min="1"
          max="90"
          placeholder="Ej. 7"
          className={inputClass}
        />
        <p className={hintClass}>
          Sin duración: vamos a generar recordatorios para los próximos 14 días. Cuando termine el
          tratamiento, marcalo como fin y cancelamos los pendientes.
        </p>
      </div>

      {/* Prescribed by */}
      <div className="space-y-1.5">
        <label htmlFor="prescribedBy" className={labelClass}>
          Prescripto por
        </label>
        <input
          id="prescribedBy"
          name="prescribedBy"
          type="text"
          placeholder="Nombre del veterinario/a"
          className={inputClass}
        />
      </div>

      {/* Start date — "día de inicio" (may differ from firstDoseAt) */}
      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Día de inicio<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
        <p className={hintClass}>
          Fecha en que empezó el tratamiento (puede diferir de la primera dosis registrada).
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea id="notes" name="notes" rows={3} className={inputClass} />
      </div>

      <AttachmentField />

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
        {isPending ? "Guardando..." : "Registrar inicio de medicación"}
      </button>
    </form>
  );
}
