"use client";

import { useActionState } from "react";

import { Field, Input, Radio, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function DewormingForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { product: string | null; occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field label="Producto" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="product"
            type="text"
            required
            defaultValue={defaults?.product ?? undefined}
            placeholder="Frontline, Advocate, Milbemax..."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <div className="space-y-1.5">
        <p className="block mb-2.5 text-[0.88em] font-semibold text-gob-text-muted">
          Tipo<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          <Radio name="type" value="internal" required>
            Interno
          </Radio>
          <Radio name="type" value="external">
            Externo
          </Radio>
          <Radio name="type" value="both">
            Ambos
          </Radio>
        </div>
      </div>

      <Field label="Fecha de aplicación" required>
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

      <Field label="Próxima dosis" help="Opcional — crea un recordatorio automático.">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="nextDueAt"
            type="date"
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
        {isPending ? "Guardando..." : "Registrar antiparasitario"}
      </button>
    </form>
  );
}
