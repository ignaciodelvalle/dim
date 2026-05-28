"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { type DniVerifyFormState, verifyDniAction } from "@/app/actions/dni-verification";
import { Field, Input } from "@/components/poncho";

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
      <p className="text-sm rounded border border-gob-success bg-gob-success/10 px-3 py-2 text-gob-success   ">
        DNI verificado. Redirigiendo...
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
      <Field
        label="Número de DNI"
        help="7 u 8 dígitos sin puntos ni espacios."
        error={state.error ?? undefined}
        required
      >
        {({ id, describedBy, invalid }) => (
          <Input
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
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Verificando..." : "Verificar DNI"}
      </button>
    </form>
  );
}
