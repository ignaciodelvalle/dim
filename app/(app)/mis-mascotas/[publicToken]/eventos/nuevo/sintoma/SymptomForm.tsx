"use client";

import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { SymptomFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";

const initialState: SymptomFormState = { error: null };
type FormAction = (prev: SymptomFormState, formData: FormData) => Promise<SymptomFormState>;
const FORM_ID = "symptom-form";

export function SymptomForm({
  action,
  petName,
}: {
  action: FormAction;
  petName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="warn"
        icon="🩺"
        title="Registrar síntoma"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="¿Qué estás viendo?" required error={state.error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="freeText"
                required
                rows={5}
                placeholder={`Ej: hace dos días que ${petName} vomita y está decaída. Hoy no quiso comer.`}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="¿Cuán grave te parece?">
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="severity"
                defaultValue=""
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="">No sé / prefiero no decir</option>
                <option value="mild">Leve</option>
                <option value="moderate">Moderado</option>
                <option value="severe">Grave</option>
              </LnSelect>
            )}
          </LnField>
          <LnField label="¿Desde cuándo notás esto?">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="onsetAt"
                type="date"
                mono
                max={today}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <p className="font-[var(--font-ln-mono)] text-[10.5px] text-center text-[var(--color-ln-mute)]">
            Si los síntomas persisten o empeoran, consultá al veterinario.
          </p>
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="warn"
        ctaLabel="Registrar en la libreta"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
