"use client";

import { LnCheckbox, LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import {
  type FinalizeAdoptionFormState,
  finalizeAdoptionAction,
} from "@/src/modules/adoption/actions";
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
        <section className="rounded-[6px] border border-ln-op-ok-bd bg-ln-op-ok-bg p-4 space-y-3">
          <LnCheckbox
            id="use-foster-shortcut"
            checked={useFosterShortcut}
            onChange={(e) => setUseFosterShortcut(e.target.checked)}
          >
            <strong className="block text-[13px] text-ln-op-ok">
              Finalizar adopción al tránsito actual ({fosterShortcut.displayName})
            </strong>
            <span className="text-ln-op-ok text-[11px] block mt-1">
              El voluntario que está cuidando a esta mascota se convierte en dueño/a. Saltamos el
              paso de pedirte el DNI.
            </span>
          </LnCheckbox>
          {useFosterShortcut && (
            <input type="hidden" name="adopterUserId" value={fosterShortcut.adopterUserId} />
          )}
        </section>
      )}

      {!useFosterShortcut && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ln-op-mute">
            Adoptante
          </h2>
          <LnField
            label="DNI"
            required
            hint="Si la persona ya tiene cuenta MiMAR con ese DNI, la usamos. Si no, creamos un perfil preliminar que podrá reclamar más adelante."
          >
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="adopterDni"
                required={!useFosterShortcut}
                inputMode="numeric"
                placeholder="12345678"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LnField label="Nombre completo" required>
              {({ id, describedBy, invalid }) => (
                <LnInput
                  id={id}
                  name="adopterDisplayName"
                  required={!useFosterShortcut}
                  maxLength={200}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </LnField>
            <LnField label="Teléfono">
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="adopterPhone"
                  maxLength={30}
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
          </div>
        </section>
      )}

      <section className="space-y-3 pt-2 border-t border-ln-op-line">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ln-op-mute">
          Seguimiento
        </h2>
        <LnField
          label="Meses de seguimiento post-adopción"
          hint="Generará recordatorios de check-in con el adoptante (default: 6)."
        >
          {({ id, describedBy }) => (
            <LnInput
              id={id}
              name="followupMonths"
              type="number"
              min={0}
              max={36}
              defaultValue={6}
              aria-describedby={describedBy}
            />
          )}
        </LnField>
        <LnField label="Notas del contrato">
          {({ id, describedBy }) => (
            <LnTextarea
              id={id}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Condiciones especiales, observaciones, referencia al contrato firmado…"
              aria-describedby={describedBy}
            />
          )}
        </LnField>
        <LnField
          label="Contrato firmado (PDF o imagen)"
          hint="Si lo subís, queda enlazado al evento de adopción y al expediente del animal."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              name="contract"
              type="file"
              accept="application/pdf,image/*"
              aria-describedby={describedBy}
              className="block w-full text-[12px] text-ln-op-ink-2 file:mr-3 file:rounded-[4px] file:border-0 file:bg-ln-op-azul file:px-3 file:py-1.5 file:text-white file:text-[12px]"
            />
          )}
        </LnField>
      </section>

      {state.error && (
        <p className="text-[12px] rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700 disabled:opacity-50"
      >
        {isPending ? "Finalizando adopción…" : "Finalizar adopción"}
      </button>
    </form>
  );
}
