"use client";

import { useActionState, useState } from "react";

import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import {
  LnSheetAccordion,
  LnSheetBody,
  LnSheetFooter,
  LnSheetHeader,
  LnSubCard,
} from "@/components/ui/Sheet";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { BiteFormState } from "@/src/modules/surveillance/actions";

const initialState: BiteFormState = { error: null };
type FormAction = (prev: BiteFormState, formData: FormData) => Promise<BiteFormState>;
const FORM_ID = "bite-form";

export function BiteForm({
  action,
  petName,
}: {
  action: FormAction;
  petName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);
  const [victimKind, setVictimKind] = useState<"human" | "animal" | "unknown">("human");
  const [confirmObservation, setConfirmObservation] = useState(false);

  // Controlled field state
  const [occurredAt, setOccurredAt] = useState(today);
  const [locationDescription, setLocationDescription] = useState("");
  const [victimContactName, setVictimContactName] = useState("");
  const [victimContactPhone, setVictimContactPhone] = useState("");
  const [victimAgeEstimate, setVictimAgeEstimate] = useState("");
  const [severity, setSeverity] = useState("");
  const [context, setContext] = useState("");

  return (
    <>
      <LnSheetHeader
        tone="seal"
        icon="🦷"
        title="Reportar mordedura"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
          <LnField label="Fecha del incidente" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="occurredAt"
                type="date"
                required
                mono
                max={today}
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Lugar">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="locationDescription"
                type="text"
                placeholder="Ej: Plaza Italia, esquina Cerviño"
                value={locationDescription}
                onChange={(e) => setLocationDescription(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnSheetAccordion num="+" title="Provincia y localidad">
            <LocationFields mode="l1" />
          </LnSheetAccordion>

          {/* Victim kind — pill radio group */}
          <div className="flex flex-col gap-[6px]">
            <p className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
              ¿A quién mordió {petName}?{" "}
              <span className="text-[var(--color-ln-seal)]" aria-hidden="true">
                *
              </span>
            </p>
            <div className="grid grid-cols-3 gap-[6px]">
              {(
                [
                  { value: "human", label: "Persona" },
                  { value: "animal", label: "Otro animal" },
                  { value: "unknown", label: "No sé" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex cursor-pointer items-center justify-center rounded-[3px] border px-[10px] py-[8px]",
                    "font-[var(--font-ln-mono)] text-[11px] font-semibold transition-colors",
                    victimKind === opt.value
                      ? "border-[var(--color-ln-seal)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)]"
                      : "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-mute)]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="victimKind"
                    value={opt.value}
                    checked={victimKind === opt.value}
                    onChange={() => setVictimKind(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {victimKind === "human" && (
            <LnSubCard heading="Datos de la persona (opcionales)">
              <p className="text-[11.5px] text-[var(--color-ln-mute)]">
                Quedan en el registro para denuncia obligatoria si la autoridad sanitaria los pide.
              </p>
              <LnField label="Nombre">
                {({ id, describedBy, invalid }) => (
                  <LnInput
                    id={id}
                    name="victimContactName"
                    type="text"
                    value={victimContactName}
                    onChange={(e) => setVictimContactName(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </LnField>
              <LnField label="Teléfono">
                {({ id, describedBy, invalid }) => (
                  <LnInput
                    id={id}
                    name="victimContactPhone"
                    type="tel"
                    value={victimContactPhone}
                    onChange={(e) => setVictimContactPhone(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </LnField>
              <LnField label="Edad aproximada">
                {({ id, describedBy, invalid }) => (
                  <LnInput
                    id={id}
                    name="victimAgeEstimate"
                    type="text"
                    placeholder="Ej: niño, adulto, mayor"
                    value={victimAgeEstimate}
                    onChange={(e) => setVictimAgeEstimate(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </LnField>
            </LnSubCard>
          )}

          <LnField label="Severidad" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="severity"
                required
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="" disabled>
                  Elegí una opción
                </option>
                <option value="minor">Leve — sin sangrado, rasguño</option>
                <option value="moderate">Moderada — sangrado, requiere atención</option>
                <option value="severe">Grave — heridas profundas, hospital</option>
              </LnSelect>
            )}
          </LnField>
          <LnField label="Contexto">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="context"
                rows={3}
                placeholder="Ej: estaba jugando con el perro del vecino y se asustó cuando lo abrazaron."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>

          {/* Legal warning + observation checkbox */}
          <div className="rounded-[4px] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-050)] p-[14px]">
            <label className="flex cursor-pointer items-start gap-[10px]">
              <input
                type="checkbox"
                name="confirmObservation"
                value="true"
                required
                checked={confirmObservation}
                onChange={(e) => setConfirmObservation(e.target.checked)}
                className="mt-[2px] h-[14px] w-[14px] flex-shrink-0 accent-[var(--color-ln-warn)]"
              />
              <span className="text-[12.5px] font-semibold text-[var(--color-ln-warn)]">
                Entiendo que reportar esto inicia un período de observación antirrábica obligatorio
                de 10 días por ley (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987).
              </span>
            </label>
          </div>

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
        tone="seal"
        ctaLabel="Reportar mordedura"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
