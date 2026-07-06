"use client";

// Walk-in DIM code entry. The vet types the code printed on the physical
// credential the owner shows; on success the action returns `redirectTo` the
// signing surface (full-document nav, N3 redirect contract).

import { useActionState, useEffect, useRef, useState } from "react";

import { OpField, OpFormAlert, OpInput, OpSubmitButton } from "@/components/ui/dashboard/OpField";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import type { EventFormState } from "@/src/modules/events/actions";

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const initialState: EventFormState = { error: null };

export function CodeEntryForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  useActionRedirect(state.redirectTo);

  // A3: clear the previous attempt's error the moment the operator edits the
  // code (onChange), so a fresh lookup starts clean instead of showing a stale
  // failure under a new code. Each submission returns a NEW result object, so a
  // fresh result re-arms the alert — keyed on result identity (not on isPending,
  // which React can batch away when an action resolves synchronously).
  const [errorDismissed, setErrorDismissed] = useState(false);
  const lastResultRef = useRef(state);
  useEffect(() => {
    if (lastResultRef.current !== state) {
      lastResultRef.current = state;
      setErrorDismissed(false);
    }
  }, [state]);

  const showError = Boolean(state.error) && !errorDismissed && !isPending;

  return (
    <form action={formAction} className="space-y-4">
      {showError && <OpFormAlert>{state.error}</OpFormAlert>}
      <OpField
        label="Código de la credencial (DIM-XXXX-XXXX)"
        hint="Ingresá el código de la credencial que te muestra el dueño para registrar un evento clínico."
        required
      >
        {({ id, describedBy }) => (
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
            aria-invalid={showError || undefined}
            onChange={() => setErrorDismissed(true)}
          />
        )}
      </OpField>
      <OpSubmitButton pending={isPending} pendingLabel="Buscando…">
        Buscar mascota
      </OpSubmitButton>
    </form>
  );
}
