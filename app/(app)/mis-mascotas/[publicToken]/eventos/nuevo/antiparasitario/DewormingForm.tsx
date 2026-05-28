"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function DewormingForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { product: string | null; occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field
        id="product"
        name="product"
        type="text"
        label="Producto"
        required
        defaultValue={defaults?.product ?? undefined}
        placeholder="Frontline, Advocate, Milbemax..."
      />

      <div className="space-y-1.5">
        <p className={labelClass}>
          Tipo<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="type"
              value="internal"
              required
              className="accent-neutral-900 "
            />
            <span className="text-sm text-gob-text ">Interno</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" value="external" className="accent-neutral-900 " />
            <span className="text-sm text-gob-text ">Externo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" value="both" className="accent-neutral-900 " />
            <span className="text-sm text-gob-text ">Ambos</span>
          </label>
        </div>
      </div>

      <Field
        id="occurredAt"
        name="occurredAt"
        type="date"
        label="Fecha de aplicación"
        required
        defaultValue={defaults?.occurredAt ?? today}
      />

      <Field
        id="nextDueAt"
        name="nextDueAt"
        type="date"
        label="Próxima dosis (opcional — crea recordatorio)"
      />

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
        {isPending ? "Guardando..." : "Registrar antiparasitario"}
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
        {required && <span className="text-gob-danger ml-0.5">*</span>}
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
