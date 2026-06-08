"use client";

import { Field, Textarea } from "@/components/poncho";
import { useActionState } from "react";

export type CommentFormState = { error: string | null; success: boolean };

const initialState: CommentFormState = { error: null, success: false };

type CommentFormAction = (prev: CommentFormState, formData: FormData) => Promise<CommentFormState>;

export function ReporterCommentForm({ action }: { action: CommentFormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Agregar un comentario"
        error={state.error ?? undefined}
        help="Podés agregar novedades, aclaraciones o información adicional sobre esta denuncia. Máximo 2000 caracteres."
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="text"
            rows={4}
            required
            maxLength={2000}
            placeholder="Escribí tu comentario..."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state.success && (
        <p className="text-sm text-gob-success  font-medium">Comentario enviado correctamente.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Enviando..." : "Enviar comentario"}
      </button>
    </form>
  );
}
