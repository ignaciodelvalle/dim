"use client";

import { useState } from "react";

import { LnField, LnSelect, LnTextarea } from "@/components/ui/Field";
import type { ProfessionalCloseResult } from "@/src/modules/surveillance/actions";

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
      <LnField label="Outcome" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
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
            <option value="negative">{"Negativo — animal sano tras observación"}</option>
            <option value="positive_rabies">
              {"POSITIVO — rabia confirmada o fuertemente sospechada"}
            </option>
            <option value="dead">{"Fallecido — fallecimiento durante la observación"}</option>
            <option value="lost_to_followup">
              {"Sin seguimiento — animal perdido o sin contacto"}
            </option>
          </LnSelect>
        )}
      </LnField>

      <LnField label="Notas de cierre">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="closureNotes"
            rows={4}
            placeholder="Ej: confirmación clínica negativa tras examen y sin síntomas a día 10."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-[6px] bg-ln-op-navy px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Cerrando..." : "Cerrar observación"}
      </button>
    </form>
  );
}
