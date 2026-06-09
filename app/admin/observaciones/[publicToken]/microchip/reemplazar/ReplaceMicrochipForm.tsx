"use client";

import { Field, Input, Radio, Textarea } from "@/components/poncho";
import type { EventFormState } from "@/src/modules/events/actions";
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
      {/* Current chip info row */}
      <div className="rounded-[4px] border border-ln-op-line bg-ln-op-stripe px-4 py-3 text-[12px] text-ln-op-ink-2">
        Chip actual: <span className="font-mono font-semibold text-ln-op-ink">{currentChip}</span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-ln-op-ink-2">
          Motivo del reemplazo
          <span className="ml-0.5 text-ln-op-danger">*</span>
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
                <span>{r.label}</span>
                {r.hint && <span className="block text-[11px] text-ln-op-mute">{r.hint}</span>}
              </span>
            </Radio>
          ))}
        </div>
      </div>

      <Field
        label="Nuevo número de microchip"
        help="Dejálo vacío para revocar sin reemplazar (válido para fraude, falla del dispositivo o solicitud del dueño/a)."
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
        <div
          className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-4 py-3 text-[12px] text-ln-op-danger"
          role="alert"
        >
          Esta acción notifica a todos los administradores activos y abre un caso de investigación
          automáticamente.
        </div>
      )}

      {state.error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-[6px] bg-ln-op-navy px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Registrar reemplazo de chip"}
      </button>
    </form>
  );
}
