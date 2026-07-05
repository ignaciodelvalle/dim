"use client";

import { LnField, LnSelect, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import {
  type TransferCustodyFormState,
  transferCustodyAction,
} from "@/src/modules/transfers/actions";
import { useActionState, useState } from "react";

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

  // Controlled field state — preserves typed input on validation error.
  const [notes, setNotes] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ln-op-mute">
          Destino
        </h2>
        <LnField
          label="Organización destino"
          required
          hint="Solo organizaciones verificadas. Si la que buscás no aparece, primero tiene que verificarse."
        >
          {({ id, describedBy, invalid }) => (
            <LnSelect
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
            </LnSelect>
          )}
        </LnField>

        <fieldset className="space-y-2">
          <legend className="text-sm text-ln-op-ink-2">Rol en el destino</legend>
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

        <LnField label="Notas">
          {({ id, describedBy, invalid }) => (
            <LnTextarea
              id={id}
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Motivo, condiciones especiales, contacto en el destino…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </LnField>
      </section>

      <p className="text-[11px] rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-ln-op-warn">
        Si el animal tiene tránsito activo, ese registro se cierra automáticamente y se notifica al
        tránsito.
      </p>

      {state.error && (
        <p className="text-sm rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
          {state.error}
        </p>
      )}

      <OpButton type="submit" disabled={isPending}>
        {isPending ? "Transfiriendo…" : "Transferir custodia"}
      </OpButton>
    </form>
  );
}
