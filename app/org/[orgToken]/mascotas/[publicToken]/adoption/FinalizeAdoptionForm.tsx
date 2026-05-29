"use client";

import { type FinalizeAdoptionFormState, finalizeAdoptionAction } from "@/app/actions/adoption";
import { Checkbox, Field, Input, Textarea } from "@/components/poncho";
import { useActionState, useState } from "react";

const initialState: FinalizeAdoptionFormState = { error: null };

export function FinalizeAdoptionForm({
  orgToken,
  publicToken,
  fosterShortcut,
}: {
  orgToken: string;
  publicToken: string;
  fosterShortcut: { adopterUserId: string; displayName: string } | null;
}) {
  const action = finalizeAdoptionAction.bind(null, orgToken, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [useFosterShortcut, setUseFosterShortcut] = useState(Boolean(fosterShortcut));

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      {fosterShortcut && (
        <section className="rounded-lg border border-gob-success bg-gob-success/10   p-4 space-y-3">
          <Checkbox
            id="use-foster-shortcut"
            checked={useFosterShortcut}
            onChange={(e) => setUseFosterShortcut(e.target.checked)}
          >
            <strong className="block text-gob-success ">
              Finalizar adopción al tránsito actual ({fosterShortcut.displayName})
            </strong>
            <span className="text-gob-success  text-xs block mt-1">
              El voluntario que está cuidando a esta mascota se convierte en dueño/a. Saltamos el
              paso de pedirte el DNI.
            </span>
          </Checkbox>
          {useFosterShortcut && (
            <input type="hidden" name="adopterUserId" value={fosterShortcut.adopterUserId} />
          )}
        </section>
      )}

      {!useFosterShortcut && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gob-text-muted">
            Adoptante
          </h2>
          <Field
            label="DNI"
            required
            help="Si la persona ya tiene cuenta MiMAR con ese DNI, la usamos. Si no, creamos un perfil preliminar que podrá reclamar más adelante."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="adopterDni"
                required={!useFosterShortcut}
                inputMode="numeric"
                placeholder="12345678"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre completo" required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="adopterDisplayName"
                  required={!useFosterShortcut}
                  maxLength={200}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Teléfono">
              {({ id, describedBy }) => (
                <Input id={id} name="adopterPhone" maxLength={30} aria-describedby={describedBy} />
              )}
            </Field>
          </div>
        </section>
      )}

      <section className="space-y-3 pt-2 border-t border-gob-border ">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gob-text-muted">
          Seguimiento
        </h2>
        <Field
          label="Meses de seguimiento post-adopción"
          help="Generará recordatorios de check-in con el adoptante (default: 6)."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="followupMonths"
              type="number"
              min={0}
              max={36}
              defaultValue={6}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="Notas del contrato">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Condiciones especiales, observaciones, referencia al contrato firmado…"
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field
          label="Contrato firmado (PDF o imagen)"
          help="Si lo subís, queda enlazado al evento de adopción y al expediente del animal."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              name="contract"
              type="file"
              accept="application/pdf,image/*"
              aria-describedby={describedBy}
              className="block w-full text-sm text-gob-text-gray  file:mr-3 file:rounded file:border-0 file:bg-gob-primary file:px-3 file:py-1.5 file:text-white  "
            />
          )}
        </Field>
      </section>

      {state.error && (
        <p className="text-sm rounded border border-gob-danger bg-gob-danger/10 px-3 py-2 text-gob-danger   ">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded bg-gob-primary text-white   disabled:opacity-50"
      >
        {isPending ? "Finalizando adopción…" : "Finalizar adopción"}
      </button>
    </form>
  );
}
