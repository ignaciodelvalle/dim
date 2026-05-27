"use client";

import { type AssignFosterFormState, assignFosterAction } from "@/app/actions/foster";
import { useActionState } from "react";

const initialState: AssignFosterFormState = { error: null };

export type FosterCandidate = {
  userId: string;
  displayName: string;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Tránsito",
  vet_individual: "Veterinario/a",
};

export function AssignFosterForm({
  orgToken,
  publicToken,
  candidates,
}: {
  orgToken: string;
  publicToken: string;
  candidates: FosterCandidate[];
}) {
  const action = assignFosterAction.bind(null, orgToken, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">Voluntario/a *</span>
        <select
          name="fosterUserId"
          required
          defaultValue=""
          className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
        >
          <option value="" disabled>
            Elegir miembro activo
          </option>
          {candidates.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName} ({ROLE_LABELS[c.role] ?? c.role})
            </option>
          ))}
        </select>
        {candidates.length === 0 && (
          <span className="block text-xs text-neutral-500">
            No hay miembros activos disponibles para tránsito.
          </span>
        )}
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Semanas estimadas</span>
        <input
          name="expectedWeeks"
          type="number"
          min={0}
          max={104}
          className="rounded border border-gob-border-strong bg-white px-3 py-2"
          placeholder="Opcional"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Notas para el tránsito</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
          placeholder="Medicación, dieta especial, comportamientos a tener en cuenta…"
        />
      </label>

      {state.error && (
        <p className="text-sm rounded border border-gob-danger/30 bg-gob-danger/10 px-3 py-2 text-gob-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || candidates.length === 0}
        className="px-4 py-2 rounded bg-gob-primary text-white disabled:opacity-50"
      >
        {isPending ? "Asignando…" : "Asignar tránsito"}
      </button>
    </form>
  );
}
