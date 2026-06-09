"use client";

import { Field, Select, Textarea } from "@/components/poncho";
import {
  type TransferCustodyFormState,
  transferCustodyAction,
} from "@/src/modules/transfers/actions";
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
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ln-op-mute">
          Destino
        </h2>
        <Field
          label="Organización destino"
          required
          help="Solo organizaciones verificadas. Si la que buscás no aparece, primero tiene que verificarse."
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="destinationOrgId"
              required
              defaultValue=""
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="" disabled>
                Elegí una organización…
              </option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-[12px] text-ln-op-ink-2">Rol en el destino</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="newRole"
              value="shelter_custody"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="block text-[13px] font-medium text-ln-op-ink">
                Custodia temporal
              </span>
              <span className="block text-[11px] text-ln-op-mute">
                El destino se hace cargo con vistas a rehoming (igual que un intake).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="newRole" value="owner" className="mt-1" />
            <span>
              <span className="block text-[13px] font-medium text-ln-op-ink">
                Dueño/a permanente
              </span>
              <span className="block text-[11px] text-ln-op-mute">
                El destino mantiene al animal indefinidamente (santuario, decomiso sin rehoming).
              </span>
            </span>
          </label>
        </fieldset>

        <Field label="Notas">
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Motivo, condiciones especiales, contacto en el destino…"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </section>

      <p className="text-[11px] rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-ln-op-warn">
        Si el animal tiene tránsito activo, ese registro se cierra automáticamente y se notifica al
        tránsito.
      </p>

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
        {isPending ? "Transfiriendo…" : "Transferir custodia"}
      </button>
    </form>
  );
}
