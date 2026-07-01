"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/Icon";
import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { SymptomFormState } from "@/src/modules/events/actions";

const initialState: SymptomFormState = { error: null };
type FormAction = (prev: SymptomFormState, formData: FormData) => Promise<SymptomFormState>;
const FORM_ID = "symptom-form";

export function SymptomForm({
  action,
  petName,
  defaults,
}: {
  action: FormAction;
  petName: string;
  /** Optional prefill values forwarded from URL searchParams (captura-rápida). */
  defaults?: { freeText: string | null; onsetAt: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  // Controlled field state
  const [freeText, setFreeText] = useState(defaults?.freeText ?? "");
  const [severity, setSeverity] = useState("");
  const [onsetAt, setOnsetAt] = useState(defaults?.onsetAt ?? "");

  return (
    <>
      <LnSheetHeader
        tone="warn"
        icon={<Icon name="sintoma" decorative />}
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
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
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
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
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
                value={onsetAt}
                onChange={(e) => setOnsetAt(e.target.value)}
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
      {/* Wave 2 Item 9: verb fix — Rule 2 requires "Registrar X" with explicit object */}
      <LnSheetFooter
        tone="warn"
        ctaLabel="Registrar síntoma"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
