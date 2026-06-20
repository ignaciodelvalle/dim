"use client";

// DenunciaWizard — client component holding all wizard state.
// Renders 5 steps + a success screen. Calls createWelfareReportAction on step 5 submit.
//
// State management: plain useState. No external state lib needed — the form is
// short enough that step-back covers regret. Browser refresh = restart (acceptable
// trade for anti-spam + simplicity per spec).
//
// Architecture note on LocationFields (uncontrolled inputs):
//   LocationFields renders its own hidden inputs for lat/lng and native select/text
//   inputs for province/locality. Since those can't be lifted as controlled state
//   without refactoring LocationFields, we:
//     1. Wrap the entire wizard in a single <form> (no action — submit is manual).
//     2. Keep the Step3Where component in the DOM at all times (hidden with
//        "sr-only + aria-hidden" when not active). This preserves the uncontrolled
//        input values across step transitions so they're readable via
//        new FormData(formRef.current) at submit time.
//   TODO(M-followup): refactor LocationFields to accept an onChange callback and
//   lift its state into DenunciaWizard to remove this coupling.
//
// Column mapping:
//   Step 1 → kind
//   Step 2 → severity (via WIZARD_SEVERITY_TO_DB map)
//   Step 3 → description, occurredAt (resolved from WhenOption), locationAddress,
//             provinceCode (→ jurisdictionProvince server-side), localityName,
//             locationLat, locationLng
//   Step 4 → subjectKind, subjectPetToken (→ subjectPetId server-side), subjectDescription
//   Step 5 → reporterContactEmail, reporterContactPhone (empty strings if anonymous),
//             attachment entries (evidence files appended from WizardState.evidenceFiles)
//
// Anti-spam: honeypot field included. Dwell-time measured from mount to submit.
//
// UX 3.2 item 3:
//   - Steps 1–2 now require an explicit "Continuar" button to advance; selecting an
//     option alone no longer auto-advances (mis-tap risk on a sensitive form).
//   - Autosave: in-progress answers are persisted to localStorage after each change.
//     Contact details (email/phone) are NEVER persisted — the denuncia is anonymous.
//     The draft is cleared on successful submit.
//   - beforeunload warning fires when there is unsaved progress.

import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useEffect, useRef, useState } from "react";

import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { LnWizardShell } from "@/components/ui/WizardShell";
import { clearDraft, restoreDraft, saveDraft } from "@/lib/denuncia-autosave";
import { createWelfareReportAction } from "@/src/modules/welfare/actions";
import type { WelfareReportKind } from "@/src/modules/welfare/domain/types";

import { Step1Kind } from "./_components/Step1Kind";
import {
  Step2Severity,
  WIZARD_SEVERITY_TO_DB,
  type WizardSeverity,
} from "./_components/Step2Severity";
import { Step3Where, type WhenOption, resolveOccurredAt } from "./_components/Step3Where";
import { Step4Subject, type SubjectKindWizard } from "./_components/Step4Subject";
import { type ContactMode, type EvidenceFile, Step5Contact } from "./_components/Step5Contact";

const TOTAL_STEPS = 5;
const STEP_LABELS = ["Qué pasó", "Gravedad", "Dónde", "Quién", "Cerrar"];

type WizardState = {
  kind: WelfareReportKind | null;
  severity: WizardSeverity | null;
  when: WhenOption | null;
  description: string;
  subjectKind: SubjectKindWizard | null;
  subjectPetToken: string;
  subjectDescription: string;
  contactMode: ContactMode | null;
  contactEmail: string;
  contactPhone: string;
  evidenceFiles: EvidenceFile[];
  evidenceError: string | null;
};

const INITIAL_STATE: WizardState = {
  kind: null,
  severity: null,
  when: null,
  description: "",
  subjectKind: null,
  subjectPetToken: "",
  subjectDescription: "",
  contactMode: null,
  contactEmail: "",
  contactPhone: "",
  evidenceFiles: [],
  evidenceError: null,
};

