"use client";

import { Field, Input, Radio, Textarea } from "@/components/poncho";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

type ReasonOption = {
  value: string;
  label: string;
  hint?: string;
};

const VET_REASONS: ReasonOption[] = [
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
];

export function ReplaceMicrochipForm({
  action,
  currentChip,
}: {
  action: FormAction;
  currentChip: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-[6px] border border-ln-op-line bg-ln-op-stripe px-4 py-3 text-[13px] text-ln-op-ink-2">
        Chip actual: <span className="font-mono font-medium text-ln-op-ink">{currentChip}</span>
      </div>

      <div className="space-y-1.5">
        <p className="block mb-2.5 text-[0.88em] font-semibold text-ln-op-mute">
          Motivo del reemplazo<span className="text-ln-op-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          {VET_REASONS.map((r) => (
            <Radio key={r.value} name="reason" value={r.value} required>
              <span className="space-y-0.5">
                {r.label}
                {r.hint && <span className="block text-xs! text-ln-op-mute!">{r.hint}</span>}
              </span>
            </Radio>
          ))}
        </div>
      </div>

      <Field
        label="Nuevo número de microchip"
        help='Dejalo vacío si solo se revoca el chip (válido para "Solicitud del dueño/a" o "Falla del dispositivo").'
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

      <Field label="Notas" help="Máx. 300 caracteres.">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            maxLength={300}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state.error && (
        <p className="text-[13px] text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[6px] bg-ln-op-azul text-white font-medium hover:bg-ln-op-azul-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar reemplazo de chip"}
      </button>
    </form>
  );
}
