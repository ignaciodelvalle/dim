"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/Icon";
import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import { todayIsoInAr } from "@/lib/utils/format";
import type { EventFormState } from "@/src/modules/events/actions";
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
  // N3 redirect contract: the action returns `redirectTo` on success and the
  // form performs the full document navigation (see lib/ui/use-action-redirect.ts).
  useActionRedirect(state.redirectTo);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = todayIsoInAr();

  // Controlled field state
  const [text, setText] = useState(defaults?.text ?? "");
  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(defaults?.occurredAt ?? today);

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="nota" decorative />}
        title="Nota"
        subtitle="Libreta sanitaria oficial"
      />
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
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
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
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
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
