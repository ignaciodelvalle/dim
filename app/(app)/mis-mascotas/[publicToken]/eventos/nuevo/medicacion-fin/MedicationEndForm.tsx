"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
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
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <label htmlFor="medicationStartedEventId" className={labelClass}>
          Medicación a cerrar<span className="text-gob-danger ml-0.5">*</span>
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
          Fecha de fin<span className="text-gob-danger ml-0.5">*</span>
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
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Confirmar cierre de medicación"}
      </button>
    </form>
  );
}
