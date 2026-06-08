"use client";

import { Field, Input, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field label="Número de microchip" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="chipNumber"
            type="text"
            required
            defaultValue={defaults?.chipNumber ?? undefined}
            placeholder="985141004321456"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Código de país (ISO 3166-1 alfa-2)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="countryCode"
            type="text"
            defaultValue="AR"
            placeholder="AR"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Fecha de implantación" required>
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

      <Field label="Implantado por (veterinario/a)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="implantedBy"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Ubicación en el cuerpo">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="locationOnBody"
            type="text"
            placeholder="lomo entre los omóplatos"
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
        {isPending ? "Guardando..." : "Registrar microchip"}
      </button>
    </form>
  );
}
