"use client";

import { type AuthFormState, loginAction } from "@/app/actions/auth";
import { LnField, LnInput } from "@/components/ui/Field";
import { useActionState, useState } from "react";

const initialState: AuthFormState = { error: null };

export function LoginForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  return (
    <LoginFormView
      state={state}
      formAction={formAction}
      isPending={isPending}
      returnTo={returnTo}
    />
  );
}

// Presentational form, split from the useActionState wiring so tests can
// assert every submit state (idle / pending / error) without mocking React.
//
// Submission contract (task #39): the submit button MUST stay a plain
// type="submit" inside the <form action={…}> — React/Next serialize that
// form into a progressively-enhanced POST (action="" method="POST" +
// $ACTION hidden inputs), so a click works even before hydration or with
// JS disabled. Never move the submit out of the form or replace it with an
// onClick handler: that reintroduces the silently-dropped click.
export function LoginFormView({
  state,
  formAction,
  isPending,
  returnTo,
}: {
  state: AuthFormState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  returnTo: string | null;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-5">
      {/* Email/password form is FIRST in DOM — correct tab order and screen-reader flow.
          The Mi Argentina stub renders below (visually and in DOM) so focus order is:
          email → password → submit → stub. */}
      <div className="flex flex-col gap-5">
        <form action={formAction} className="space-y-4">
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <LnField label="Correo electrónico" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-describedby={describedBy}
                invalid={invalid || Boolean(state.error)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

          <div className="flex justify-end">
            <a
              href="/recuperar"
              className="text-xs text-[var(--color-ln-azul)] underline underline-offset-2 hover:text-[var(--color-ln-azul-700)]"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          {/* Form-level error surface (task #39): a failed submit must never be
              silent. The credentials error belongs to the email+password PAIR,
              not to the email field, so it renders as its own alert block. */}
          {state.error && (
            <div
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-bg)] px-3 py-2 text-sm text-[var(--color-ln-err)]"
            >
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending || undefined}
            className="w-full px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
          <span>o</span>
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
        </div>

        {/* Mi Argentina stub — after the form in DOM (and visually) */}
        <button
          type="button"
          disabled
          tabIndex={-1}
          title="Próximamente: integración con Mi Argentina"
          className="w-full px-4 py-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] text-sm text-[var(--color-ln-mute)] cursor-not-allowed"
        >
          Conectar con Mi Argentina (próximamente)
        </button>
      </div>
    </div>
  );
}
