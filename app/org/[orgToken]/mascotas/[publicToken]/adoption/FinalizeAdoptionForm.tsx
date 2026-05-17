"use client";

import { type FinalizeAdoptionFormState, finalizeAdoptionAction } from "@/app/actions/adoption";
import { useActionState } from "react";

const initialState: FinalizeAdoptionFormState = { error: null };

export function FinalizeAdoptionForm({ publicToken }: { publicToken: string }) {
  const action = finalizeAdoptionAction.bind(null, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Adoptante
        </h2>
        <label className="block space-y-1">
          <span className="text-sm">DNI *</span>
          <input
            name="adopterDni"
            required
            inputMode="numeric"
            placeholder="12345678"
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
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
              required
              maxLength={200}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Teléfono</span>
            <input
              name="adopterPhone"
              maxLength={30}
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
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
            className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
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
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
            placeholder="Condiciones especiales, observaciones, referencia al contrato firmado…"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Contrato firmado (PDF o imagen)</span>
          <input
            name="contract"
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-sm text-neutral-700 dark:text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-white dark:file:bg-white dark:file:text-neutral-900"
          />
          <span className="block text-xs text-neutral-500">
            Opcional. Si lo subís, queda enlazado al evento de adopción y al expediente del animal.
          </span>
        </label>
      </section>

      {state.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Finalizando adopción…" : "Finalizar adopción"}
      </button>
    </form>
  );
}