export function DenunciaWizard() {
  const [step, setStep] = useState(1);
  const [wizState, setWizState] = useState<WizardState>(INITIAL_STATE);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  // Ref to the outer <form> so we can read all inputs at submit time,
  // including LocationFields' uncontrolled hidden inputs inside Step3Where.
  const formRef = useRef<HTMLFormElement>(null);

  // Stable UUID generated once per mount — survives re-renders. Deduplicates
  // the pet-event bridge rows when the form is submitted more than once
  // (double-click, network retry).
  const { key: idempotencyKey } = useIdempotencyKey();

  // Mount timestamp for dwell-time bot rejection (handoff P4-2d).
  // Submits with dwell < 10s are silently dropped server-side — the user
  // (or bot) sees the same SuccessScreen but no row persists. Captured
  // here so the wizard owns the start-of-flow timestamp; serialized into
  // FormData on submit.
  const mountedAt = useRef<number>(Date.now());

  // UX 3.2 item 3 — Restore draft from localStorage on first mount.
  // Contact fields are intentionally excluded from autosave (see denuncia-autosave.ts).
  useEffect(() => {
    const draft = restoreDraft();
    if (!draft) return;
    setStep(Math.min(draft.step, TOTAL_STEPS));
    setWizState((prev) => ({
      ...prev,
      kind: (draft.step1.kind as WelfareReportKind | null) ?? null,
      severity: (draft.step2.severity as WizardSeverity | null) ?? null,
      description: draft.step3.description ?? "",
      when: (draft.step3.when as WhenOption | null) ?? null,
    }));
  }, []);

  // UX 3.2 item 3 — Autosave to localStorage whenever relevant state changes.
  // Contact email/phone are NEVER saved here (anonymous flow — those fields stay ephemeral).
  useEffect(() => {
    // Only autosave while the form is in-progress (no successCode yet)
    if (successCode) return;
    saveDraft({
      step,
      step1: { kind: wizState.kind },
      step2: { severity: wizState.severity },
      step3: { description: wizState.description, when: wizState.when },
    });
  }, [step, wizState.kind, wizState.severity, wizState.description, wizState.when, successCode]);

  // UX 3.2 item 3 — beforeunload warning when the reporter has entered any data.
  useEffect(() => {
    const hasDirtyData = !!(
      wizState.kind ||
      wizState.severity ||
      wizState.description.trim() ||
      wizState.when
    );
    if (!hasDirtyData || successCode) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers show their own generic message; setting returnValue
      // is required for compat with some older user agents.
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [wizState.kind, wizState.severity, wizState.description, wizState.when, successCode]);

  function updateState(patch: Partial<WizardState>) {
    setWizState((prev) => ({ ...prev, ...patch }));
    setStepError(null);
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function goNext() {
    setStepError(null);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function validateAndAdvance() {
    switch (step) {
      case 1:
        if (!wizState.kind) {
          setStepError("Elegí una opción para continuar.");
          return;
        }
        goNext();
        break;
      case 2:
        if (!wizState.severity) {
          setStepError("Elegí la gravedad para continuar.");
          return;
        }
        goNext();
        break;
      case 3:
        if (!wizState.description.trim()) {
          setStepError("Contanos brevemente qué viste antes de continuar.");
          return;
        }
        if (wizState.description.trim().length < 20) {
          setStepError("La descripción debe tener al menos 20 caracteres.");
          return;
        }
        if (!wizState.when) {
          setStepError("Indicá cuándo pasó para continuar.");
          return;
        }
        goNext();
        break;
      case 4:
        // Step 4 is optional — always let through.
        goNext();
        break;
      default:
        break;
    }
  }

  async function handleSubmit() {
    setSubmitError(null);

    if (!wizState.kind || !wizState.severity || !wizState.when || !wizState.description.trim()) {
      setSubmitError("Faltan datos obligatorios. Volvé a los pasos anteriores.");
      return;
    }

    if (wizState.contactMode === "with_contact") {
      if (!wizState.contactEmail.trim() && !wizState.contactPhone.trim()) {
        setSubmitError("Completá al menos un dato de contacto, o cambiá a envío anónimo.");
        return;
      }
    }

    if (!wizState.contactMode) {
      setSubmitError("Elegí cómo querés enviar la denuncia.");
      return;
    }

    setIsPending(true);

    try {
      // Build FormData from the form element (captures LocationFields uncontrolled inputs)
      // then override/add the controlled wizard fields.
      const formData = formRef.current ? new FormData(formRef.current) : new FormData();

      // Step 1
      formData.set("kind", wizState.kind);

      // Step 2 — map wizard severity to DB enum value
      formData.set("severity", WIZARD_SEVERITY_TO_DB[wizState.severity]);

      // Step 3 — controlled fields override any stale form values
      formData.set("description", wizState.description.trim());
      formData.set("occurredAt", resolveOccurredAt(wizState.when));

      // Step 4 — subject
      const subjectKind = wizState.subjectKind ?? "general";
      formData.set("subjectKind", subjectKind);

      if (wizState.subjectKind === "registered_pet" && wizState.subjectPetToken.trim()) {
        formData.set("subjectPetToken", wizState.subjectPetToken.trim());
      } else {
        formData.delete("subjectPetToken");
      }

      if (wizState.subjectDescription.trim()) {
        formData.set("subjectDescription", wizState.subjectDescription.trim());
      } else if (subjectKind !== "registered_pet") {
        // Action requires subjectDescription for non-registered_pet subjects.
        formData.set("subjectDescription", "No especificado por el denunciante.");
      }

      // Step 5 — contact
      if (wizState.contactMode === "with_contact") {
        formData.set("reporterContactEmail", wizState.contactEmail.trim());
        formData.set("reporterContactPhone", wizState.contactPhone.trim());
      } else {
        formData.delete("reporterContactEmail");
        formData.delete("reporterContactPhone");
      }

      // Step 5 — evidence files (lifted from WizardState; no DOM file input to capture)
      // Delete any stale attachment entries from the DOM then append from state.
      formData.delete("attachment");
      for (const entry of wizState.evidenceFiles) {
        formData.append("attachment", entry.file);
      }

      // Honeypot — must be empty
      formData.set("_hp", "");

      // Dwell time — millisecond delta from mount to submit. Server uses
      // this to silent-reject obvious bots.
      formData.set("dwellTimeMs", String(Date.now() - mountedAt.current));

      // Idempotency key — stable per mount, deduplicates pet-event bridge
      // rows on double-submit or retry with the same form session.
      formData.set("clientIdempotencyKey", idempotencyKey);

      const result = await createWelfareReportAction({ error: null }, formData);

      // Action redirects on success — if we reach here, it returned an error.
      if (result?.error) {
        setSubmitError(result.error);
      }
    } catch (err) {
      // Next.js redirect() throws an internal error the router intercepts.
      // On a successful redirect: clear autosave then rethrow so navigation succeeds.
      const digest = (err as { digest?: string }).digest ?? "";
      if (digest.startsWith("NEXT_REDIRECT")) {
        clearDraft();
        throw err;
      }
      setSubmitError(
        err instanceof Error ? err.message : "Ocurrió un error inesperado. Intentá de nuevo.",
      );
    } finally {
      setIsPending(false);
    }
  }

  if (successCode) {
    return (
      <LnSuccessScreen
        title="Denuncia registrada"
        description="Tu denuncia fue recibida. Gracias por animarte a denunciar."
        code={successCode}
        codeWarning="Si enviaste anónima, este código es la única forma de volver a esta denuncia. Guardalo en un lugar seguro o sacale screenshot."
        next={[
          { label: "Ver mi denuncia →", href: `/denuncias/codigo/${successCode}` },
          { label: "Volver al inicio", href: "/", variant: "secondary" },
        ]}
      />
    );
  }

  return (
    // Single <form> wrapping the wizard — no native action, submit handled by handleSubmit.
    // Step3Where (with LocationFields) stays mounted at all times (hidden when inactive)
    // so its uncontrolled inputs persist across step transitions.
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} noValidate>
      {/* Honeypot — visually hidden, accessible hidden, for anti-spam */}
      <input
        type="text"
        name="_hp"
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
      />

      {/* Steps 1 and 2 are pure state — rendered conditionally, no uncontrolled DOM inputs.
          UX 3.2 item 3: selecting an option no longer auto-advances; an explicit
          "Continuar" button is required so reporters don't mis-tap past a step. */}
      {step === 1 && (
        <LnWizardShell
          currentStep={1}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onBack={undefined}
          mainId="main-content"
        >
          <Step1Kind selected={wizState.kind} onSelect={(kind) => updateState({ kind })} />
          {stepError && (
            <p className="mt-4 text-sm text-[var(--color-ln-seal)] text-center" role="alert">
              {stepError}
            </p>
          )}
          <div className="mt-8">
            <button
              type="button"
              onClick={validateAndAdvance}
              className="w-full px-4 py-[13px] rounded-[6px] bg-[var(--color-ln-azul)] text-white font-semibold text-sm hover:bg-[var(--color-ln-azul-700)] transition-colors"
            >
              Continuar →
            </button>
          </div>
        </LnWizardShell>
      )}

      {step === 2 && (
        <LnWizardShell
          currentStep={2}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onBack={goBack}
          mainId="main-content"
        >
          <Step2Severity
            selected={wizState.severity}
            onSelect={(severity) => updateState({ severity })}
          />
          {stepError && (
            <p className="mt-4 text-sm text-[var(--color-ln-seal)] text-center" role="alert">
              {stepError}
            </p>
          )}
          <div className="mt-8">
            <button
              type="button"
              onClick={validateAndAdvance}
              className="w-full px-4 py-[13px] rounded-[6px] bg-[var(--color-ln-azul)] text-white font-semibold text-sm hover:bg-[var(--color-ln-azul-700)] transition-colors"
            >
              Continuar →
            </button>
          </div>
        </LnWizardShell>
      )}

      {/* Step 3 stays mounted after first visit (step >= 3) so LocationFields'
          uncontrolled inputs remain in the DOM for reading at submit time.
          It's visually hidden when not the active step via aria-hidden + hidden class.
          B-3: inert is added when step > 3 so keyboard focus cannot reach offscreen inputs. */}
      <div
        aria-hidden={step !== 3}
        inert={step > 3 ? true : undefined}
        className={step < 3 ? "hidden" : undefined}
        style={
          step > 3
            ? {
                position: "absolute",
                left: "-9999px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }
            : undefined
        }
      >
        <LnWizardShell
          currentStep={3}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onBack={goBack}
          mainId="main-content"
        >
          <Step3Where
            when={wizState.when}
            description={wizState.description}
            onWhenChange={(when) => updateState({ when })}
            onDescriptionChange={(description) => updateState({ description })}
            error={step === 3 ? stepError : null}
          />
          {step === 3 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={validateAndAdvance}
                className="w-full px-4 py-[13px] rounded-[6px] bg-[var(--color-ln-azul)] text-white font-semibold text-sm hover:bg-[var(--color-ln-azul-700)] transition-colors"
              >
                Continuar →
              </button>
            </div>
          )}
        </LnWizardShell>
      </div>

      {step === 4 && (
        <LnWizardShell
          currentStep={4}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onBack={goBack}
          mainId="main-content"
        >
          <Step4Subject
            subjectKind={wizState.subjectKind}
            subjectPetToken={wizState.subjectPetToken}
            subjectDescription={wizState.subjectDescription}
            onSubjectKindChange={(subjectKind) => updateState({ subjectKind })}
            onSubjectPetTokenChange={(subjectPetToken) => updateState({ subjectPetToken })}
            onSubjectDescriptionChange={(subjectDescription) => updateState({ subjectDescription })}
            error={stepError}
          />
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={validateAndAdvance}
              className="w-full px-4 py-[13px] rounded-[6px] bg-[var(--color-ln-azul)] text-white font-semibold text-sm hover:bg-[var(--color-ln-azul-700)] transition-colors"
            >
              Continuar →
            </button>
            <button
              type="button"
              onClick={() => {
                updateState({ subjectKind: null, subjectPetToken: "", subjectDescription: "" });
                goNext();
              }}
              className="w-full px-4 py-2.5 text-sm text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink-2)] underline transition-colors"
            >
              Saltear este paso
            </button>
          </div>
        </LnWizardShell>
      )}

      {step === 5 && (
        <LnWizardShell
          currentStep={5}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onBack={goBack}
          mainId="main-content"
        >
          <Step5Contact
            contactMode={wizState.contactMode}
            contactEmail={wizState.contactEmail}
            contactPhone={wizState.contactPhone}
            evidenceFiles={wizState.evidenceFiles}
            evidenceError={wizState.evidenceError}
            onContactModeChange={(contactMode) => updateState({ contactMode })}
            onContactEmailChange={(contactEmail) => updateState({ contactEmail })}
            onContactPhoneChange={(contactPhone) => updateState({ contactPhone })}
            onEvidenceFilesChange={(evidenceFiles) => updateState({ evidenceFiles })}
            onEvidenceErrorChange={(evidenceError) => updateState({ evidenceError })}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={submitError}
          />
        </LnWizardShell>
      )}
    </form>
  );
}
