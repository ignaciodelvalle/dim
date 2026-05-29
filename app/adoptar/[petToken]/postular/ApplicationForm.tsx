"use client";

// ApplicationForm — 4-step adoption application wizard.
// Trilogy unification handoff §4 PR-036.
//
// Steps:
//   1. Tu casa — housing type radio. CTA Continuar.
//   2. Otros animales — otherPets textarea (optional). CTA Continuar.
//   3. Tu día a día — dailyRoutine + notes textareas (optional). CTA Continuar.
//   4. Confirmar — consent checkbox + privacy modal trigger + summary recap.
//      CTA Enviar postulación.
//
// On success → SuccessScreen with the application's event id as the code
// reference. (The handoff suggested 'APP-XXXX-XXXX'; no such generator exists
// today and adding one is scope creep — the event id is the operational
// reference adopters can quote when contacting the refugio.)

import { useState, useTransition } from "react";

import { submitAdoptionApplicationAction } from "@/app/actions/adoption-applications";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { WizardShell } from "@/components/poncho/Wizard";

type HousingType = "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";

const HOUSING_OPTIONS: Array<{ value: HousingType; label: string }> = [
  { value: "casa_con_patio", label: "Casa con patio" },
  { value: "casa_sin_patio", label: "Casa sin patio" },
  { value: "departamento", label: "Departamento" },
  { value: "otro", label: "Otra" },
];

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Tu casa", "Otros animales", "Tu día a día", "Confirmar"];

