"use client";

import { useActionState, useEffect, useRef } from "react";

import type { CheckinFormState } from "@/app/actions/checkin";
import { Icon } from "@/components/Icon";
import { LocationFields } from "@/components/LocationFields";
import { LnField, LnTextarea } from "@/components/ui/Field";
import { LnSheetAccordion, LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useFormErrorFocus } from "@/lib/ui/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import { AttachmentField } from "../AttachmentField";

const initialState: CheckinFormState = { error: null };
type FormAction = (prev: CheckinFormState, formData: FormData) => Promise<CheckinFormState>;
const FORM_ID = "checkin-form";

export function CheckinForm({
  action,
  defaults,
  autoConfirm,
}: {
  action: FormAction;
  defaults?: { notes: string | null };
  /**
   * Notification quick-reply autoconfirm (capture-console surface #4) — see
   * VaccinationForm's autoConfirm doc for the full contract. CheckinForm has
   * no `required` inputs, so `checkValidity()` is trivially true whenever the
   * page reached this form at all (i.e. an open reminder exists — the page
   * itself 404s/redirects otherwise). Still routed through the same guard
   * for consistency and in case a future required field is added here.
   */
  autoConfirm?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();
  const formRef = useRef<HTMLFormElement>(null);

  const autoConfirmSubmitted = useRef(false);
  useEffect(() => {
    if (!autoConfirm || autoConfirmSubmitted.current) return;
    autoConfirmSubmitted.current = true;
    const form = formRef.current;
    if (form?.checkValidity()) {
      form.requestSubmit();
    }
  }, [autoConfirm]);

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="checkin" decorative />}
        title="Check-in"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} ref={formRef} action={formAction} className="contents">
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
            <LocationFields mode="l1" cascade />
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
