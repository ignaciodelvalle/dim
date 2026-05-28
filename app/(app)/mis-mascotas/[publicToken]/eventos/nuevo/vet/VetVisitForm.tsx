"use client";

import { useActionState } from "react";

import type { EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { Field, Input, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function VetVisitForm({
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
      <Field label="Motivo de la visita" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="reason"
            type="text"
            required
            placeholder="Control general, urgencia, vacunación..."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Fecha" required>
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

      <Field label="Diagnóstico (si lo hubo)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="diagnosis"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Veterinario/a">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="vetName"
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

      <details className="rounded-lg border border-gob-border  p-3">
        <summary className="text-sm font-medium text-gob-text-gray  cursor-pointer">
          Ubicación (opcional)
        </summary>
        <div className="mt-3">
          <LocationFields mode="l1" />
        </div>
      </details>

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
        {isPending ? "Guardando..." : "Registrar visita"}
      </button>
    </form>
  );
}
