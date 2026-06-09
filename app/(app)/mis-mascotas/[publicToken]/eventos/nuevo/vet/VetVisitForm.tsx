"use client";

import { useActionState } from "react";

import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { LnSheetAccordion, LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "vet-visit-form";

export function VetVisitForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon="🏥"
        title="Visita veterinaria"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Motivo de la visita" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="reason"
                type="text"
                required
                placeholder="Control general, urgencia, vacunación..."
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Fecha" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="occurredAt"
                type="date"
                required
                mono
                defaultValue={defaults?.occurredAt ?? today}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Diagnóstico (si lo hubo)">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="diagnosis"
                type="text"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Veterinario/a">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="vetName"
                type="text"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Clínica">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="clinic"
                type="text"
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
                defaultValue={defaults?.notes ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnSheetAccordion num="+" title="Ubicación">
            <LocationFields mode="l1" />
          </LnSheetAccordion>
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
        tone="azul"
        ctaLabel="Registrar visita"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
