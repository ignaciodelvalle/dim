"use client";

import { type FinalizeAdoptionFormState, finalizeAdoptionAction } from "@/app/actions/adoption";
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
        <section className="rounded-lg border border-gob-success/30 bg-gob-success/10 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <input
              id="use-foster-shortcut"
              type="checkbox"
              checked={useFosterShortcut}
              onChange={(e) => setUseFosterShortcut(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <label htmlFor="use-foster-shortcut" className="text-sm cursor-pointer">
              <strong className="block text-gob-text">
                Finalizar adopción al tránsito actual ({fosterShortcut.displayName})
              </strong>
              <span className="text-gob-text-gray text-xs block mt-1">
                El voluntario que está cuidando a esta mascota se convierte en dueño/a. Saltamos el
                paso de pedirte el DNI.
              </span>
            </label>
          </div>
          {useFosterShortcut && (
            <input type="hidden" name="adopterUserId" value={fosterShortcut.adopterUserId} />
          )}
        </section>
      )}

      {!useFosterShortcut && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Adoptante
          </h2>
          <label className="block space-y-1">
            <span className="text-sm">DNI *</span>
            <input
              name="adopterDni"
              required={!useFosterShortcut}
              inputMode="numeric"
              placeholder="12345678"
              className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
            />
            <span className="block text-xs text-neutral-500">
              Si la persona ya tiene cuenta MiMAR con ese DNI, la usamos. Si no, creamos un perfil
              preliminar que podrá reclamar más adelante.
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Nombre completo *</span>
              <input
                name="adopterDisplayName"
                required={!useFosterShortcut}
                maxLength={200}
                className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Teléfono</span>
              <input
                name="adopterPhone"
                maxLength={30}
                className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
              />
            </label>
          </div>
        </section>
      )}

      <section className="space-y-3 pt-2 border-t border-gob-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Seguimiento
        </h2>
        <label className="block space-y-1">
          <span className="text-sm">Meses de seguimiento post-adopción</span>
          <input
            name="followupMonths"
            type="number"
            min={0}
            max={36}
            defaultValue={6}
            className="rounded border border-gob-border-strong bg-white px-3 py-2"
          />
          <span className="block text-xs text-neutral-500">
            Generará recordatorios de check-in con el adoptante (default: 6).
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Notas del contrato</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={500}
            className="w-full rounded border border-gob-border-strong bg-white px-3 py-2"
            placeholder="Condiciones especiales, observaciones, referencia al contrato firmado…"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Contrato firmado (PDF o imagen)</span>
          <input
            name="contract"
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-sm text-gob-text-gray file:mr-3 file:rounded file:border-0 file:bg-gob-primary file:px-3 file:py-1.5 file:text-white"
          />
          <span className="block text-xs text-neutral-500">
            Opcional. Si lo subís, queda enlazado al evento de adopción y al expediente del animal.
          </span>
        </label>
      </section>

      {state.error && (
        <p className="text-sm rounded border border-gob-danger/30 bg-gob-danger/10 px-3 py-2 text-gob-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded bg-gob-primary text-white disabled:opacity-50"
      >
        {isPending ? "Finalizando adopción…" : "Finalizar adopción"}
      </button>
    </form>
  );
}
