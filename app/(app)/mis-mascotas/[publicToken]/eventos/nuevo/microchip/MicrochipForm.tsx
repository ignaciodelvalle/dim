"use client";

import { LnField, LnInput, LnRow, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "microchip-form";

export function MicrochipForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { chipNumber: string | null; occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon="📡"
        title="Registrar microchip"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Número de microchip" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="chipNumber"
                type="text"
                required
                defaultValue={defaults?.chipNumber ?? undefined}
                placeholder="985141004321456"
                aria-describedby={describedBy}
                invalid={invalid}
                mono
              />
            )}
          </LnField>
          <LnRow>
            <LnField label="Fecha de implantación" required>
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
            <LnField label="Código de país">
              {({ id, describedBy, invalid }) => (
                <LnInput
                  id={id}
                  name="countryCode"
                  type="text"
                  defaultValue="AR"
                  placeholder="AR"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  mono
                />
              )}
            </LnField>
          </LnRow>
          <LnField label="Implantado por (veterinario/a)">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="implantedBy"
                type="text"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Ubicación en el cuerpo">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="locationOnBody"
                type="text"
                placeholder="lomo entre los omóplatos"
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
        ctaLabel="Registrar microchip"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
