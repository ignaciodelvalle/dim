"use client";

// ServiceOfferingForm — 3-step wizard for new service offering.
// Trilogy unification handoff §5 PR-046.
//
// Steps:
//   1. Tipo — kind + display name + description. CTA Continuar.
//   2. Capacidad — duration + slot capacity + price. CTA Continuar.
//   3. Elegibilidad — species + age range + submit. CTA Crear servicio.
//
// The handoff's third step was 'ubicación L2'; the current data model
// inherits location from the parent org so this PR keeps the 3 steps
// as content/capacity/eligibility instead. L2 per-offering location is
// deferred until the schema gains the field.

import { useActionState, useState } from "react";

import type { ServiceOfferingFormState } from "@/app/actions/service-offerings";
import { WizardShell } from "@/components/poncho/Wizard";
import type { ServiceKindDef } from "@/lib/service-kinds";

const INITIAL_STATE: ServiceOfferingFormState = { error: null };

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Tipo", "Capacidad", "Elegibilidad"];

const inputCls =
  "w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500";

export function ServiceOfferingForm({
  serviceKinds,
  createAction,
  orgToken,
}: {
  serviceKinds: readonly ServiceKindDef[];
  createAction: (
    prev: ServiceOfferingFormState,
    formData: FormData,
  ) => Promise<ServiceOfferingFormState>;
  orgToken: string;
}) {
  const [state, formAction, isPending] = useActionState(createAction, INITIAL_STATE);
  const [step, setStep] = useState(1);

  return (
    <form action={formAction}>
      <WizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {state.error && (
          <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {state.error}
          </p>
        )}

        {/* Step 1 — Tipo + nombre + descripción */}
        <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
          <div className="space-y-1">
            <label htmlFor="serviceKind" className="block text-sm font-medium">
              Tipo de servicio <span className="text-red-500">*</span>
            </label>
            <select id="serviceKind" name="serviceKind" required className={inputCls}>
              <option value="">— Seleccioná un tipo —</option>
              {serviceKinds.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="displayName" className="block text-sm font-medium">
              Nombre del servicio <span className="text-red-500">*</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              minLength={3}
              maxLength={120}
              placeholder="Ej: Vacunación antirrábica — campaña junio 2026"
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="block text-sm font-medium">
              Descripción <span className="text-neutral-400 font-normal">(opcional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              maxLength={500}
              rows={3}
              placeholder="Información adicional para quienes reserven el turno."
              className={`${inputCls} resize-none`}
            />
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full px-5 py-3 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
          >
            Continuar
          </button>
        </section>

        {/* Step 2 — Capacidad */}
        <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="durationMinutes" className="block text-sm font-medium">
                Duración (minutos) <span className="text-red-500">*</span>
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                required
                min={5}
                max={480}
                defaultValue={15}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="slotCapacity" className="block text-sm font-medium">
                Capacidad por turno <span className="text-red-500">*</span>
              </label>
              <input
                id="slotCapacity"
                name="slotCapacity"
                type="number"
                required
                min={1}
                max={100}
                defaultValue={1}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="priceArs" className="block text-sm font-medium">
              Precio (ARS){" "}
              <span className="text-neutral-400 font-normal">— vacío para campaña gratuita</span>
            </label>
            <input
              id="priceArs"
              name="priceArs"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              className={inputCls}
            />
          </div>

          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full px-5 py-3 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
          >
            Continuar
          </button>
        </section>

        {/* Step 3 — Elegibilidad + submit */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <span className="block text-sm font-medium">Especies elegibles</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="eligibilitySpecies" value="dog" defaultChecked />
                Perros
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="eligibilitySpecies" value="cat" defaultChecked />
                Gatos
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="eligibilityAgeMinMonths" className="block text-sm font-medium">
                Edad mínima (meses) <span className="text-neutral-400 font-normal">(opcional)</span>
              </label>
              <input
                id="eligibilityAgeMinMonths"
                name="eligibilityAgeMinMonths"
                type="number"
                min={0}
                max={360}
                placeholder="Sin mínimo"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="eligibilityAgeMaxMonths" className="block text-sm font-medium">
                Edad máxima (meses) <span className="text-neutral-400 font-normal">(opcional)</span>
              </label>
              <input
                id="eligibilityAgeMaxMonths"
                name="eligibilityAgeMaxMonths"
                type="number"
                min={0}
                max={360}
                placeholder="Sin máximo"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-5 py-3 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {isPending ? "Enviando…" : "Crear servicio"}
            </button>
            <a
              href={`/org/${orgToken}/servicios`}
              className="text-sm text-neutral-600 underline dark:text-neutral-400"
            >
              Cancelar
            </a>
          </div>
        </section>
      </WizardShell>
    </form>
  );
}
