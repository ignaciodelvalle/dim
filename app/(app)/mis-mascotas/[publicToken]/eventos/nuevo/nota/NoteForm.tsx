"use client";

import type { EventFormState } from "@/app/actions/events";
import { Field, Input, Select, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const CATEGORIES = [
  { value: "comportamiento", label: "Comportamiento" },
  { value: "dieta", label: "Dieta" },
  { value: "grooming", label: "Grooming / aseo" },
  { value: "estado_de_animo", label: "Estado de ánimo" },
  { value: "otro", label: "Otro" },
];

export function NoteForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { text: string | null; occurredAt: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field label="Nota" required error={state.error ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="text"
            rows={5}
            required
            defaultValue={defaults?.text ?? ""}
            placeholder="¿Qué observaste?"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Categoría">
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="category"
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">No especificar</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
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

      <AttachmentField />

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Guardar nota"}
      </button>
    </form>
  );
}
