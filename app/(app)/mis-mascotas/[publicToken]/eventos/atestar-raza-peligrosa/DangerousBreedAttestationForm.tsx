"use client";

import { Input, Radio, Textarea } from "@/components/poncho";
import type { EventFormState } from "@/src/modules/events/actions";
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
        <legend className="block text-sm font-medium text-gob-text">
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
        <label htmlFor="registryId" className="block text-sm font-medium text-gob-text">
          Nº de registro / expediente (opcional)
        </label>
        <Input
          id="registryId"
          name="registryId"
          type="text"
          placeholder="Si tenés el número a mano"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="attestedAt" className="block text-sm font-medium text-gob-text">
          Fecha de atestación<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <Input id="attestedAt" name="attestedAt" type="date" required defaultValue={today} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium text-gob-text">
          Notas
        </label>
        <Textarea id="notes" name="notes" rows={3} placeholder="Detalles, si querés agregar" />
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
