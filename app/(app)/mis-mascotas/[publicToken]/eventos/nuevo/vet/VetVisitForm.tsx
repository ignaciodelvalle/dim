"use client";

import { useActionState } from "react";

import type { EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function VetVisitForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field
        id="reason"
        name="reason"
        type="text"
        label="Motivo de la visita"
        required
        placeholder="Control general, urgencia, vacunación..."
      />

      <Field
        id="occurredAt"
        name="occurredAt"
        type="date"
        label="Fecha"
        required
        defaultValue={defaults?.occurredAt ?? today}
      />

      <Field id="diagnosis" name="diagnosis" type="text" label="Diagnóstico (si lo hubo)" />

      <Field id="vetName" name="vetName" type="text" label="Veterinario/a" />

      <Field id="clinic" name="clinic" type="text" label="Clínica" />

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

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <summary className="text-sm font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
          Ubicación (opcional)
        </summary>
        <div className="mt-3">
          <LocationFields mode="l1" />
        </div>
      </details>

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
        {isPending ? "Guardando..." : "Registrar visita"}
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
  placeholder,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}
