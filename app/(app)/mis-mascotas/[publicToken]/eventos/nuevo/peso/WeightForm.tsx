"use client";

/**
 * WeightForm — Libreta Nacional redesign.
 * Action, useActionState wiring, field names, and submit logic: untouched.
 */

import { Icon } from "@/components/Icon";
import { LnField, LnInput, LnRow, LnSuffixWrap, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "weight-form";

export type WeightFormDefaults = {
  kg: string | null;
  occurredAt: string | null;
  notes: string | null;
};

export function WeightForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: WeightFormDefaults;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="peso" decorative />}
        title="Registrar peso"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Peso" required error={state.error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <LnSuffixWrap suffix="kg">
                {/* Wave 2 Item 9: inputMode="decimal" + enterKeyHint="done" for mobile number pad */}
                <LnInput
                  id={id}
                  name="kg"
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  inputMode="decimal"
                  enterKeyHint="done"
                  defaultValue={defaults?.kg ?? undefined}
                  placeholder="Ej: 12.5"
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              </LnSuffixWrap>
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
          <LnField label="Notas">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                defaultValue={defaults?.notes ?? undefined}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <AttachmentField />
        </form>
      </LnSheetBody>
      <LnSheetFooter tone="azul" ctaLabel="Registrar peso" formId={FORM_ID} isPending={isPending} />
    </>
  );
}
