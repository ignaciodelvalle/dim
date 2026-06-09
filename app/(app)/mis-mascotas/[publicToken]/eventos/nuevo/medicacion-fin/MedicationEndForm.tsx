"use client";

import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "medication-end-form";

type OpenMedication = {
  id: string;
  drugName: string;
  startedDate: string;
};

export function MedicationEndForm({
  action,
  openMedications,
}: {
  action: FormAction;
  openMedications: OpenMedication[];
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="violeta"
        icon="🛑"
        title="Fin de medicación"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Medicación a cerrar" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="medicationStartedEventId"
                required
                defaultValue=""
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="" disabled>
                  Seleccioná un medicamento...
                </option>
                {openMedications.map((med) => (
                  <option key={med.id} value={med.id}>
                    {med.drugName} · iniciado {med.startedDate}
                  </option>
                ))}
              </LnSelect>
            )}
          </LnField>
          <LnField label="Fecha de fin" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="occurredAt"
                type="date"
                required
                mono
                defaultValue={today}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Motivo">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="reason"
                type="text"
                placeholder="Tratamiento completo, efectos adversos..."
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Notas">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <AttachmentField />
          {state.error && (
            <p
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
            >
              {state.error}
            </p>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="violeta"
        ctaLabel="Confirmar cierre de medicación"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
