"use client";

// ProposeReturnForm — 3-step wizard for proposing return-to-owner.
// Trilogy unification handoff §5 PR-044 (scoped).
//
// Steps:
//   1. Identidad — read-only confirmation of the pet being returned.
//      CTA Continuar.
//   2. Punto y momento de entrega — optional notes about where/when the
//      handover will happen. CTA Continuar.
//   3. Confirmación final — review + textbox for notes to the owner + send.
//      CTA Confirmar propuesta.
//
// On success → SuccessScreen "Propuesta enviada. Esperando confirmación del
// dueño". The owner gets a notification with an accept link.
//
// Scope note: the handoff describes a more elaborate flow (microchip
// cross-check + owner photo + L2 meeting location + signature + custody_
// transferred event with ownerships flip). The current server action only
// emits a proposal — actual transfer happens when the owner confirms. This
// PR wraps the existing action in a wizard with placeholders for the heavier
// fields; full identity-verification + meeting-coords + signature land later
// when the action signature evolves.

import { useActionState, useState } from "react";

import { proposeReturnToOwnerFormAction } from "@/app/actions/return-to-owner-form";
import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { LnWizardShell } from "@/components/ui/WizardShell";

export type ProposeReturnFormState = {
  error: string | null;
  success?: boolean;
};

const initialState: ProposeReturnFormState = { error: null };

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Identidad", "Entrega", "Confirmar"];

export function ProposeReturnForm({
  orgToken,
  petPublicToken,
  petName,
}: {
  orgToken: string;
  petPublicToken: string;
  petName?: string;
}) {
  const action = proposeReturnToOwnerFormAction.bind(null, orgToken, petPublicToken);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [step, setStep] = useState(1);

  if (state.success) {
    return (
      <LnSuccessScreen
        title={`Propuesta enviada${petName ? ` para ${petName}` : ""}`}
        description="El dueño recibió una notificación para confirmar la devolución. La custodia sigue con tu org hasta que acepte."
        next={[
          {
            label: "Volver al panel del refugio",
            href: `/org/${orgToken}`,
          },
          {
            label: petName ? `Ver ficha de ${petName}` : "Ver ficha",
            href: `/org/${orgToken}/mascotas/${petPublicToken}`,
            variant: "secondary",
          },
        ]}
      />
    );
  }

  return (
    <form action={formAction}>
      <LnWizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {/* Step 1 — Identidad */}
        <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-ln-op-mute">Vas a devolver</p>
            <p className="mt-1 text-[17px] font-semibold text-ln-op-ink">
              {petName ?? "Esta mascota"}
            </p>
            <p className="mt-2 text-[11px] text-ln-op-mute">
              Token: <span className="font-mono">{petPublicToken}</span>
            </p>
          </div>
          <p className="text-[13px] text-ln-op-ink-2">
            Confirmá que esta es la mascota correcta. Si tenés acceso al chip o foto del dueño, te
            recomendamos hacer el cross-check antes de continuar.
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full px-4 py-3 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90"
          >
            Continuar
          </button>
        </section>

        {/* Step 2 — Entrega */}
        <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
          <p className="text-[13px] text-ln-op-ink-2">
            Coordiná lugar y momento de entrega con el dueño antes de enviar la propuesta. Podés
            anotar detalles abajo (opcional) — el dueño los ve cuando recibe la notificación.
          </p>
          <div className="rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg p-3 text-[11px] text-ln-op-warn">
            Sugerencia: si no es posible reunirse, dejá un teléfono o canal de contacto en las notas
            de la próxima pantalla.
          </div>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full px-4 py-3 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90"
          >
            Continuar
          </button>
        </section>

        {/* Step 3 — Confirmar + notes */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <label htmlFor="notes" className="block text-sm font-medium text-ln-op-ink-2">
              Notas para el dueño (opcional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              maxLength={1000}
              placeholder="Ej: El animal está en buen estado, coordinamos horario de búsqueda…"
              className="w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 text-[13px] text-ln-op-ink placeholder:text-ln-op-faint focus:outline-none focus:ring-1 focus:ring-ln-op-azul resize-y"
            />
          </div>

          {state.error && (
            <p className="text-sm rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg px-3 py-2 text-ln-op-danger">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-3 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Enviando…" : "Confirmar propuesta"}
          </button>
        </section>
      </LnWizardShell>
    </form>
  );
}
