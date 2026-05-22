"use client";

/**
 * Weight-recording form — REFERENCE IMPLEMENTATION for URL-prefill.
 *
 * Future event-creation forms should copy this pattern:
 *
 *  1. Accept an optional `defaults` prop that mirrors the form fields.
 *  2. Use `defaultValue={defaults?.fieldName ?? ...}` on every input.
 *  3. The page's server component reads `searchParams`, builds the
 *     `defaults` object, and passes it down.
 *  4. The form name="..." attributes MUST match the keys in
 *     `lib/event-capture-registry.ts → EVENT_CAPTURE_REGISTRY[event_type].prefillSlots`
 *     — that registry is the contract the Captura rápida matcher (and
 *     any future LLM agent) deeplinks against.
 *
 * Why prop and not useSearchParams: server components own search-param
 * reading. The form is client-side; keeping it stateless re: URLs means
 * exactly one place owns "where do defaults come from" (the page).
 */

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export type WeightFormDefaults = {
  kg: string | null;
  occurredAt: string | null;
  notes: string | null;
};

export function WeightForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: WeightFormDefaults;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <label htmlFor="kg" className={labelClass}>
          Peso (kg)<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="kg"
          name="kg"
          type="number"
          step="0.1"
          min="0"
          required
          defaultValue={defaults?.kg ?? undefined}
          placeholder="Ej: 12.5"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={defaults?.occurredAt ?? today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? undefined}
          className={inputClass}
        />
      </div>

      <AttachmentField />

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar peso"}
      </button>
    </form>
  );
}
