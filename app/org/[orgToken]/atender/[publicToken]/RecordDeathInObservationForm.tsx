"use client";

// The veterinarian records a death during a rabies observation (PO decision D8,
// 2026-09-18). Server side: atenderRecordDeathInObservationAction.
//
// IRREVERSIBLE, so it takes two deliberate steps: the form stays folded behind
// its own button, and the submit stays disabled until the professional ticks
// the confirmation — which the server checks again (`confirmIrreversible`),
// because a disabled button is a courtesy, not a guard.
//
// The idempotency key is stable per mount, so a double click or a retry after a
// lost response resolves to the first death instead of writing a second one.

import { useActionState, useState } from "react";

import { LnCheckbox, LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import { deathCauseLabel, dispositionMethodLabel, isoDateInAr } from "@/lib/utils/format";
import type { EventFormState } from "@/src/modules/events/action-support";
import { DEATH_CAUSES, DISPOSITION_METHODS } from "@dim/contract/input";

type FormAction = (formData: FormData) => Promise<EventFormState>;

type DeathFormState = { error: string | null; navigating: boolean };

const INITIAL_STATE: DeathFormState = { error: null, navigating: false };

export function RecordDeathInObservationForm({
  action,
  petName,
}: {
  action: FormAction;
  petName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { key: idempotencyKey } = useIdempotencyKey();

  const [state, formAction, isPending] = useActionState(
    async (_prev: DeathFormState, formData: FormData): Promise<DeathFormState> => {
      const result = await action(formData);
      if (result.error) {
        setConfirmed(false);
        return { error: result.error, navigating: false };
      }
      if (result.redirectTo) {
        navigateAfterActionSuccess(result.redirectTo);
        return { error: null, navigating: true };
      }
      return { error: null, navigating: false };
    },
    INITIAL_STATE,
  );
  const busy = isPending || state.navigating;

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ln-op-mute">
          Si {petName} murió durante la observación, registrá el fallecimiento acá: cierra la
          observación y avisa de urgencia a la autoridad sanitaria, que puede necesitar tomar una
          muestra.
        </p>
        <OpButton type="button" variant="danger" block onClick={() => setOpen(true)}>
          Registrar muerte durante la observación
        </OpButton>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />

      <LnField label="Causa" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="cause"
            required
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="" disabled>
              Elegí una causa
            </option>
            {DEATH_CAUSES.map((cause) => (
              <option key={cause} value={cause}>
                {deathCauseLabel(cause)}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      <LnField label="Detalle de la causa">
        {({ id, describedBy, invalid }) => (
          <LnInput id={id} name="causeDetail" aria-describedby={describedBy} invalid={invalid} />
        )}
      </LnField>

      <LnField label="Fecha del fallecimiento" required>
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="occurredAt"
            type="date"
            required
            defaultValue={isoDateInAr(new Date())}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnCheckbox name="deathAtClinic" value="true">
        Falleció en esta veterinaria
      </LnCheckbox>

      <LnField
        label="Destino del cuerpo"
        hint="La autoridad sanitaria pregunta primero si el cuerpo sigue disponible para la muestra."
      >
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="dispositionMethod"
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">Sin registrar</option>
            {DISPOSITION_METHODS.map((method) => (
              <option key={method} value={method}>
                {dispositionMethodLabel(method)}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      <LnField label="Lugar (crematorio, cementerio, etc.)">
        {({ id, describedBy, invalid }) => (
          <LnInput id={id} name="facility" aria-describedby={describedBy} invalid={invalid} />
        )}
      </LnField>

      <LnField label="Notas">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="notes"
            rows={3}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <div className="space-y-2 rounded-[var(--radius-md)] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3">
        <p className="text-sm font-semibold text-ln-op-danger">Esto no se puede deshacer.</p>
        <p className="text-sm text-ln-op-danger">
          {petName} queda registrado como fallecido, la observación antirrábica se cierra con ese
          resultado y se avisa de urgencia a la autoridad sanitaria y a sus dueños.
        </p>
        <LnCheckbox
          name="confirmIrreversible"
          value="true"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          labelClassName="text-xs! text-ln-op-danger!"
        >
          Confirmo que {petName} falleció y que el registro es definitivo.
        </LnCheckbox>
      </div>

      {state.error && (
        <p className="text-sm text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <OpButton
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setConfirmed(false);
          }}
        >
          Cancelar
        </OpButton>
        <OpButton type="submit" variant="danger" disabled={busy || !confirmed} block>
          {busy ? "Registrando..." : "Registrar fallecimiento"}
        </OpButton>
      </div>
    </form>
  );
}
