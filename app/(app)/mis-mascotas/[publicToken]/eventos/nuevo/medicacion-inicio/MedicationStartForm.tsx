"use client";

import type { EventFormState } from "@/app/actions/events";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

export function MedicationStartForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="drugName" className={labelClass}>
          Medicamento<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="drugName"
          name="drugName"
          type="text"
          required
          placeholder="Amoxicilina, Metronidazol..."
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="dose" className={labelClass}>
          Dosis<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="dose"
          name="dose"
          type="text"
          required
          placeholder="10 mg cada 12 h, 1 comprimido..."
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="frequency" className={labelClass}>
          Frecuencia<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="frequency"
          name="frequency"
          type="text"
          required
          placeholder="Cada 8 h, 1 vez al día..."
          className={inputClass}
        />
      </div>

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

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha de inicio<span className="text-red-500 ml-0.5">*</span>
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
