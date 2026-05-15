"use client";

import { type AuthFormState, signupAction } from "@/app/actions/auth";
import { useActionState } from "react";

const initialState: AuthFormState = { error: null };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, initialState);

  return (
    <div className="space-y-5">
      <button
        type="button"
        disabled
        title="Próximamente: integración con Mi Argentina"
        className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-500 cursor-not-allowed"
      >
        Conectar con Mi Argentina (próximamente)
      </button>

      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-500">
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        <span>o</span>
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <form action={formAction} className="space-y-4">
        <Field
          id="displayName"
          name="displayName"
          type="text"
          label="Nombre"
          autoComplete="name"
          required
        />
        <Field
          id="email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Contraseña"
          autoComplete="new-password"
          minLength={8}
          required
          hint="Mínimo 8 caracteres."
        />

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  required,
  minLength,
  hint,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
