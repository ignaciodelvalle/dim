"use client";

// CrearConsultorioForm — 3-step wizard.
// Trilogy unification handoff §4 PR-031.
//
// Steps:
//   1. Legales — name + razón social + CUIT (opcional). CTA Continuar.
//   2. Contacto — email + teléfono. CTA Continuar.
//   3. Ubicación — LocationFields L1. CTA Crear consultorio.
//
// createClinicAction (sprint 4 PR-035) accepts both the new L1 wire names
// (provinceCode / localityName) and the legacy free-text aliases.

import { useActionState, useRef, useState } from "react";

import { type UpgradeFormState, createClinicAction } from "@/app/actions/upgrade";
import { LocationFields } from "@/components/LocationFields";
import { LnInput } from "@/components/ui/Field";
import { LnWizardShell } from "@/components/ui/WizardShell";

const initialState: UpgradeFormState = { error: null };

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Datos legales", "Contacto", "Ubicación"];

export function CrearConsultorioForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createClinicAction, initialState);
  const [step, setStep] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);

  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-[4px] border border-[var(--color-ln-warn)] bg-[#fdf2e0] p-4 space-y-2">
        <p className="text-sm font-medium text-[var(--color-ln-warn)]">
          Antes de crear tu consultorio, verificá tu DNI.
        </p>
        <p className="text-xs text-[var(--color-ln-warn)]">
          MiMAR requiere que tu identidad esté verificada para crear una organización.
        </p>
        <a
          href={state.prereqUrl}
          className="inline-block mt-1 px-4 py-2 rounded-[3px] bg-[var(--color-ln-warn)] hover:opacity-90 text-white text-sm font-medium transition-colors"
        >
          Verificar DNI →
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction}>
      <LnWizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {/* Step 1 — Legales */}
        <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
          <Field
            id="name"
            name="name"
            type="text"
            label="Nombre del consultorio"
            hint="Nombre público que verán los dueños de mascotas."
            defaultValue={defaultName}
            required
          />
          <Field
            id="legalName"
            name="legalName"
            type="text"
            label="Razón social"
            hint="Nombre legal completo (puede ser el mismo que el nombre del consultorio)."
            defaultValue={defaultName}
            required
          />
          <Field
            id="cuit"
            name="cuit"
            type="text"
            label="CUIT (opcional)"
            hint="11 dígitos sin guiones. Ej: 20712345679"
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Continuar
          </button>
        </section>

        {/* Step 2 — Contacto */}
        <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
          <Field
            id="email"
            name="email"
            type="email"
            label="Correo electrónico de contacto"
            required
          />
          <Field id="phone" name="phone" type="tel" label="Teléfono (opcional)" />
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Continuar
          </button>
        </section>

        {/* Step 3 — Ubicación L1 */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <p className="block text-sm font-medium text-[var(--color-ln-ink)]">
              Jurisdicción donde ejercés
            </p>
            <p className="text-xs text-[var(--color-ln-mute)] mb-2">
              Para enrutar la verificación al govt correspondiente.
            </p>
            <LocationFields mode="l1" />
          </div>

          {state.error && (
            <p className="text-sm text-[var(--color-ln-err)]" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Creando consultorio..." : "Crear consultorio"}
          </button>
        </section>
      </LnWizardShell>
    </form>
  );
}

function Field({
  id,
  name,
  type,
  label,
  required,
  hint,
  defaultValue,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-ln-ink)]">
        {label}
      </label>
      <LnInput id={id} name={name} type={type} required={required} defaultValue={defaultValue} />
      {hint && <p className="text-xs text-[var(--color-ln-mute)]">{hint}</p>}
    </div>
  );
}
