"use client";

import { Field, Input, Select, Textarea } from "@/components/poncho";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

type OpenMedication = {
  id: string;
  drugName: string;
  startedDate: string; // pre-formatted label
};

export function MedicationEndForm({
  action,
  openMedications,
}: {
  action: FormAction;
  openMedications: OpenMedication[];
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <Field label="Medicación a cerrar" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="medicationStartedEventId"
            required
            defaultValue=""
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="" disabled>
              Seleccioná un medicamento...
            </option>
            {openMedications.map((med) => (
              <option key={med.id} value={med.id}>
                {med.drugName} · iniciado {med.startedDate}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Fecha de fin" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="occurredAt"
            type="date"
            required
            defaultValue={today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Motivo">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="reason"
            type="text"
            placeholder="Tratamiento completo, efectos adversos..."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Notas">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <AttachmentField />

      {state.error && (
        <p className="text-sm text-gob-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Confirmar cierre de medicación"}
      </button>
    </form>
  );
}
