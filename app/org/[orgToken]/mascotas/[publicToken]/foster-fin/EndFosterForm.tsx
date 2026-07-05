"use client";

import { OpButton } from "@/components/ui/dashboard";
import { type EndFosterFormState, endFosterAction } from "@/src/modules/foster/actions";
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
      <p className="text-[13px] text-ln-op-ink-2">
        Vas a cerrar el tránsito{fosterName ? ` de ${fosterName}` : ""}. El animal vuelve a figurar
        solo en custodia del refugio. Esta acción queda en el historial como evento inmutable.
      </p>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-ln-op-ink">¿Quién finalizó el tránsito?</legend>
        <div className="flex flex-col gap-1 text-[13px] text-ln-op-ink-2">
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
        <span className="text-sm text-ln-op-mute">Motivo (opcional)</span>
        <textarea
          name="reason"
          rows={3}
          maxLength={500}
          className="w-full rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 text-[13px] text-ln-op-ink placeholder:text-ln-op-faint focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
          placeholder="Notas para el historial. El tránsito recibe el mensaje."
        />
      </label>

      {state.error && (
        <p className="text-sm rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
          {state.error}
        </p>
      )}

      <OpButton type="submit" disabled={isPending} variant="danger">
        {isPending ? "Cerrando…" : "Cerrar tránsito"}
      </OpButton>
    </form>
  );
}
