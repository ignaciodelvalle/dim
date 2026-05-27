"use client";

import { useActionState } from "react";

import type { CheckinFormState } from "@/app/actions/checkin";
import { LocationFields } from "@/components/LocationFields";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { AttachmentField } from "../AttachmentField";

const initialState: CheckinFormState = { error: null };

type FormAction = (prev: CheckinFormState, formData: FormData) => Promise<CheckinFormState>;

export function CheckinForm({
  action,
  defaults,
}: {
  action: FormAction;
  defaults?: { notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          ¿Cómo está?
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Salud, ánimo, adaptación al hogar… lo que el refugio querría saber."
          className={inputClass}
        />
      </div>

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <summary className="text-sm font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
          Ubicación (opcional)
        </summary>
        <div className="mt-3">
          <LocationFields mode="l1" />
        </div>
      </details>

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
        {isPending ? "Enviando…" : "Enviar check-in"}
      </button>
    </form>
  );
}
