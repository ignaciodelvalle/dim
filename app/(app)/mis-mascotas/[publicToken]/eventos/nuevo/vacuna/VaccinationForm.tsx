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
import { todayIsoInAr } from "@/lib/utils/format";
import type { EventFormState } from "@/src/modules/events/actions";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const today = todayIsoInAr();

  const formRef = useRef<HTMLFormElement>(null);

  // P4 item 4 — SUSPICIOUS same-day duplicate warn (non-blocking). Mirrors the
  // P2 soft-dedupe pattern in MinimalNewPetForm.tsx: the action returns a
  // sameDayPrompt state instead of inserting; confirming sets the override
  // hidden input and resubmits the SAME form (all fields stay controlled, so
  // nothing is lost across the round trip).
  const [overrideSameDay, setOverrideSameDay] = useState(false);
  const resubmitAfterOverride = useRef(false);

  useEffect(() => {
    if (overrideSameDay && resubmitAfterOverride.current) {
      resubmitAfterOverride.current = false;
      formRef.current?.requestSubmit();
    }
  }, [overrideSameDay]);

  function confirmSameDay() {
    resubmitAfterOverride.current = true;
    setOverrideSameDay(true);
  }

  const sameDayPrompt = !overrideSameDay ? state.sameDayPrompt : undefined;

  const [vaccineName, setVaccineName] = useState(initialVaccineName ?? "");
  // Controlled suggestion list. The field WAS a native <input list>+<datalist>,
  // whose popup never opened reliably for a human tester (Cowork B10 — and some
  // browsers/devices, e.g. iOS Safari, never render datalist suggestions at all).
  // A real app-controlled combobox opens on focus and filters as you type; free
  // text stays allowed (the input value is untouched).
  const [vaccineOpen, setVaccineOpen] = useState(false);
  const vaccineMatches = useMemo(() => {
    const q = vaccineName.trim().toLowerCase();
    if (!q) return vaccines;
    return vaccines.filter((v) => v.name.toLowerCase().includes(q));
  }, [vaccineName, vaccines]);
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
        <form id={FORM_ID} ref={formRef} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="sameDayOverride" value={overrideSameDay ? "1" : "0"} />
          {sourceReminderId && (
            <input type="hidden" name="sourceReminderId" value={sourceReminderId} />
          )}

          <LnField label="Vacuna" required>
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <LnInput
                  id={id}
                  name="vaccineName"
                  type="text"
                  required
                  // Mirrors the LocalityPickerAcross combobox pattern (a11y-lint
                  // clean): aria-autocomplete + aria-expanded on the input, a plain
                  // ul/li/button menu below (no listbox/option roles).
                  aria-autocomplete="list"
                  aria-expanded={vaccineOpen && vaccineMatches.length > 0}
                  placeholder="Empezá a tipear o elegí…"
                  autoComplete="off"
                  value={vaccineName}
                  onFocus={() => setVaccineOpen(true)}
                  // Delay close so a click/tap on an option registers before the
                  // list unmounts (the option uses onMouseDown, which fires first).
                  onBlur={() => window.setTimeout(() => setVaccineOpen(false), 120)}
                  onChange={(e) => {
                    setVaccineName(e.target.value);
                    setVaccineOpen(true);
                  }}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
                {vaccineOpen && vaccineMatches.length > 0 && (
                  <ul className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] py-1 shadow-lg">
                    {vaccineMatches.map((v) => (
                      <li key={v.name}>
                        <button
                          type="button"
                          // onMouseDown (not onClick) so selection fires BEFORE the
                          // input's onBlur closes the list; preventDefault keeps focus.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setVaccineName(v.name);
                            setVaccineOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[var(--text-sm)] text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)]"
                        >
                          <span>{v.name}</span>
                          {v.isCore && (
                            <span className="font-[var(--font-ln-mono)] text-[var(--text-xs)] uppercase tracking-wide text-[var(--color-ln-mute)]">
                              Núcleo
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </LnField>

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

          {sameDayPrompt && (
            <LnCallout tone="warn" title="¿Registrar de nuevo?">
              <p className="m-0" role="alert">
                {sameDayPrompt.message}
              </p>
            </LnCallout>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="verde"
        ctaLabel="Registrar vacuna"
        formId={FORM_ID}
        isPending={isPending}
        customCta={
          sameDayPrompt ? (
            <button
              type="button"
              onClick={confirmSameDay}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn)] px-4 py-2 text-[var(--text-sm)] font-semibold text-white transition-colors hover:opacity-90 active:scale-[0.98] active:opacity-90"
            >
              Sí, registrar otra igual
            </button>
          ) : undefined
        }
      />
    </>
  );
}
