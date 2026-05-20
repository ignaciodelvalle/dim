"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
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
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
        Chip actual:{" "}
        <span className="font-mono font-medium text-neutral-900 dark:text-neutral-50">
          {currentChip}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className={labelClass}>
          Motivo del reemplazo<span className="text-red-500 ml-0.5">*</span>
        </p>
        <div className="flex flex-col gap-2">
          {ADMIN_REASONS.map((r) => (
            <label key={r.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="reason"
                value={r.value}
                required
                onChange={() => setSelectedReason(r.value)}
                className="mt-0.5 accent-neutral-900 dark:accent-neutral-50"
              />
              <span className="space-y-0.5">
                <span className="block text-sm text-neutral-900 dark:text-neutral-50">
                  {r.label}
                </span>
                {r.hint && (
                  <span className="block text-xs text-neutral-500 dark:text-neutral-500">
                    {r.hint}
                  </span>
                )}
              </span>
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
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Dejalo vacío para revocar sin reemplazar (válido para fraude, falla del dispositivo o
          solicitud del dueño/a).
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="replacedBy" className={labelClass}>
          Realizado por (opcional)
        </label>
        <input id="replacedBy" name="replacedBy" type="text" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="replacedAt" className={labelClass}>
          Fecha del reemplazo<span className="text-red-500 ml-0.5">*</span>
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
          Notas{isFraud && <span className="text-red-500 ml-0.5">*</span>}
          {!isFraud && " (opcional, máx. 300 caracteres)"}
          {isFraud && " — obligatorio para fraude detectado (máx. 300 caracteres)"}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          required={isFraud}
          maxLength={300}
          className={inputClass}
        />
      </div>

      {isFraud && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          Esta acción notifica a todos los administradores activos y abre un caso de investigación
          automáticamente.
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Guardando..." : "Registrar reemplazo de chip"}
      </button>
    </form>
  );
}
