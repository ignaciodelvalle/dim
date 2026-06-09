"use client";

// OrgBiteForm — 4-step wizard for org-side bite reporting.
// Trilogy unification handoff §5 PR-045.
//
// Steps:
//   1. Mascota — petPublicToken. CTA Continuar.
//   2. Cuándo — occurredAt. CTA Continuar.
//   3. Víctima + contexto + ubicación — kind, contact, severity, injuries,
//      vet involvement, context, location text. CTA Continuar.
//   4. Confirmar — confirmObservation checkbox + submit. CTA Confirmar mordedura.
//
// Cierre: SuccessScreen "Incidente registrado. Mascota en observación
// antirrábica por 10 días" — replaces the previous redirect.

import { useState, useTransition } from "react";

import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { LnCheckbox, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { LnWizardShell } from "@/components/ui/WizardShell";
import {
  type ReportBiteFromOrgFormState,
  reportBiteFromOrgAction,
} from "@/src/modules/surveillance/actions";

type FormAction = (
  prev: ReportBiteFromOrgFormState,
  formData: FormData,
) => Promise<ReportBiteFromOrgFormState>;

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Mascota", "Cuándo", "Víctima y contexto", "Confirmar"];

function computeObservationEndIso(occurredAtIso: string): string | null {
  if (!occurredAtIso) return null;
  const d = new Date(occurredAtIso);
  if (!Number.isFinite(d.getTime())) return null;
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

export function OrgBiteForm({ action, orgToken }: { action: FormAction; orgToken: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ReportBiteFromOrgFormState>({ error: null });

  // Controlled fields. Reuse FormData on submit.
  const [petPublicToken, setPetPublicToken] = useState("");
  const [occurredAt, setOccurredAt] = useState(today);
  const [locationDescription, setLocationDescription] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [provinceName, setProvinceName] = useState("");
  const [localityName, setLocalityName] = useState("");
  const [victimKind, setVictimKind] = useState<"human" | "animal" | "unknown">("human");
  const [victimContactName, setVictimContactName] = useState("");
  const [victimContactPhone, setVictimContactPhone] = useState("");
  const [victimAgeEstimate, setVictimAgeEstimate] = useState("");
  const [severity, setSeverity] = useState("");
  const [injuriesSummary, setInjuriesSummary] = useState("");
  const [vetInvolved, setVetInvolved] = useState(false);
  const [context, setContext] = useState("");
  const [confirmObservation, setConfirmObservation] = useState(false);

  function submit() {
    setState({ error: null });
    const fd = new FormData();
    fd.set("petPublicToken", petPublicToken.trim());
    fd.set("occurredAt", occurredAt);
    if (locationDescription) fd.set("locationDescription", locationDescription);
    if (provinceCode) fd.set("provinceCode", provinceCode);
    if (provinceName) fd.set("provinceName", provinceName);
    if (localityName) fd.set("localityName", localityName);
    fd.set("victimKind", victimKind);
    if (victimContactName) fd.set("victimContactName", victimContactName);
    if (victimContactPhone) fd.set("victimContactPhone", victimContactPhone);
    if (victimAgeEstimate) fd.set("victimAgeEstimate", victimAgeEstimate);
    fd.set("severity", severity);
    if (injuriesSummary) fd.set("injuriesSummary", injuriesSummary);
    if (vetInvolved) fd.set("vetInvolved", "on");
    if (context) fd.set("context", context);
    if (confirmObservation) fd.set("confirmObservation", "on");
    fd.set("noRedirect", "1");
    startTransition(async () => {
      const result = await action({ error: null }, fd);
      setState(result);
    });
  }

  if (state.ok && state.petToken) {
    const obsEnd = computeObservationEndIso(occurredAt);
    return (
      <LnSuccessScreen
        title="Incidente registrado"
        description={
          obsEnd
            ? `Mascota en observación antirrábica por 10 días. Próxima revisión: ${obsEnd}.`
            : "Mascota en observación antirrábica por 10 días."
        }
        next={[
          {
            label: "Ver ficha de la mascota",
            href: `/org/${orgToken}/mascotas/${state.petToken}`,
          },
          {
            label: "Volver al panel del refugio",
            href: `/org/${orgToken}`,
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
      {/* Step 1 — Mascota */}
      <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
        <div className="space-y-1.5">
          <label htmlFor="petPublicToken" className="block text-[13px] font-medium text-ln-op-ink">
            Token público de la mascota
            <span className="text-ln-op-danger ml-0.5">*</span>
          </label>
          <LnInput
            id="petPublicToken"
            type="text"
            required
            value={petPublicToken}
            onChange={(e) => setPetPublicToken(e.target.value)}
            placeholder="DIM-XXXX-XXXX"
            className="font-mono uppercase tracking-wider"
          />
          <p className="text-[12px] text-ln-op-mute">
            El dueño tiene este token en la credencial pública (escaneable o en su perfil).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!petPublicToken.trim()}
          className="w-full rounded-[6px] bg-ln-op-warn px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 2 — Cuándo */}
      <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
        <div className="space-y-1.5">
          <label htmlFor="occurredAt" className="block text-[13px] font-medium text-ln-op-ink">
            Fecha del incidente<span className="text-ln-op-danger ml-0.5">*</span>
          </label>
          <LnInput
            id="occurredAt"
            type="date"
            required
            max={today}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={!occurredAt}
          className="w-full rounded-[6px] bg-ln-op-warn px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 3 — Víctima + contexto */}
      <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
        <div className="space-y-1.5">
          <label
            htmlFor="locationDescription"
            className="block text-[13px] font-medium text-ln-op-ink"
          >
            Lugar
          </label>
          <LnInput
            id="locationDescription"
            type="text"
            value={locationDescription}
            onChange={(e) => setLocationDescription(e.target.value)}
            placeholder="Ej: Plaza Italia, esquina Cerviño"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bite-locality" className="block text-[13px] font-medium text-ln-op-ink">
            Jurisdicción del incidente
          </label>
          <LocalityPickerAcross
            id="bite-locality"
            placeholder="Localidad o barrio del incidente…"
            onSelect={(result) => {
              setProvinceCode(result?.provinceCode ?? "");
              setProvinceName(result?.provinceName ?? "");
              setLocalityName(result?.localityName ?? "");
            }}
          />
          <p className="mt-1 text-[12px] text-ln-op-mute">
            Para enrutar el reporte a la autoridad sanitaria correspondiente. Si no la elegís,
            usamos la jurisdicción registrada de la mascota.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="block text-[13px] font-medium text-ln-op-ink">
            Tipo de víctima<span className="text-ln-op-danger ml-0.5">*</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "human", label: "Persona" },
                { value: "animal", label: "Otro animal" },
                { value: "unknown", label: "No sé" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVictimKind(opt.value)}
                className={`flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                  victimKind === opt.value
                    ? "border-ln-op-azul bg-ln-op-azul/10 text-ln-op-ink"
                    : "border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {victimKind === "human" && (
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-stripe p-4 space-y-3">
            <p className="text-[12px] text-ln-op-mute">
              Datos de contacto opcionales — para denuncia obligatoria a autoridad sanitaria si
              corresponde.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="victimContactName"
                className="text-[12px] uppercase tracking-wider text-ln-op-mute"
              >
                Nombre
              </label>
              <LnInput
                id="victimContactName"
                type="text"
                value={victimContactName}
                onChange={(e) => setVictimContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="victimContactPhone"
                className="text-[12px] uppercase tracking-wider text-ln-op-mute"
              >
                Teléfono
              </label>
              <LnInput
                id="victimContactPhone"
                type="tel"
                value={victimContactPhone}
                onChange={(e) => setVictimContactPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="victimAgeEstimate"
                className="text-[12px] uppercase tracking-wider text-ln-op-mute"
              >
                Edad aproximada
              </label>
              <LnInput
                id="victimAgeEstimate"
                type="text"
                value={victimAgeEstimate}
                onChange={(e) => setVictimAgeEstimate(e.target.value)}
                placeholder="Ej: niño, adulto, mayor"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="severity" className="block text-[13px] font-medium text-ln-op-ink">
            Severidad<span className="text-ln-op-danger ml-0.5">*</span>
          </label>
          <LnSelect
            id="severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            required
          >
            <option value="" disabled>
              Elegí una opción
            </option>
            <option value="minor">Leve — sin sangrado, rasguño</option>
            <option value="moderate">Moderada — sangrado, requiere atención</option>
            <option value="severe">Grave — heridas profundas, hospital</option>
          </LnSelect>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="injuriesSummary" className="block text-[13px] font-medium text-ln-op-ink">
            Resumen clínico de las heridas
          </label>
          <LnTextarea
            id="injuriesSummary"
            value={injuriesSummary}
            onChange={(e) => setInjuriesSummary(e.target.value)}
            rows={2}
            placeholder="Ej: laceración profunda en antebrazo izquierdo, requirió sutura."
          />
        </div>

        <div className="space-y-1.5">
          <LnCheckbox checked={vetInvolved} onChange={(e) => setVetInvolved(e.target.checked)}>
            Intervino un profesional veterinario en el incidente o atención posterior.
          </LnCheckbox>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="context" className="block text-[13px] font-medium text-ln-op-ink">
            Contexto adicional
          </label>
          <LnTextarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Ej: el animal estaba suelto sin correa en plaza pública."
          />
        </div>

        <button
          type="button"
          onClick={() => setStep(4)}
          disabled={!severity}
          className="w-full rounded-[6px] bg-ln-op-warn px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 4 — Confirmar + submit */}
      <section className={step === 4 ? "space-y-4" : "sr-only"} aria-hidden={step !== 4}>
        <div className="rounded-[6px] border border-ln-op-warn bg-ln-op-warn/10 p-4 space-y-2">
          <LnCheckbox
            checked={confirmObservation}
            onChange={(e) => setConfirmObservation(e.target.checked)}
            labelClassName="text-ln-op-ink-2!"
          >
            Entiendo que esto inicia un período de observación antirrábica obligatorio de 10 días
            (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987) y se notifica al dueño y a la autoridad
            sanitaria correspondiente.
          </LnCheckbox>
        </div>

        {state.error && (
          <p className="text-[13px] text-ln-op-danger" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !confirmObservation}
          className="w-full rounded-[6px] bg-ln-op-warn px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Reportando..." : "Confirmar mordedura"}
        </button>
      </section>
    </LnWizardShell>
  );
}
