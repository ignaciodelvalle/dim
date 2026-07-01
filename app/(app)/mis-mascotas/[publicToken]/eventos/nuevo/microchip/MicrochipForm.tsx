"use client";

import { Icon } from "@/components/Icon";
import { LnField, LnInput, LnRow, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useFormErrorFocus } from "@/lib/ui/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState, useState } from "react";
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
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  // Controlled field state — preserves typed input on validation error.
  const [chipNumber, setChipNumber] = useState(defaults?.chipNumber ?? "");
  const [occurredAt, setOccurredAt] = useState(defaults?.occurredAt ?? today);
  const [countryCode, setCountryCode] = useState("AR");
  const [implantedBy, setImplantedBy] = useState("");
  const [locationOnBody, setLocationOnBody] = useState("");
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="microchip" decorative />}
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
                value={chipNumber}
                onChange={(e) => setChipNumber(e.target.value)}
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
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
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
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
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
                value={implantedBy}
                onChange={(e) => setImplantedBy(e.target.value)}
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
                value={locationOnBody}
                onChange={(e) => setLocationOnBody(e.target.value)}
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
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <AttachmentField />
          {state.error && (
            <p
              ref={errorRef}
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
              tabIndex={-1}
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
