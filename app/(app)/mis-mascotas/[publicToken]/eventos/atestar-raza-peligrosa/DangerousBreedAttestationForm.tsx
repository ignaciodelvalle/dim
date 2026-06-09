"use client";

import { Radio } from "@/components/poncho";
import { LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { LnSheetBody, LnSheetFooter, LnSheetHeader } from "@/components/ui/Sheet";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState, useState } from "react";
import { AttachmentField } from "../nuevo/AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "dangerous-breed-attestation-form";

const REGISTRY_OPTIONS: Array<{ value: string; label: string; help: string }> = [
  {
    value: "caba_4078",
    label: "CABA · Ley 4078",
    help: "Registro de la Ciudad Autónoma de Buenos Aires.",
  },
  {
    value: "prov_14107",
    label: "Provincia de Buenos Aires · Ley 14.107",
    help: "Registro provincial bonaerense.",
  },
  {
    value: "other",
    label: "Otro registro",
    help: "Si la mascota está en otra provincia, indicalo en las notas.",
  },
];

export function DangerousBreedAttestationForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [registry, setRegistry] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LnSheetHeader
        tone="warn"
        icon="⚠️"
        title="Atestar raza peligrosa"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          {/* Registry radio group */}
          <div className="flex flex-col gap-[6px]">
            <p className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
              Registro{" "}
              <span className="text-[var(--color-ln-seal)]" aria-hidden="true">
                *
              </span>
            </p>
            <div className="flex flex-col gap-[6px]">
              {REGISTRY_OPTIONS.map((opt) => (
                <Radio
                  key={opt.value}
                  name="registry"
                  value={opt.value}
                  required
                  checked={registry === opt.value}
                  onChange={(e) => setRegistry(e.target.value)}
                >
                  <span className="flex flex-col gap-[1px]">
                    {opt.label}
                    <span className="text-[11px] text-[var(--color-ln-mute)]">{opt.help}</span>
                  </span>
                </Radio>
              ))}
            </div>
          </div>

          <LnField label="Nº de registro / expediente">
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="registryId"
                type="text"
                placeholder="Si tenés el número a mano"
                aria-describedby={describedBy}
                invalid={invalid}
                mono
              />
            )}
          </LnField>
          <LnField label="Fecha de atestación" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="attestedAt"
                type="date"
                required
                mono
                defaultValue={today}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Notas">
            {({ id, describedBy, invalid }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                placeholder="Detalles, si querés agregar"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
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
        tone="warn"
        ctaLabel="Registrar atestación"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
