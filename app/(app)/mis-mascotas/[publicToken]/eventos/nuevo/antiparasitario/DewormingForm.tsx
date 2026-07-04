"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/Icon";
import { LnField, LnInput, LnRadio, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { useFormErrorFocus } from "@/lib/ui/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "deworming-form";

export function DewormingForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { product: string | null; occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  // N3 redirect contract: the action returns `redirectTo` on success and the
  // form performs the full document navigation (see lib/ui/use-action-redirect.ts).
  useActionRedirect(state.redirectTo);
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  // Controlled field state — preserves typed input on validation error.
  const [product, setProduct] = useState(defaults?.product ?? "");
  const [occurredAt, setOccurredAt] = useState(defaults?.occurredAt ?? today);
  const [nextDueAt, setNextDueAt] = useState("");
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  return (
    <>
      <LnSheetHeader
        tone="verde"
        icon={<Icon name="medicacion" decorative />}
        title="Registrar antiparasitario"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Producto" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="product"
                type="text"
                required
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Frontline, Advocate, Milbemax..."
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <div className="flex flex-col gap-[6px]">
            <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
              Tipo{" "}
              <span className="text-[var(--color-ln-seal)]" aria-hidden="true">
                *
              </span>
            </p>
            <div className="flex flex-col gap-[6px]">
              <LnRadio name="type" value="internal" required>
                Interno
              </LnRadio>
              <LnRadio name="type" value="external">
                Externo
              </LnRadio>
              <LnRadio name="type" value="both">
                Ambos
              </LnRadio>
            </div>
          </div>
          <LnField label="Fecha de aplicación" required>
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
          <LnField label="Próxima dosis" hint="Opcional — crea un recordatorio automático.">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="nextDueAt"
                type="date"
                mono
                value={nextDueAt}
                onChange={(e) => setNextDueAt(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Notas">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <AttachmentField />
          {state.error && (
            <p
              ref={errorRef}
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
              tabIndex={-1}
            >
              {state.error}
            </p>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="verde"
        ctaLabel="Registrar antiparasitario"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
