"use client";

import { type EndFosterFormState, endFosterAction } from "@/app/actions/foster";
import { useActionState } from "react";

const initialState: EndFosterFormState = { error: null };

const ENDED_BY_OPTIONS = [
  { value: "shelter", label: "Decisión del refugio" },
  { value: "foster_returned", label: "El tránsito devolvió al animal" },
  { value: "other", label: "Otro motivo" },
] as const;

export function EndFosterForm({
  orgToken,
  publicToken,
  fosterName,
}: {
  orgToken: string;
  publicToken: string;
  fosterName: string | null;
}) {
  const action = endFosterAction.bind(null, orgToken, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Vas a cerrar el tránsito{fosterName ? ` de ${fosterName}` : ""}. El animal vuelve a figurar
        solo en custodia del refugio. Esta acción queda en el historial como evento inmutable.
      </p>

      <fieldset className="space-y-1">
        <legend className="text-sm">¿Quién finalizó el tránsito?</legend>
        <div className="flex flex-col gap-1 text-sm">
          {ENDED_BY_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="endedBy"
                value={option.value}
                defaultChecked={option.value === "shelter"}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm">Motivo (opcional)</span>
        <textarea
          name="reason"
          rows={3}
          maxLength={500}
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
          placeholder="Notas para el historial. El tránsito recibe el mensaje."
        />
      </label>

      {state.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? "Cerrando…" : "Cerrar tránsito"}
      </button>
    </form>
  );
}
