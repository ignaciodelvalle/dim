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
import { WizardShell } from "@/components/poncho/Wizard";
import { inputClass, labelClass } from "@/lib/form-classes";

const initialState: UpgradeFormState = { error: null };

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Datos legales", "Contacto", "Ubicación"];

export function CrearConsultorioForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createClinicAction, initialState);
  const [step, setStep] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);

  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-2">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Antes de crear tu consultorio, verificá tu DNI.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          MiMAR requiere que tu identidad esté verificada para crear una organización.
        </p>
        <a
          href={state.prereqUrl}
          className="inline-block mt-1 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-sm font-medium transition-colors"
        >
          Verificar DNI →
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction}>
      <WizardShell
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
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 transition-colors"
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
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 transition-colors"
          >
            Continuar
          </button>
        </section>

        {/* Step 3 — Ubicación L1 */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <p className={labelClass}>Jurisdicción donde ejercés</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-500 mb-2">
              Para enrutar la verificación al govt correspondiente.
            </p>
            <LocationFields mode="l1" />
          </div>

          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Creando consultorio..." : "Crear consultorio"}
          </button>
        </section>
      </WizardShell>
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
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={inputClass}
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
