"use client";

import type { EventFormState } from "@/app/actions/tattoo";
import { inputClass, labelClass } from "@/lib/form-classes";
import { TATTOO_LOCATIONS } from "@/lib/lookups";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function TattooForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        id="tattooCode"
        name="tattooCode"
        type="text"
        label="Código del tatuaje"
        required
        placeholder="Ej: K9-2014-A"
      />

      <div className="space-y-1.5">
        <label htmlFor="locationOnBody" className={labelClass}>
          Ubicación en el cuerpo
        </label>
        <select id="locationOnBody" name="locationOnBody" className={inputClass} defaultValue="">
          <option value="">Sin especificar</option>
          {TATTOO_LOCATIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className={labelClass}>
          Descripción / origen del tatuaje
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Ej: criadero FCA, campaña de castración CABA 2018, refugio…"
          className={inputClass}
        />
        <p className="text-xs text-gob-text-muted ">
          Opcional. Texto libre para anotar de dónde viene el tatuaje.
        </p>
      </div>

      <Field
        id="recordedAt"
        name="recordedAt"
        type="date"
        label="Fecha del tatuaje (aproximada)"
        defaultValue={today}
      />

      <Field
        id="recordedBy"
        name="recordedBy"
        type="text"
        label="Tatuado por (criadero / vet / campaña)"
      />

      <div className="space-y-1.5">
        <label htmlFor="attachment" className={labelClass}>
          Foto del tatuaje
          <span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept="image/*"
          required
          className="block w-full text-sm text-gob-text-gray  file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gob-surface-alt  file:text-gob-text  hover:file:bg-gob-surface-alt  file:cursor-pointer"
        />
        <p className="text-xs text-gob-text-muted ">
          Imagen de hasta 5 MB. Es lo que permite a quien encuentre a tu mascota verificar
          visualmente que coincide con el código.
        </p>
      </div>

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
        {isPending ? "Guardando..." : "Registrar tatuaje"}
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
