"use client";

import {
  type PasswordResetRequestState,
  requestPasswordResetAction,
} from "@/app/actions/password-reset";
import { LnField, LnInput } from "@/components/ui/Field";
import { useActionState } from "react";

const initialState: PasswordResetRequestState = { message: null, error: null };

export function ResetRequestForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  if (state.message) {
    return (
      <output className="block rounded-[3px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-4 py-3.5 text-md text-[var(--color-ln-ink)]">
        {state.message}
      </output>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <LnField label="Correo electrónico" required error={state.error ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Enviar enlace de recuperación"}
      </button>
    </form>
  );
}
