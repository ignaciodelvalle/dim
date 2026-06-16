"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/Icon";
import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSheetAccordion, LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "clinical-info-form";

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

  // Controlled field state
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [occurredAt, setOccurredAt] = useState(today);
  const [notes, setNotes] = useState("");

  return (
    <>
      <LnSheetHeader
        tone="azul"
        icon={<Icon name="clinico" decorative />}
        title="Información clínica"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Tipo" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
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
              </LnSelect>
            )}
          </LnField>
          <LnField label="Título / nombre" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="title"
                type="text"
                required
                placeholder={TITLE_PLACEHOLDERS[subKind]}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Detalles, resultados, observaciones">
            {({ id, describedBy }) => (
              <LnTextarea
                id={id}
                name="details"
                rows={4}
                placeholder="Resultados, valores de referencia, comentarios del veterinario…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>
          <LnField label="Realizado por (vet / clínica)">
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="performedBy"
                type="text"
                placeholder="Dr. García · Clínica Veterinaria X"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>
          <LnField label="Fecha" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="occurredAt"
                type="date"
                required
                mono
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Notas adicionales">
            {({ id, describedBy }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                placeholder="Cualquier detalle extra que quieras recordar…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>
          <LnSheetAccordion num="+" title="Ubicación">
            <LocationFields mode="l1" />
          </LnSheetAccordion>
          <AttachmentField />
          {state.error && (
            <p
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
            >
              {state.error}
            </p>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="azul"
        ctaLabel="Guardar información clínica"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
