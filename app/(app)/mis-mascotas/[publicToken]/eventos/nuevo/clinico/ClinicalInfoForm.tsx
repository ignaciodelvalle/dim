"use client";

import type { EventFormState } from "@/app/actions/events";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState, useState } from "react";
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
  const [subKind, setSubKind] = useState<SubKind>("lab_work");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      {/* Sub-kind */}
      <div className="space-y-1.5">
        <label htmlFor="subKind" className={labelClass}>
          Tipo<span className="text-red-500 ml-0.5">*</span>
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
          Título / nombre<span className="text-red-500 ml-0.5">*</span>
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
          Fecha<span className="text-red-500 ml-0.5">*</span>
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

      <AttachmentField />

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
        {isPending ? "Guardando..." : "Guardar información clínica"}
      </button>
    </form>
  );
}
