"use client";

import type { CheckinFormState } from "@/app/actions/checkin";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: CheckinFormState = { error: null };

type FormAction = (prev: CheckinFormState, formData: FormData) => Promise<CheckinFormState>;

export function CheckinForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          ¿Cómo está?
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          placeholder="Salud, ánimo, adaptación al hogar… lo que el refugio querría saber."
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
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
        {isPending ? "Enviando…" : "Enviar check-in"}
      </button>
    </form>
  );
}
