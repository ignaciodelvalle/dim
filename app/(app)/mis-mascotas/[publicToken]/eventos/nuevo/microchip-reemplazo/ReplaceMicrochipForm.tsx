"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState } from "react";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

type ReasonOption = {
  value: string;
  label: string;
  hint?: string;
};

const OWNER_REASONS: ReasonOption[] = [
  { value: "damaged", label: "Chip dañado físicamente" },
  { value: "unreadable", label: "Chip ilegible o sin señal" },
  { value: "owner_request", label: "Solicitud del dueño/a" },
  { value: "device_failure", label: "Falla del dispositivo" },
  { value: "other", label: "Otro motivo" },
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
      <div className="rounded-lg border border-gob-border  bg-gob-surface-alt  px-4 py-3 text-sm text-gob-text-gray ">
        Chip actual: <span className="font-mono font-medium text-gob-text ">{currentChip}</span>
      </div>

      <div className="space-y-1.5">
        <p className={labelClass}>
          Motivo del reemplazo<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          {OWNER_REASONS.map((r) => (
            <label key={r.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="reason"
                value={r.value}
                required
                className="mt-0.5 accent-neutral-900 "
              />
              <span className="text-sm text-gob-text ">{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="newChipNumber" className={labelClass}>
          Nuevo número de microchip
        </label>
        <input
          id="newChipNumber"
          name="newChipNumber"
          type="text"
          placeholder="985141004321456"
          className={inputClass}
        />
        <p className="text-xs text-gob-text-muted ">
          Dejalo vacío si solo se revoca el chip (válido para "Solicitud del dueño/a" o "Falla del
          dispositivo").
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="replacedBy" className={labelClass}>
          Realizado por (veterinario/a, opcional)
        </label>
        <input id="replacedBy" name="replacedBy" type="text" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="replacedAt" className={labelClass}>
          Fecha del reemplazo<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="replacedAt"
          name="replacedAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas (opcional, máx. 300 caracteres)
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={300} className={inputClass} />
      </div>

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
        {isPending ? "Guardando..." : "Confirmar reemplazo de chip"}
      </button>
    </form>
  );
}
