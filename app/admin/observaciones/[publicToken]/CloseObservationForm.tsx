"use client";

import { useState } from "react";

import { LnCheckbox, LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import {
  POSITIVE_RABIES_OUTCOME,
  RABIES_CONFIRMATION_WORD,
  canSubmitObservationClose,
} from "@/lib/domain/destructive-confirmation";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
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
          if (result.error) {
            setError(result.error);
            setIsPending(false);
            return;
          }
          // The action no longer redirects on its own (the App Router drops a
          // server action's redirect in production — lib/ui/full-page-action-nav
          // .ts); it hands the destination back and the client navigates here.
          // isPending deliberately stays true across the navigation so the form
          // never flips back to idle after a close that already committed. QA
          // ronda 5 (2026-07-16): the close worked, the form stayed put, and
          // the operator had no way to tell it had worked.
          if (result.redirectTo) navigateAfterActionSuccess(result.redirectTo);
          else setIsPending(false);
        } catch (e) {
          setIsPending(false);
          throw e;
        }
      }}
      className="space-y-4"
    >
      <LnField label="Resultado" required>
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
              Elegí un resultado
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
        <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3">
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

      {/* Non-silent gate: the positive-rabies close stays disabled until the
          operator clears the friction step above. Without this hint the disabled
          button reads as a silent no-op (nothing happens, no explanation). */}
      {isPositiveRabies && !canSubmit && (
        <output className="block text-xs text-ln-op-danger">
          {`Para habilitar el cierre POSITIVO, escribí "${RABIES_CONFIRMATION_WORD}" o marcá la casilla de reconocimiento de arriba.`}
        </output>
      )}

      <OpButton type="submit" disabled={isPending || !canSubmit} variant="primary" block>
        {isPending ? "Cerrando..." : "Cerrar observación"}
      </OpButton>
    </form>
  );
}
