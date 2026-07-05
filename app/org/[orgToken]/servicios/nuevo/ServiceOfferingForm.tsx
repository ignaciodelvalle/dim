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
import { LnCheckbox, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnWizardShell } from "@/components/ui/WizardShell";
import { OpButton } from "@/components/ui/dashboard";
import type { ServiceKindDef } from "@/lib/reference/service-kinds";

const INITIAL_STATE: ServiceOfferingFormState = { error: null };

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Tipo", "Capacidad", "Elegibilidad"];

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
      <LnWizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {state.error && (
          <p className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-danger bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
            {state.error}
          </p>
        )}

        {/* Step 1 — Tipo + nombre + descripción */}
        <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
          <div className="space-y-1">
            <label htmlFor="serviceKind" className="block text-[13px] font-medium text-ln-op-ink">
              Tipo de servicio <span className="text-ln-op-danger">*</span>
            </label>
            <LnSelect id="serviceKind" name="serviceKind" required>
              <option value="">— Seleccioná un tipo —</option>
              {serviceKinds.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.label}
                </option>
              ))}
            </LnSelect>
          </div>

          <div className="space-y-1">
            <label htmlFor="displayName" className="block text-[13px] font-medium text-ln-op-ink">
              Nombre del servicio <span className="text-ln-op-danger">*</span>
            </label>
            <LnInput
              id="displayName"
              name="displayName"
              type="text"
              required
              minLength={3}
              maxLength={120}
              placeholder="Ej: Vacunación antirrábica — campaña junio 2026"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="block text-[13px] font-medium text-ln-op-ink">
              Descripción <span className="text-ln-op-mute font-normal">(opcional)</span>
            </label>
            <LnTextarea
              id="description"
              name="description"
              maxLength={500}
              rows={3}
              placeholder="Información adicional para quienes reserven el turno."
              className="resize-none"
            />
          </div>

          <OpButton variant="primary" block onClick={() => setStep(2)}>
            Continuar
          </OpButton>
        </section>

        {/* Step 2 — Capacidad */}
        <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="durationMinutes"
                className="block text-[13px] font-medium text-ln-op-ink"
              >
                Duración (minutos) <span className="text-ln-op-danger">*</span>
              </label>
              <LnInput
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                required
                min={5}
                max={480}
                defaultValue={15}
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="slotCapacity"
                className="block text-[13px] font-medium text-ln-op-ink"
              >
                Capacidad por turno <span className="text-ln-op-danger">*</span>
              </label>
              <LnInput
                id="slotCapacity"
                name="slotCapacity"
                type="number"
                required
                min={1}
                max={100}
                defaultValue={1}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="priceArs" className="block text-[13px] font-medium text-ln-op-ink">
              Precio (ARS){" "}
              <span className="text-ln-op-mute font-normal">— vacío para campaña gratuita</span>
            </label>
            <LnInput
              id="priceArs"
              name="priceArs"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <OpButton variant="primary" block onClick={() => setStep(3)}>
            Continuar
          </OpButton>
        </section>

        {/* Step 3 — Elegibilidad + submit */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <span className="block text-[13px] font-medium text-ln-op-ink">Especies elegibles</span>
            <div className="flex gap-4">
              <LnCheckbox name="eligibilitySpecies" value="dog" defaultChecked>
                Perros
              </LnCheckbox>
              <LnCheckbox name="eligibilitySpecies" value="cat" defaultChecked>
                Gatos
              </LnCheckbox>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="eligibilityAgeMinMonths"
                className="block text-[13px] font-medium text-ln-op-ink"
              >
                Edad mínima (meses) <span className="text-ln-op-mute font-normal">(opcional)</span>
              </label>
              <LnInput
                id="eligibilityAgeMinMonths"
                name="eligibilityAgeMinMonths"
                type="number"
                min={0}
                max={360}
                placeholder="Sin mínimo"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="eligibilityAgeMaxMonths"
                className="block text-[13px] font-medium text-ln-op-ink"
              >
                Edad máxima (meses) <span className="text-ln-op-mute font-normal">(opcional)</span>
              </label>
              <LnInput
                id="eligibilityAgeMaxMonths"
                name="eligibilityAgeMaxMonths"
                type="number"
                min={0}
                max={360}
                placeholder="Sin máximo"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <OpButton type="submit" variant="primary" className="flex-1" disabled={isPending}>
              {isPending ? "Enviando…" : "Crear servicio"}
            </OpButton>
            <a
              href={`/org/${orgToken}/servicios`}
              className="text-sm text-ln-op-azul hover:underline"
            >
              Cancelar
            </a>
          </div>
        </section>
      </LnWizardShell>
    </form>
  );
}
