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

import { type ReportBiteFromOrgFormState, reportBiteFromOrgAction } from "@/app/actions/bite";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { Checkbox, Input, Select, Textarea } from "@/components/poncho";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { WizardShell } from "@/components/poncho/Wizard";

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
      <SuccessScreen
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
    <WizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      {/* Step 1 — Mascota */}
      <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
        <div className="space-y-1.5">
          <label htmlFor="petPublicToken" className="block text-sm font-medium text-gob-text">
            Token público de la mascota<span className="text-gob-danger ml-0.5">*</span>
          </label>
          <Input
            id="petPublicToken"
            type="text"
            required
            value={petPublicToken}
            onChange={(e) => setPetPublicToken(e.target.value)}
            placeholder="DIM-XXXX-XXXX"
            className="font-mono uppercase tracking-wider"
          />
          <p className="text-xs text-gob-text-muted ">
            El dueño tiene este token en la credencial pública (escaneable o en su perfil).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!petPublicToken.trim()}
          className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 2 — Cuándo */}
      <section className={step === 2 ? "space-y-4" : "sr-only"} aria-hidden={step !== 2}>
        <div className="space-y-1.5">
          <label htmlFor="occurredAt" className="block text-sm font-medium text-gob-text">
            Fecha del incidente<span className="text-gob-danger ml-0.5">*</span>
          </label>
          <Input
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
          className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 3 — Víctima + contexto */}
      <section className={step === 3 ? "space-y-4" : "sr-only"} aria-hidden={step !== 3}>
        <div className="space-y-1.5">
          <label htmlFor="locationDescription" className="block text-sm font-medium text-gob-text">
            Lugar
          </label>
          <Input
            id="locationDescription"
            type="text"
            value={locationDescription}
            onChange={(e) => setLocationDescription(e.target.value)}
            placeholder="Ej: Plaza Italia, esquina Cerviño"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bite-locality" className="block text-sm font-medium text-gob-text">
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
          <p className="mt-1 text-xs text-gob-text-muted ">
            Para enrutar el reporte a la autoridad sanitaria correspondiente. Si no la elegís,
            usamos la jurisdicción registrada de la mascota.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="block text-sm font-medium text-gob-text">
            Tipo de víctima<span className="text-gob-danger ml-0.5">*</span>
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
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  victimKind === opt.value
                    ? "border-gob-border-strong bg-gob-surface-alt  "
                    : "border-gob-border-strong "
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {victimKind === "human" && (
          <div className="rounded-xl border border-gob-border  p-4 space-y-3 bg-gob-surface-alt ">
            <p className="text-xs text-gob-text-gray ">
              Datos de contacto opcionales — para denuncia obligatoria a autoridad sanitaria si
              corresponde.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="victimContactName"
                className="text-xs uppercase tracking-wider text-gob-text-muted"
              >
                Nombre
              </label>
              <Input
                id="victimContactName"
                type="text"
                value={victimContactName}
                onChange={(e) => setVictimContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="victimContactPhone"
                className="text-xs uppercase tracking-wider text-gob-text-muted"
              >
                Teléfono
              </label>
              <Input
                id="victimContactPhone"
                type="tel"
                value={victimContactPhone}
                onChange={(e) => setVictimContactPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="victimAgeEstimate"
                className="text-xs uppercase tracking-wider text-gob-text-muted"
              >
                Edad aproximada
              </label>
              <Input
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
          <label htmlFor="severity" className="block text-sm font-medium text-gob-text">
            Severidad<span className="text-gob-danger ml-0.5">*</span>
          </label>
          <Select
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
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="injuriesSummary" className="block text-sm font-medium text-gob-text">
            Resumen clínico de las heridas
          </label>
          <Textarea
            id="injuriesSummary"
            value={injuriesSummary}
            onChange={(e) => setInjuriesSummary(e.target.value)}
            rows={2}
            placeholder="Ej: laceración profunda en antebrazo izquierdo, requirió sutura."
          />
        </div>

        <div className="space-y-1.5">
          <Checkbox checked={vetInvolved} onChange={(e) => setVetInvolved(e.target.checked)}>
            Intervino un profesional veterinario en el incidente o atención posterior.
          </Checkbox>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="context" className="block text-sm font-medium text-gob-text">
            Contexto adicional
          </label>
          <Textarea
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
          className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 4 — Confirmar + submit */}
      <section className={step === 4 ? "space-y-4" : "sr-only"} aria-hidden={step !== 4}>
        <div className="rounded-xl border border-gob-warning  bg-gob-warning/10  p-4 space-y-2">
          <Checkbox
            checked={confirmObservation}
            onChange={(e) => setConfirmObservation(e.target.checked)}
            labelClassName="text-gob-warning-text!"
          >
            Entiendo que esto inicia un período de observación antirrábica obligatorio de 10 días
            (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987) y se notifica al dueño y a la autoridad
            sanitaria correspondiente.
          </Checkbox>
        </div>

        {state.error && (
          <p className="text-sm text-gob-danger " role="alert">
            {state.error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || !confirmObservation}
          className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Reportando..." : "Confirmar mordedura"}
        </button>
      </section>
    </WizardShell>
  );
}
