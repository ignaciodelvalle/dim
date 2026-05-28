"use client";

import { type TransferCustodyFormState, transferCustodyAction } from "@/app/actions/transfer";
import { useActionState } from "react";

const initialState: TransferCustodyFormState = { error: null };

type DestinationOption = {
  id: string;
  displayName: string;
};

export function TransferCustodyForm({
  orgToken,
  publicToken,
  destinations,
}: {
  orgToken: string;
  publicToken: string;
  destinations: DestinationOption[];
}) {
  const action = transferCustodyAction.bind(null, orgToken, publicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gob-text-muted">
          Destino
        </h2>
        <label className="block space-y-1">
          <span className="text-sm">Organización destino *</span>
          <select
            name="destinationOrgId"
            required
            defaultValue=""
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2"
          >
            <option value="" disabled>
              Elegí una organización…
            </option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gob-text-muted">
            Solo organizaciones verificadas. Si la que buscás no aparece, primero tiene que
            verificarse.
          </span>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm">Rol en el destino</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="newRole"
              value="shelter_custody"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">Custodia temporal</span>
              <span className="block text-xs text-gob-text-muted">
                El destino se hace cargo con vistas a rehoming (igual que un intake).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="newRole" value="owner" className="mt-1" />
            <span>
              <span className="block text-sm font-medium">Dueño/a permanente</span>
              <span className="block text-xs text-gob-text-muted">
                El destino mantiene al animal indefinidamente (santuario, decomiso sin rehoming).
              </span>
            </span>
          </label>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm">Notas</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Motivo, condiciones especiales, contacto en el destino…"
            className="w-full rounded border border-gob-border-strong  bg-white  px-3 py-2"
          />
        </label>
      </section>

      <p className="text-xs rounded border border-gob-warning bg-gob-warning/10 px-3 py-2 text-gob-warning-text   ">
        Si el animal tiene tránsito activo, ese registro se cierra automáticamente y se notifica al
        tránsito.
      </p>

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
        {isPending ? "Transfiriendo…" : "Transferir custodia"}
      </button>
    </form>
  );
}
