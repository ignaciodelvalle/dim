"use client";

// VaccinationForm — Libreta Nacional redesign (green tone, §8 handoff).
// Presentation ONLY: action, useActionState wiring, field names, and submit
// logic are untouched.

import { Icon } from "@/components/Icon";
import { LnCallout } from "@/components/ui/DocElements";
import { LnField, LnInput, LnRow, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import { findVaccineByName, vaccinesForSpecies } from "@/lib/reference/lookups";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { useFormErrorFocus } from "@/lib/ui/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const FORM_ID = "vaccination-form";

export function VaccinationForm({
  action,
  species,
  initialVaccineName,
  sourceReminderId,
  defaults,
}: {
  action: FormAction;
  species: string;
  initialVaccineName?: string;
  sourceReminderId?: string;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  // N3 redirect contract: the action returns `redirectTo` on success and the
  // form performs the full document navigation (see lib/ui/use-action-redirect.ts).
  useActionRedirect(state.redirectTo);
  // Wave 2 Item 9: focus error region on submit failure (mobile a11y)
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();
  const vaccines = vaccinesForSpecies(species);
  const today = new Date().toISOString().slice(0, 10);

  const [vaccineName, setVaccineName] = useState(initialVaccineName ?? "");
  const [nextDueAt, setNextDueAt] = useState("");
  const [nextDueOverridden, setNextDueOverridden] = useState(false);
  const [occurredAt, setOccurredAt] = useState(defaults?.occurredAt ?? today);
  const [brand, setBrand] = useState("");
  const [batch, setBatch] = useState("");
  const [administeredBy, setAdministeredBy] = useState("");
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  const suggestedNextDue = useMemo(() => {
    const def = findVaccineByName(vaccineName);
    if (!def || !def.intervalMonths) return "";
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + def.intervalMonths);
    return d.toISOString().slice(0, 10);
  }, [vaccineName]);

  const effectiveNextDue = nextDueOverridden ? nextDueAt : suggestedNextDue || nextDueAt;

  return (
    <>
      <LnSheetHeader
        tone="verde"
        icon={<Icon name="vacuna" decorative />}
        title="Registrar vacuna"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          {sourceReminderId && (
            <input type="hidden" name="sourceReminderId" value={sourceReminderId} />
          )}

          <LnField label="Vacuna" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="vaccineName"
                type="text"
                required
                list="vaccine-options"
                placeholder="Empezá a tipear o elegí…"
                autoComplete="off"
                value={vaccineName}
                onChange={(e) => setVaccineName(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <datalist id="vaccine-options">
            {vaccines.map((v) => (
              <option key={v.name} value={v.name} />
            ))}
          </datalist>

          <LnRow>
            <LnField label="Fecha de aplicación" required>
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
            <LnField
              label="Próxima dosis"
              hint={
                !nextDueOverridden && suggestedNextDue
                  ? "Sugerencia automática según catálogo."
                  : undefined
              }
            >
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="nextDueAt"
                  type="date"
                  mono
                  value={effectiveNextDue}
                  onChange={(e) => {
                    setNextDueOverridden(true);
                    setNextDueAt(e.target.value);
                  }}
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
          </LnRow>

          <LnRow>
            <LnField label="Marca / laboratorio">
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
            <LnField label="Lote">
              {({ id, describedBy }) => (
                <LnInput
                  id={id}
                  name="batch"
                  type="text"
                  mono
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
          </LnRow>

          <LnField label="Aplicada por (vet / clínica)">
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="administeredBy"
                type="text"
                value={administeredBy}
                onChange={(e) => setAdministeredBy(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>

          <LnCallout tone="azul" title="Asiento certificable">
            Este registro queda firmado digitalmente en la libreta oficial. Si la aplicó un
            veterinario matriculado y agregás su nombre, el asiento puede certificarse como oficial.
          </LnCallout>

          <LnField label="Notas">
            {({ id, describedBy }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>

          <AttachmentField />

          {state.error && (
            <p
              ref={errorRef}
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
              // Wave 2 Item 9: tabIndex={-1} makes the element programmatically focusable
              tabIndex={-1}
            >
              {state.error}
            </p>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="verde"
        ctaLabel="Registrar vacuna"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
