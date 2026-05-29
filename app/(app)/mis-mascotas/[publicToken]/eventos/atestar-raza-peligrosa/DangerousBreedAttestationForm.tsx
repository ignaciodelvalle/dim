"use client";

import type { EventFormState } from "@/app/actions/events";
import { Radio } from "@/components/poncho";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState, useState } from "react";
import { AttachmentField } from "../nuevo/AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const REGISTRY_OPTIONS: Array<{ value: string; label: string; help: string }> = [
  {
    value: "caba_4078",
    label: "CABA · Ley 4078",
    help: "Registro de la Ciudad Autónoma de Buenos Aires.",
  },
  {
    value: "prov_14107",
    label: "Provincia de Buenos Aires · Ley 14.107",
    help: "Registro provincial bonaerense.",
  },
  {
    value: "other",
    label: "Otro registro",
    help: "Si la mascota está en otra provincia, indicalo en las notas.",
  },
];

export function DangerousBreedAttestationForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [registry, setRegistry] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className={labelClass}>
          Registro<span className="text-gob-danger ml-0.5">*</span>
        </legend>
        {REGISTRY_OPTIONS.map((opt) => (
          <Radio
            key={opt.value}
            name="registry"
            value={opt.value}
            required
            checked={registry === opt.value}
            onChange={(e) => setRegistry(e.target.value)}
          >
            <span className="space-y-0.5">
              {opt.label}
              <span className="block text-xs! text-gob-text-gray!">{opt.help}</span>
            </span>
          </Radio>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="registryId" className={labelClass}>
          Nº de registro / expediente (opcional)
        </label>
        <input
          id="registryId"
          name="registryId"
          type="text"
          placeholder="Si tenés el número a mano"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="attestedAt" className={labelClass}>
          Fecha de atestación<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="attestedAt"
          name="attestedAt"
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
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Detalles, si querés agregar"
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
        {isPending ? "Guardando..." : "Registrar atestación"}
      </button>
    </form>
  );
}
