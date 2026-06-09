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

import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { LnWizardShell } from "@/components/ui/WizardShell";
import { submitAdoptionApplicationAction } from "@/src/modules/adoption/actions";

type HousingType = "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";

const HOUSING_OPTIONS: Array<{ value: HousingType; label: string }> = [
  { value: "casa_con_patio", label: "Casa con patio" },
  { value: "casa_sin_patio", label: "Casa sin patio" },
  { value: "departamento", label: "Departamento" },
  { value: "otro", label: "Otra" },
];

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Tu casa", "Otros animales", "Tu día a día", "Confirmar"];

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const CARD_STYLE: React.CSSProperties = {
  background: "var(--color-ln-card)",
  borderColor: "var(--color-ln-line)",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  background: "var(--color-ln-card)",
  borderColor: "var(--color-ln-line-strong)",
  color: "var(--color-ln-ink)",
};

const LABEL_STYLE: React.CSSProperties = {
  color: "var(--color-ln-ink)",
};

const HINT_STYLE: React.CSSProperties = {
  color: "var(--color-ln-mute)",
};

const STEP_NUM_STYLE: React.CSSProperties = {
  color: "var(--color-ln-azul)",
  fontFamily: "var(--font-ln-mono)",
};

function StepQuestion({
  num,
  label,
  hint,
  children,
}: {
  num: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border px-[20px] py-[18px] space-y-[10px]" style={CARD_STYLE}>
      <p className="text-[14.5px] font-semibold" style={LABEL_STYLE}>
        <span className="mr-[7px] text-[11px] font-semibold" style={STEP_NUM_STYLE}>
          {num}
        </span>
        {label}
      </p>
      {hint && (
        <p className="text-[12px]" style={HINT_STYLE}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

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
      <LnSuccessScreen
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
    <LnWizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      <p className="text-[12px]" style={HINT_STYLE}>
        Te van a contactar a{" "}
        <span className="font-semibold" style={{ color: "var(--color-ln-ink)" }}>
          {applicantEmail}
        </span>{" "}
        para coordinar los próximos pasos.
      </p>

      {/* Step 1 — Tu casa */}
      <section className={step === 1 ? "space-y-[14px]" : "sr-only"} aria-hidden={step !== 1}>
        <StepQuestion num="01" label="¿Cómo es tu vivienda?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[8px]">
            {HOUSING_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-[10px] rounded-[5px] border px-[12px] py-[10px] text-[13px] cursor-pointer"
                style={
                  housingType === opt.value
                    ? {
                        borderColor: "var(--color-ln-azul)",
                        background: "var(--color-ln-celeste-050)",
                        color: "var(--color-ln-ink)",
                      }
                    : {
                        borderColor: "var(--color-ln-line)",
                        background: "var(--color-ln-card)",
                        color: "var(--color-ln-ink)",
                      }
                }
              >
                <input
                  type="radio"
                  name="housing"
                  value={opt.value}
                  checked={housingType === opt.value}
                  onChange={() => setHousingType(opt.value)}
                  className="sr-only"
                />
                <span
                  className="flex-shrink-0 w-[16px] h-[16px] rounded-full border-2"
                  style={
                    housingType === opt.value
                      ? {
                          borderColor: "var(--color-ln-azul)",
                          background: "var(--color-ln-azul)",
                          boxShadow: "inset 0 0 0 3px #fff",
                        }
                      : {
                          borderColor: "var(--color-ln-line-strong)",
                          background: "transparent",
                        }
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </StepQuestion>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!housingType}
          className="w-full rounded-[5px] border-0 px-[16px] py-[13px] text-[14px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Continuar →
        </button>
      </section>

      {/* Step 2 — Otros animales */}
      <section className={step === 2 ? "space-y-[14px]" : "sr-only"} aria-hidden={step !== 2}>
        <StepQuestion
          num="02"
          label="¿Tenés otras mascotas?"
          hint="Opcional — contale al refugio si hay animales en casa."
        >
          <textarea
            id="other-pets"
            value={otherPets}
            onChange={(e) => setOtherPets(e.target.value)}
            rows={3}
            placeholder='Ej: "un gato castrado adulto, sociable"'
            className="w-full rounded-[5px] border px-[12px] py-[10px] text-[13px] outline-none focus:ring-2"
            style={TEXTAREA_STYLE}
          />
        </StepQuestion>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="w-full rounded-[5px] border-0 px-[16px] py-[13px] text-[14px] font-semibold text-white"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Continuar →
        </button>
      </section>

      {/* Step 3 — Tu día a día */}
      <section className={step === 3 ? "space-y-[14px]" : "sr-only"} aria-hidden={step !== 3}>
        <StepQuestion
          num="03"
          label="Cómo es tu día a día"
          hint="Opcional — quién está en casa, si hay nenes, cómo se organiza el cuidado."
        >
          <textarea
            id="daily-routine"
            value={dailyRoutine}
            onChange={(e) => setDailyRoutine(e.target.value)}
            rows={3}
            placeholder="¿Quién está en casa durante el día? ¿Hay nenes? ¿Alguien la cuida si viajás?"
            className="w-full rounded-[5px] border px-[12px] py-[10px] text-[13px] outline-none focus:ring-2"
            style={TEXTAREA_STYLE}
          />
        </StepQuestion>
        <StepQuestion num="04" label="Algo más que quieras contar" hint="Opcional.">
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-[5px] border px-[12px] py-[10px] text-[13px] outline-none focus:ring-2"
            style={TEXTAREA_STYLE}
          />
        </StepQuestion>
        <button
          type="button"
          onClick={() => setStep(4)}
          className="w-full rounded-[5px] border-0 px-[16px] py-[13px] text-[14px] font-semibold text-white"
          style={{ background: "var(--color-ln-azul)" }}
        >
          Continuar →
        </button>
      </section>

      {/* Step 4 — Confirmar */}
      <section className={step === 4 ? "space-y-[14px]" : "sr-only"} aria-hidden={step !== 4}>
        {/* Summary recap */}
        <div className="rounded-[8px] border px-[20px] py-[16px] space-y-[10px]" style={CARD_STYLE}>
          <p
            className="font-[var(--font-ln-serif)] text-[15px] font-semibold"
            style={{ color: "var(--color-ln-ink)" }}
          >
            Resumen
          </p>
          <dl
            className="grid gap-x-[14px] gap-y-[6px] text-[12px]"
            style={{ gridTemplateColumns: "auto 1fr" }}
          >
            <dt
              className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em]"
              style={HINT_STYLE}
            >
              Vivienda
            </dt>
            <dd className="m-0" style={{ color: "var(--color-ln-ink)" }}>
              {HOUSING_OPTIONS.find((o) => o.value === housingType)?.label ?? "—"}
            </dd>
            <dt
              className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em]"
              style={HINT_STYLE}
            >
              Otras mascotas
            </dt>
            <dd className="m-0" style={{ color: "var(--color-ln-ink)" }}>
              {otherPets || "—"}
            </dd>
            <dt
              className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em]"
              style={HINT_STYLE}
            >
              Día a día
            </dt>
            <dd className="m-0" style={{ color: "var(--color-ln-ink)" }}>
              {dailyRoutine || "—"}
            </dd>
            <dt
              className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.06em]"
              style={HINT_STYLE}
            >
              Notas
            </dt>
            <dd className="m-0" style={{ color: "var(--color-ln-ink)" }}>
              {notes || "—"}
            </dd>
          </dl>
        </div>

        {/* Consent */}
        <div className="rounded-[8px] border px-[20px] py-[16px]" style={CARD_STYLE}>
          <label className="flex items-start gap-[12px] cursor-pointer">
            <input
              type="checkbox"
              checked={profileSharingConsent}
              onChange={(e) => setProfileSharingConsent(e.target.checked)}
              className="mt-[2px] h-[16px] w-[16px] rounded border flex-shrink-0"
              style={{
                borderColor: "var(--color-ln-line-strong)",
                accentColor: "var(--color-ln-azul)",
              }}
            />
            <span className="text-[13px]" style={{ color: "var(--color-ln-ink-2)" }}>
              Acepto compartir con el refugio mi historial de adopciones, fosters y mascotas en
              MiMAR para que tomen una mejor decisión.{" "}
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="underline underline-offset-2 font-semibold"
                style={{ color: "var(--color-ln-azul)" }}
              >
                Más info sobre tu privacidad
              </button>
            </span>
          </label>
        </div>

        {privacyModalOpen && (
          <dialog
            open
            className="fixed inset-0 z-50 m-auto w-full overflow-y-auto rounded-[8px] border px-[24px] py-[22px] shadow-xl"
            style={{
              maxWidth: 480,
              background: "var(--color-ln-card)",
              borderColor: "var(--color-ln-line-strong)",
            }}
            aria-labelledby="privacy-modal-title"
          >
            <h2
              id="privacy-modal-title"
              className="font-[var(--font-ln-serif)] text-[17px] font-semibold mb-[14px]"
              style={{ color: "var(--color-ln-ink)" }}
            >
              Información sobre privacidad — Ley 25.326
            </h2>
            <div className="text-[13px] space-y-[10px]" style={{ color: "var(--color-ln-ink-2)" }}>
              <p>
                Bajo la Ley 25.326 (Protección de Datos Personales), tus datos solo pueden
                compartirse con consentimiento informado y para un propósito específico.
              </p>
              <p>
                <strong style={{ color: "var(--color-ln-ink)" }}>Qué compartirías:</strong> la lista
                de tus adopciones previas en MiMAR (con outcome — exitosa, revertida, etc.), tus
                fosters previos, tus mascotas registradas actualmente. NO compartirías: tus
                notificaciones, otras postulaciones, denuncias, dirección exacta.
              </p>
              <p>
                <strong style={{ color: "var(--color-ln-ink)" }}>Por cuánto tiempo:</strong> solo
                mientras tu postulación a {petName} esté abierta. Al cerrarse, el refugio pierde
                acceso inmediatamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(false)}
              className="mt-[18px] w-full rounded-[5px] border-0 px-[16px] py-[11px] text-[13px] font-semibold text-white"
              style={{ background: "var(--color-ln-azul)" }}
            >
              Entendido
            </button>
          </dialog>
        )}

        {error && (
          <output className="block text-[13px]" style={{ color: "var(--color-ln-err)" }}>
            {error}
          </output>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !profileSharingConsent}
          className="w-full rounded-[5px] border-0 px-[16px] py-[13px] text-[14px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--color-ln-azul)" }}
        >
          {pending ? "Enviando postulación..." : "Enviar postulación"}
        </button>
      </section>
    </LnWizardShell>
  );
}
