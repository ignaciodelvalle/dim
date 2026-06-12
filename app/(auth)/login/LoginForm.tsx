"use client";

import { type AuthFormState, loginAction } from "@/app/actions/auth";
import { LnField, LnInput } from "@/components/ui/Field";
import { useActionState } from "react";

const initialState: AuthFormState = { error: null };

export function LoginForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-5">
      {/* Email/password form comes first in DOM for correct tab order and screen-reader flow.
          The Mi Argentina stub follows visually via flex-direction: column-reverse in the
          outer wrapper, but DOM order is form → stub so tab focus hits email first. */}
      <div className="flex flex-col-reverse gap-5">
        {/* Mi Argentina stub — rendered after the form in DOM (tab order: email → password → submit → stub) */}
        <button
          type="button"
          disabled
          tabIndex={-1}
          title="Próximamente: integración con Mi Argentina"
          className="w-full px-4 py-3 rounded-[3px] border border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)] cursor-not-allowed"
        >
          Conectar con Mi Argentina (próximamente)
        </button>

        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
            <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
            <span>o</span>
            <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
          </div>

          <form action={formAction} className="space-y-4">
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
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
            <LnField label="Contraseña" required>
              {({ id, describedBy, invalid }) => (
                <LnInput
                  id={id}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </LnField>

            {/* OPEN P0 (deferred 2026-06-12): password reset ships with the transactional-email
                provider — do not add a dead link until then. A "¿Olvidaste tu contraseña?" link
                would go here, between the password field and the submit button.
                See docs/qa/ui-flow-review-2026-06.md. */}

            <button
              type="submit"
              disabled={isPending}
              className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
