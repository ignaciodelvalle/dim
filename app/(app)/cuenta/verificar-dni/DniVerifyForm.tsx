"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { type DniVerifyFormState, verifyDniAction } from "@/app/actions/dni-verification";

const initialState: DniVerifyFormState = { error: null };

export function DniVerifyForm({ next }: { next: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(verifyDniAction, initialState);

  // Redirect on success: the server already revalidated /cuenta; client navigates.
  useEffect(() => {
    if (state.ok && state.next) {
      router.push(state.next);
    }
  }, [state.ok, state.next, router]);

  if (state.ok) {
    return (
      <p className="text-sm rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
        DNI verificado. Redirigiendo...
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden field passes the validated `next` value through the form cycle. */}
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label
          htmlFor="dni"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Número de DNI
        </label>
        <input
          id="dni"
          name="dni"
          type="text"
          inputMode="numeric"
          required
          placeholder="Ej: 34567890"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          7 u 8 dígitos sin puntos ni espacios.
          {/* TODO(mi-argentina): this form is a placeholder until the real Mi Argentina OAuth
              integration is available. When that lands, this page becomes the OAuth callback
              landing — the user never types their DNI manually. */}
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Verificando..." : "Verificar DNI"}
      </button>
    </form>
  );
}
