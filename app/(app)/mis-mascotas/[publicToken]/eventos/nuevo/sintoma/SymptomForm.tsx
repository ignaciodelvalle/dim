"use client";

import type { SymptomFormState } from "@/app/actions/events";
import { Field, Input, Select, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState } from "react";

const initialState: SymptomFormState = { error: null };

type FormAction = (prev: SymptomFormState, formData: FormData) => Promise<SymptomFormState>;

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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field label="¿Qué estás viendo?" required error={state.error ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="freeText"
            required
            rows={5}
            placeholder={`Ej: hace dos días que ${petName} vomita y está decaída. Hoy no quiso comer.`}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="¿Cuán grave te parece?">
        {({ id, describedBy, invalid }) => (
          <Select
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
          </Select>
        )}
      </Field>

      <Field label="¿Desde cuándo notás esto?">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="onsetAt"
            type="date"
            max={today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar en la libreta"}
      </button>

      <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
        Si los síntomas persisten o empeoran, consultá al veterinario.
      </p>
    </form>
  );
}
