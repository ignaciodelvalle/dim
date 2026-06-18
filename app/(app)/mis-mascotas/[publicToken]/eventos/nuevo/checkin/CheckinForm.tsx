"use client";

import { useActionState } from "react";

import type { CheckinFormState } from "@/app/actions/checkin";
import { Icon } from "@/components/Icon";
import { LocationFields } from "@/components/LocationFields";
import { LnField, LnTextarea } from "@/components/ui/Field";
import { LnSheetAccordion, LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useFormErrorFocus } from "@/lib/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { AttachmentField } from "../AttachmentField";

const initialState: CheckinFormState = { error: null };
type FormAction = (prev: CheckinFormState, formData: FormData) => Promise<CheckinFormState>;
const FORM_ID = "checkin-form";

export function CheckinForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="checkin" decorative />}
        title="Check-in"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="¿Cómo está?">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={5}
                defaultValue={defaults?.notes ?? ""}
                placeholder="Salud, ánimo, adaptación al hogar… lo que el refugio querría saber."
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
        ctaLabel="Enviar check-in"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
