"use client";

import { useActionState, useState } from "react";

import type { EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const SUB_KINDS = [
  { value: "lab_work", label: "Análisis de laboratorio" },
  { value: "imaging", label: "Imagen / radiografía / ecografía" },
  { value: "surgery", label: "Cirugía" },
  { value: "allergy_detection", label: "Detección de alergia" },
  { value: "other", label: "Otro" },
] as const;

type SubKind = (typeof SUB_KINDS)[number]["value"];

const TITLE_PLACEHOLDERS: Record<SubKind, string> = {
  lab_work: "Hemograma completo",
  imaging: "Radiografía de tórax",
  surgery: "Castración",
  allergy_detection: "Alergia alimentaria detectada",
  other: "Descripción breve",
};

export function ClinicalInfoForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const [subKind, setSubKind] = useState<SubKind>("lab_work");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      {/* Sub-kind */}
      <div className="space-y-1.5">
        <label htmlFor="subKind" className={labelClass}>
          Tipo<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <select
          id="subKind"
          name="subKind"
          required
          value={subKind}
          onChange={(e) => setSubKind(e.target.value as SubKind)}
          className={inputClass}
        >
          {SUB_KINDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="title" className={labelClass}>
          Título / nombre<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder={TITLE_PLACEHOLDERS[subKind]}
          className={inputClass}
        />
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <label htmlFor="details" className={labelClass}>
          Detalles, resultados, observaciones
        </label>
        <textarea
          id="details"
          name="details"
          rows={4}
          placeholder="Resultados, valores de referencia, comentarios del veterinario…"
          className={inputClass}
        />
      </div>

      {/* Performed by */}
      <div className="space-y-1.5">
        <label htmlFor="performedBy" className={labelClass}>
          Realizado por (vet / clínica)
        </label>
        <input
          id="performedBy"
          name="performedBy"
          type="text"
          placeholder="Dr. García · Clínica Veterinaria X"
          className={inputClass}
        />
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas adicionales
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Cualquier detalle extra que quieras recordar…"
          className={inputClass}
        />
      </div>

      <details className="rounded-lg border border-gob-border  p-3">
        <summary className="text-sm font-medium text-gob-text-gray  cursor-pointer">
          Ubicación (opcional)
        </summary>
        <div className="mt-3">
          <LocationFields mode="l1" />
        </div>
      </details>

      <AttachmentField />

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
        {isPending ? "Guardando..." : "Guardar información clínica"}
      </button>
    </form>
  );
}
