"use client";

import { useActionState, useState } from "react";

import type { EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { Field, Input, Select, Textarea } from "@/components/poncho";
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
      <Field label="Tipo" required>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="subKind"
            required
            value={subKind}
            onChange={(e) => setSubKind(e.target.value as SubKind)}
            aria-describedby={describedBy}
            invalid={invalid}
          >
            {SUB_KINDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* Title */}
      <Field label="Título / nombre" required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="title"
            type="text"
            required
            placeholder={TITLE_PLACEHOLDERS[subKind]}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {/* Details */}
      <Field label="Detalles, resultados, observaciones">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name="details"
            rows={4}
            placeholder="Resultados, valores de referencia, comentarios del veterinario…"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {/* Performed by */}
      <Field label="Realizado por (vet / clínica)">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="performedBy"
            type="text"
            placeholder="Dr. García · Clínica Veterinaria X"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {/* Date */}
      <Field label="Fecha" required>
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

      {/* Notes */}
      <Field label="Notas adicionales">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name="notes"
            rows={3}
            placeholder="Cualquier detalle extra que quieras recordar…"
            aria-describedby={describedBy}
          />
        )}
      </Field>

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
