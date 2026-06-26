"use client";

import { useState } from "react";

import { LnCheckbox, LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import {
  POSITIVE_RABIES_OUTCOME,
  RABIES_CONFIRMATION_WORD,
  canSubmitObservationClose,
} from "@/lib/destructive-confirmation";
import type { ProfessionalCloseResult } from "@/src/modules/surveillance/actions";

type FormAction = (formData: FormData) => Promise<ProfessionalCloseResult>;

export function CloseObservationForm({ action }: { action: FormAction }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const isPositiveRabies = outcome === POSITIVE_RABIES_OUTCOME;
  const canSubmit = canSubmitObservationClose({ outcome, typedConfirmation, acknowledged });

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
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              // Reset the friction gate when the operator changes outcome.
              setTypedConfirmation("");
              setAcknowledged(false);
            }}
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

      {/* C6 — typed confirmation for the public-health critical outcome. */}
      {isPositiveRabies && (
        <div className="space-y-3 rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3">
          <p className="text-sm font-semibold text-ln-op-danger">
            {"Confirmar rabia positiva dispara notificaciones de salud pública."}
          </p>
          <LnField
            label={`Escribí "${RABIES_CONFIRMATION_WORD}" para confirmar`}
            hint="O marcá la casilla de reconocimiento de impacto."
          >
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={RABIES_CONFIRMATION_WORD}
                aria-describedby={describedBy}
                autoComplete="off"
              />
            )}
          </LnField>
          <LnCheckbox
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            labelClassName="text-xs! text-ln-op-danger!"
          >
            {
              "Entiendo que confirmar un resultado positivo de rabia notifica a las autoridades de salud pública y al dueño."
            }
          </LnCheckbox>
        </div>
      )}

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
        <p className="text-sm text-ln-op-danger" role="alert">
          {error}
        </p>
      )}

      <OpButton type="submit" disabled={isPending || !canSubmit} variant="primary" block>
        {isPending ? "Cerrando..." : "Cerrar observación"}
      </OpButton>
    </form>
  );
}
