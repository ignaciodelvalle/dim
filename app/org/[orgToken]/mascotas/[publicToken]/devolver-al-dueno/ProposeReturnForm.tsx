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
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { WizardShell } from "@/components/poncho/Wizard";

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
      <SuccessScreen
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
      <WizardShell
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {/* Step 1 — Identidad */}
        <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Vas a devolver</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {petName ?? "Esta mascota"}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Token: <span className="font-mono">{petPublicToken}</span>
            </p>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Confirmá que esta es la mascota correcta. Si tenés acceso al chip o foto del dueño, te
            recomendamos hacer el cross-check antes de continuar.
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            Continuar
          </button>
        </section>

        {/* Step 2 — Entrega */}
        <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Coordiná lugar y momento de entrega con el dueño antes de enviar la propuesta. Podés
            anotar detalles abajo (opcional) — el dueño los ve cuando recibe la notificación.
          </p>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
            Sugerencia: si no es posible reunirse, dejá un teléfono o canal de contacto en las notas
            de la próxima pantalla.
          </div>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            Continuar
          </button>
        </section>

        {/* Step 3 — Confirmar + notes */}
        <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
          <div className="space-y-1">
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Notas para el dueño (opcional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              maxLength={1000}
              placeholder="Ej: El animal está en buen estado, coordinamos horario de búsqueda…"
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 resize-y"
            />
          </div>

          {state.error && (
            <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? "Enviando…" : "Confirmar propuesta"}
          </button>
        </section>
      </WizardShell>
    </form>
  );
}