export function ApplicationForm({
  petPublicToken,
  petName,
  applicantEmail,
}: {
  petPublicToken: string;
  petName: string;
  applicantEmail: string;
}) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [housingType, setHousingType] = useState<HousingType | "">("");
  const [otherPets, setOtherPets] = useState("");
  const [dailyRoutine, setDailyRoutine] = useState("");
  const [notes, setNotes] = useState("");
  const [profileSharingConsent, setProfileSharingConsent] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!housingType) {
      setError("Elegí el tipo de vivienda.");
      setStep(1);
      return;
    }
    startTransition(async () => {
      const result = await submitAdoptionApplicationAction({
        petPublicToken,
        housingType,
        otherPets: otherPets.trim() || null,
        dailyRoutine: dailyRoutine.trim() || null,
        notes: notes.trim() || null,
        profileSharingConsent,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Derive a short, copy-friendly code from the event id. The full UUID
      // remains the source of truth server-side; this is just for the user
      // to quote when contacting the refugio.
      const short = result.applicationEventId.slice(0, 8).toUpperCase();
      setSubmittedCode(`APP-${short.slice(0, 4)}-${short.slice(4, 8)}`);
    });
  }

  if (submittedCode) {
    return (
      <SuccessScreen
        title={`Tu postulación a ${petName} fue enviada`}
        description={`Te van a contactar a ${applicantEmail} cuando tengan novedades. Guardá este código por si necesitás referenciarla.`}
        code={submittedCode}
        next={[
          {
            label: "Ver mis postulaciones",
            href: "/mis-mascotas/postulaciones",
          },
          {
            label: `Volver a la ficha de ${petName}`,
            href: `/adoptar/${petPublicToken}`,
            variant: "secondary",
          },
        ]}
      />
    );
  }

  return (
    <WizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      <p className="text-xs text-gob-text-muted">
        Te van a contactar a <span className="font-medium">{applicantEmail}</span> para coordinar
        los próximos pasos.
      </p>

      {/* Step 1 — Tu casa */}
      <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gob-text">¿Cómo es tu vivienda?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {HOUSING_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                  housingType === opt.value
                    ? "border-gob-success bg-gob-success/10"
                    : "border-gob-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="housing"
                  value={opt.value}
                  checked={housingType === opt.value}
                  onChange={() => setHousingType(opt.value)}
                  className="sr-only"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!housingType}
          className="w-full px-6 py-3 rounded-lg bg-gob-success text-white text-base font-semibold hover:bg-gob-success disabled:opacity-60"
        >
          Continuar
        </button>
      </section>

      {/* Step 2 — Otros animales */}
      <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
        <div>
          <label htmlFor="other-pets" className="block text-sm font-medium text-gob-text mb-1">
            ¿Tenés otras mascotas? <span className="text-gob-text-muted">(opcional)</span>
          </label>
          <textarea
            id="other-pets"
            value={otherPets}
            onChange={(e) => setOtherPets(e.target.value)}
            rows={3}
            placeholder='Ej: "un gato castrado adulto, sociable"'
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="w-full px-6 py-3 rounded-lg bg-gob-success text-white text-base font-semibold hover:bg-gob-success"
        >
          Continuar
        </button>
      </section>

      {/* Step 3 — Tu día a día */}
      <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
        <div>
          <label htmlFor="daily-routine" className="block text-sm font-medium text-gob-text mb-1">
            Cómo es tu día a día <span className="text-gob-text-muted">(opcional)</span>
          </label>
          <textarea
            id="daily-routine"
            value={dailyRoutine}
            onChange={(e) => setDailyRoutine(e.target.value)}
            rows={3}
            placeholder="¿Quién está en casa durante el día? ¿Hay nenes? ¿Alguien la cuida si viajás?"
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          />
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gob-text mb-1">
            Algo más que quieras contar <span className="text-gob-text-muted">(opcional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setStep(4)}
          className="w-full px-6 py-3 rounded-lg bg-gob-success text-white text-base font-semibold hover:bg-gob-success"
        >
          Continuar
        </button>
      </section>

      {/* Step 4 — Confirmar */}
      <section className={step === 4 ? "space-y-4" : "sr-only"} aria-hidden={step !== 4}>
        <div className="rounded-lg border border-gob-border-strong p-4 space-y-2 text-sm">
          <p className="font-semibold text-gob-text">Resumen</p>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
            <dt className="text-gob-text-muted">Vivienda</dt>
            <dd className="col-span-2">
              {HOUSING_OPTIONS.find((o) => o.value === housingType)?.label ?? "—"}
            </dd>
            <dt className="text-gob-text-muted">Otras mascotas</dt>
            <dd className="col-span-2">{otherPets || "—"}</dd>
            <dt className="text-gob-text-muted">Día a día</dt>
            <dd className="col-span-2">{dailyRoutine || "—"}</dd>
            <dt className="text-gob-text-muted">Notas</dt>
            <dd className="col-span-2">{notes || "—"}</dd>
          </dl>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={profileSharingConsent}
              onChange={(e) => setProfileSharingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gob-border-strong text-gob-success focus:ring-gob-success"
            />
            <span className="text-sm text-gob-text-gray">
              Acepto compartir con el refugio mi historial de adopciones, fosters y mascotas en
              MiMAR para que tomen una mejor decisión.{" "}
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="underline text-gob-success hover:text-gob-success/80"
              >
                Más info sobre tu privacidad
              </button>
            </span>
          </label>
        </div>

        {privacyModalOpen && (
          <dialog
            open
            className="fixed inset-0 z-50 m-auto max-w-lg w-full rounded-xl border border-gob-border bg-white p-6 shadow-xl"
            aria-labelledby="privacy-modal-title"
          >
            <h2 id="privacy-modal-title" className="text-base font-semibold text-gob-text mb-4">
              Información sobre privacidad — Ley 25.326
            </h2>
            <div className="text-sm text-gob-text-gray space-y-3">
              <p>
                Bajo la Ley 25.326 (Protección de Datos Personales), tus datos solo pueden
                compartirse con consentimiento informado y para un propósito específico.
              </p>
              <p>
                <strong>Qué compartirías:</strong> la lista de tus adopciones previas en MiMAR (con
                outcome — exitosa, revertida, etc.), tus fosters previos, tus mascotas registradas
                actualmente. NO compartirías: tus notificaciones, otras postulaciones, denuncias,
                dirección exacta.
              </p>
              <p>
                <strong>Por cuánto tiempo:</strong> solo mientras tu postulación a {petName} esté
                abierta. Al cerrarse, el refugio pierde acceso inmediatamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(false)}
              className="mt-5 w-full px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90"
            >
              Entendido
            </button>
          </dialog>
        )}

        {error && <output className="block text-sm text-gob-danger">{error}</output>}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !profileSharingConsent}
          className="w-full px-6 py-3 rounded-lg bg-gob-success text-white text-base font-semibold hover:bg-gob-success disabled:opacity-60"
        >
          {pending ? "Enviando postulación..." : "Enviar postulación"}
        </button>
      </section>
    </WizardShell>
  );
}
