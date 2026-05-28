"use client";

import type { EventFormState } from "@/app/actions/tattoo";
import { Field, Input, Select, Textarea } from "@/components/poncho";
import { TATTOO_LOCATIONS } from "@/lib/lookups";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function TattooForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Código del tatuaje" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="tattooCode"
            type="text"
            required
            placeholder="Ej: K9-2014-A"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Ubicación en el cuerpo">
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="locationOnBody"
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">Sin especificar</option>
            {TATTOO_LOCATIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Descripción / origen del tatuaje"
        help="Opcional. Texto libre para anotar de dónde viene el tatuaje."
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="description"
            rows={3}
            placeholder="Ej: criadero FCA, campaña de castración CABA 2018, refugio…"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Fecha del tatuaje (aproximada)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="recordedAt"
            type="date"
            defaultValue={today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Tatuado por (criadero / vet / campaña)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="recordedBy"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Foto del tatuaje"
        required
        help="Imagen de hasta 5 MB. Es lo que permite a quien encuentre a tu mascota verificar visualmente que coincide con el código."
      >
        {({ id }) => (
          <input
            id={id}
            name="attachment"
            type="file"
            accept="image/*"
            required
            className="block w-full text-sm text-gob-text-gray  file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gob-surface-alt  file:text-gob-text  hover:file:bg-gob-surface-alt  file:cursor-pointer"
          />
        )}
      </Field>

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
