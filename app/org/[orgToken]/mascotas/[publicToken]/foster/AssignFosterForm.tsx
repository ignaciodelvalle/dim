"use client";

import { type AssignFosterFormState, assignFosterAction } from "@/app/actions/foster";
import { Field, Input, Select, Textarea } from "@/components/poncho";
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
      <Field
        label="Voluntario/a"
        required
        help={
          candidates.length === 0 ? "No hay miembros activos disponibles para tránsito." : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="fosterUserId"
            required
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="" disabled>
              Elegir miembro activo
            </option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName} ({ROLE_LABELS[c.role] ?? c.role})
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Semanas estimadas">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="expectedWeeks"
            type="number"
            min={0}
            max={104}
            placeholder="Opcional"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Notas para el tránsito">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Medicación, dieta especial, comportamientos a tener en cuenta…"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state.error && (
        <p className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger   ">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || candidates.length === 0}
        className="px-4 py-2 rounded bg-gob-primary text-white   disabled:opacity-50"
      >
        {isPending ? "Asignando…" : "Asignar tránsito"}
      </button>
    </form>
  );
}
