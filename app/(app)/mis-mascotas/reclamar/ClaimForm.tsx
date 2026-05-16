"use client";

import { type ClaimFormState, claimStubProfileAction } from "@/app/actions/claim";
import { useActionState } from "react";

const initialState: ClaimFormState = { error: null };

export function ClaimForm() {
  const [state, formAction, isPending] = useActionState(claimStubProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">Tu DNI *</span>
        <input
          name="dni"
          required
          inputMode="numeric"
          placeholder="12345678"
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
        />
        <span className="block text-xs text-neutral-500">
          Usá el DNI que diste al refugio. Si la organización registró tu adopción con ese número,
          las mascotas pasan a tu cuenta automáticamente.
        </span>
      </label>

      {state.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Verificando…" : "Reclamar adopción"}
      </button>
    </form>
  );
}
