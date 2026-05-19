"use client";

import type { EventFormState } from "@/app/actions/events";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function MicrochipForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { chipNumber: string | null; occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        id="chipNumber"
        name="chipNumber"
        type="text"
        label="Número de microchip"
        required
        defaultValue={defaults?.chipNumber ?? undefined}
        placeholder="985141004321456"
      />

      <Field
        id="countryCode"
        name="countryCode"
        type="text"
        label="Código de país (ISO 3166-1 alfa-2)"
        defaultValue="AR"
        placeholder="AR"
      />

      <Field
        id="occurredAt"
        name="occurredAt"
        type="date"
        label="Fecha de implantación"
        required
        defaultValue={defaults?.occurredAt ?? today}
      />

      <Field
        id="implantedBy"
        name="implantedBy"
        type="text"
        label="Implantado por (veterinario/a)"
      />

      <Field
        id="locationOnBody"
        name="locationOnBody"
        type="text"
        label="Ubicación en el cuerpo"
        placeholder="lomo entre los omóplatos"
      />

      <div className="space-y-1.5">
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
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
        {isPending ? "Guardando..." : "Registrar microchip"}
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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
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
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      />
    </div>
  );
}
