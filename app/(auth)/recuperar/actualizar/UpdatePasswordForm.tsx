"use client";

import { type UpdatePasswordState, updatePasswordAction } from "@/app/actions/password-reset";
import { LnField, LnPasswordInput } from "@/components/ui/Field";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

const initialState: UpdatePasswordState = { error: null };

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updatePasswordAction, initialState);

  // Redirect to login on success so the user starts a fresh session.
  useEffect(() => {
    if (state.ok) {
      router.replace("/iniciar-sesion");
    }
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-4">
      <LnField label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
        {({ id, describedBy, invalid }) => (
          <LnPasswordInput
            id={id}
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>
      <LnField label="Repetir contraseña" required>
        {({ id, describedBy, invalid }) => (
          <LnPasswordInput
            id={id}
            name="confirmPassword"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {state.error && (
        <p className="text-sm text-[var(--color-ln-err)]" role="alert">
          {state.error}
        </p>
      )}

      {state.ok && (
        <output className="block text-sm text-[var(--color-ln-ok)]">
          Contraseña actualizada. Redirigiendo...
        </output>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
