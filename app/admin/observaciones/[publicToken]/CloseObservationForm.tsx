"use client";

import { useState } from "react";

import type { ProfessionalCloseResult } from "@/app/actions/bite";
import { Field, Select, Textarea } from "@/components/poncho";

type FormAction = (formData: FormData) => Promise<ProfessionalCloseResult>;

export function CloseObservationForm({ action }: { action: FormAction }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setError(null);
        setIsPending(true);
        try {
          const result = await action(formData);
          if (result.error) setError(result.error);
        } finally {
          setIsPending(false);
        }
      }}
      className="space-y-4"
    >
      <Field label="Outcome" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="outcome"
            required
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="" disabled>
              Elegí outcome
            </option>
            <option value="negative">Negativo — animal sano tras observación</option>
            <option value="positive_rabies">
              POSITIVO — rabia confirmada o fuertemente sospechada
            </option>
            <option value="dead">Fallecido — fallecimiento durante la observación</option>
            <option value="lost_to_followup">
              Sin seguimiento — animal perdido o sin contacto
            </option>
          </Select>
        )}
      </Field>

      <Field label="Notas de cierre">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="closureNotes"
            rows={4}
            placeholder="Ej: confirmación clínica negativa tras examen y sin síntomas a día 10."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {error && (
        <p className="text-sm text-gob-danger " role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Cerrando..." : "Cerrar observación"}
      </button>
    </form>
  );
}
