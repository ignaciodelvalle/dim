"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

type OpenMedication = {
  id: string;
  drugName: string;
  startedDate: string; // pre-formatted label
};

export function MedicationEndForm({
  action,
  openMedications,
}: {
  action: FormAction;
  openMedications: OpenMedication[];
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="medicationStartedEventId" className={labelClass}>
          Medicación a cerrar<span className="text-red-500 ml-0.5">*</span>
        </label>
        <select
          id="medicationStartedEventId"
          name="medicationStartedEventId"
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Seleccioná un medicamento...
          </option>
          {openMedications.map((med) => (
            <option key={med.id} value={med.id}>
              {med.drugName} · iniciado {med.startedDate}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha de fin<span className="text-red-500 ml-0.5">*</span>
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
        <label htmlFor="reason" className={labelClass}>
          Motivo (opcional)
        </label>
        <input
          id="reason"
          name="reason"
          type="text"
          placeholder="Tratamiento completo, efectos adversos..."
          className={inputClass}
        />
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
        {isPending ? "Guardando..." : "Registrar fin de medicación"}
      </button>
    </form>
  );
}
