"use client";

// Walk-in DIM code entry. The vet types the code printed on the physical
// credential the owner shows; on success the action returns `redirectTo` the
// signing surface (full-document nav, N3 redirect contract).

import { useActionState } from "react";

import { OpField, OpFormAlert, OpInput, OpSubmitButton } from "@/components/ui/dashboard/OpField";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import type { EventFormState } from "@/src/modules/events/actions";

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const initialState: EventFormState = { error: null };

export function CodeEntryForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  useActionRedirect(state.redirectTo);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <OpFormAlert>{state.error}</OpFormAlert>}
      <OpField
        label="Código de la credencial (DIM-XXXX-XXXX)"
        hint="Ingresá el código de la credencial que te muestra el dueño para registrar un evento clínico."
        required
      >
        {({ id, describedBy, invalid }) => (
          <OpInput
            id={id}
            name="code"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="DIM-XXXX-XXXX"
            className="font-[var(--font-ln-mono)] uppercase tracking-wider"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </OpField>
      <OpSubmitButton pending={isPending} pendingLabel="Buscando…">
        Buscar mascota
      </OpSubmitButton>
    </form>
  );
}
