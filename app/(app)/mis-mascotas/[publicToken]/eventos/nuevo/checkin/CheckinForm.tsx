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
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando…" : "Enviar check-in"}
      </button>
    </form>
  );
}
