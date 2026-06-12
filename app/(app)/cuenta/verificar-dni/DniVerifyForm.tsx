"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { type DniVerifyFormState, verifyDniAction } from "@/app/actions/dni-verification";
import { LnField, LnInput } from "@/components/ui/Field";

const initialState: DniVerifyFormState = { error: null };

export function DniVerifyForm({ next }: { next: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(verifyDniAction, initialState);

  // Redirect on success: the server already revalidated /cuenta; client navigates.
  useEffect(() => {
    if (state.ok && state.next) {
      router.push(state.next);
    }
  }, [state.ok, state.next, router]);

  if (state.ok) {
    return (
      <p className="text-sm rounded-[4px] border border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] px-3 py-2 text-[var(--color-ln-ok)]">
        DNI declarado. Redirigiendo...
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden field passes the validated `next` value through the form cycle. */}
      <input type="hidden" name="next" value={next} />

      {/* TODO(mi-argentina): this form is a placeholder until the real Mi Argentina OAuth
          integration is available. When that lands, this page becomes the OAuth callback
          landing — the user never types their DNI manually. */}
      <LnField
        label="Número de DNI"
        hint="7 u 8 dígitos sin puntos ni espacios."
        error={state.error ?? undefined}
        required
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="dni"
            type="text"
            inputMode="numeric"
            required
            placeholder="Ej: 34567890"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Guardando..." : "Declarar DNI"}
      </button>
    </form>
  );
}
