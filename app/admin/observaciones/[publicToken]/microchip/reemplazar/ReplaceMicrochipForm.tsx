"use client";

import type { EventFormState } from "@/app/actions/events";
import { Field, Input, Radio, Textarea } from "@/components/poncho";
import { useActionState, useState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

type ReasonOption = {
  value: string;
  label: string;
  hint?: string;
};

const ADMIN_REASONS: ReasonOption[] = [
  { value: "damaged", label: "Chip dañado físicamente" },
  { value: "unreadable", label: "Chip ilegible o sin señal" },
  { value: "owner_request", label: "Solicitud del dueño/a" },
  { value: "device_failure", label: "Falla del dispositivo" },
  { value: "other", label: "Otro motivo" },
  {
    value: "duplicate_detected",
    label: "Chip duplicado detectado",
    hint: "El chip ya está registrado en otra mascota — abre un caso de investigación automáticamente.",
  },
  {
    value: "fraud_detected",
    label: "Fraude detectado",
    hint: "Requiere una nota obligatoria que justifique la decisión.",
  },
];

export function ReplaceMicrochipForm({
  action,
  currentChip,
}: {
  action: FormAction;
  currentChip: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const isFraud = selectedReason === "fraud_detected";

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-lg border border-gob-border  bg-gob-surface-alt  px-4 py-3 text-sm text-gob-text-gray ">
        Chip actual: <span className="font-mono font-medium text-gob-text ">{currentChip}</span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[0.88em] font-semibold text-gob-text-muted">
          Motivo del reemplazo<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          {ADMIN_REASONS.map((r) => (
            <Radio
              key={r.value}
              name="reason"
              value={r.value}
              required
              onChange={() => setSelectedReason(r.value)}
            >
              <span className="space-y-0.5">
                {r.label}
                {r.hint && <span className="block text-xs! text-gob-text-muted!">{r.hint}</span>}
              </span>
            </Radio>
          ))}
        </div>
      </div>

      <Field
        label="Nuevo número de microchip"
        help="Dejalo vacío para revocar sin reemplazar (válido para fraude, falla del dispositivo o solicitud del dueño/a)."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="newChipNumber"
            type="text"
            placeholder="985141004321456"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Realizado por">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="replacedBy"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field label="Fecha del reemplazo" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="replacedAt"
            type="date"
            required
            defaultValue={today}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        label="Notas"
        required={isFraud}
        help={
          isFraud
            ? "Obligatorio para fraude detectado (máx. 300 caracteres)."
            : "Opcional — máx. 300 caracteres."
        }
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            rows={4}
            required={isFraud}
            maxLength={300}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {isFraud && (
        <div className="rounded-lg border border-gob-danger  bg-gob-danger/10  px-4 py-3 text-sm text-gob-danger ">
          Esta acción notifica a todos los administradores activos y abre un caso de investigación
          automáticamente.
        </div>
      )}

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar reemplazo de chip"}
      </button>
    </form>
  );
}
