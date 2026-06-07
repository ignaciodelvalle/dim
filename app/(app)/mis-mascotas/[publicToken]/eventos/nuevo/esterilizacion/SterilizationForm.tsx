"use client";

import { useActionState } from "react";

import { Field, Input, Radio, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function SterilizationForm({
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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <p className="block mb-2.5 text-[0.88em] font-semibold text-gob-text-muted">
          Procedimiento<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          <Radio name="procedure" value="castration" required>
            Castración
          </Radio>
          <Radio name="procedure" value="spay">
            Ovariectomía
          </Radio>
        </div>
      </div>

      <Field label="Fecha de la cirugía" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="occurredAt"
            type="date"
            required
            defaultValue={defaults?.occurredAt ?? today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Realizada por (veterinario/a)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="performedBy"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Clínica">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="clinic"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Notas">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            defaultValue={defaults?.notes ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <AttachmentField />

      {state.error && (
        <p className="text-sm text-gob-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar esterilización"}
      </button>
    </form>
  );
}
