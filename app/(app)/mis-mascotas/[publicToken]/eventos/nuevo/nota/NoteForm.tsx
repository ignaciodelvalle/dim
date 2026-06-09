"use client";

import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "note-form";

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
    <>
      <LnSheetHeader tone="azul" icon="📝" title="Nota" subtitle="Libreta sanitaria oficial" />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Nota" required error={state.error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <LnTextarea
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
          </LnField>
          <LnField label="Categoría">
            {({ id, describedBy, invalid }) => (
              <LnSelect
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
              </LnSelect>
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
          <AttachmentField />
        </form>
      </LnSheetBody>
      <LnSheetFooter tone="azul" ctaLabel="Guardar nota" formId={FORM_ID} isPending={isPending} />
    </>
  );
}
