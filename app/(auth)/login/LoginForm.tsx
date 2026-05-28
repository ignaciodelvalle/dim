"use client";

import { type AuthFormState, loginAction } from "@/app/actions/auth";
import { Field, Input } from "@/components/poncho";
import { useActionState } from "react";

const initialState: AuthFormState = { error: null };

export function LoginForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-5">
      <button
        type="button"
        disabled
        title="Próximamente: integración con Mi Argentina"
        className="w-full px-4 py-3 rounded-lg border border-gob-border-strong  text-sm text-gob-text-muted  cursor-not-allowed"
      >
        Conectar con Mi Argentina (próximamente)
      </button>

      <div className="flex items-center gap-3 text-xs text-gob-text-muted ">
        <div className="flex-1 h-px bg-gob-surface-alt " />
        <span>o</span>
        <div className="flex-1 h-px bg-gob-surface-alt " />
      </div>

      <form action={formAction} className="space-y-4">
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <Field label="Correo electrónico" required error={state.error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Field label="Contraseña" required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}
