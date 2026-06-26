"use client";

// IntakeForm — 4-step wizard for org-side intake.
// Trilogy unification handoff §4 PR-030.
//
// Steps:
//   1. Microchip — quick chip lookup (optional). If chip matches a lost pet,
//      createIntakeAction redirects to the match flow on submit. If the user
//      has no chip number, they advance to step 2 with the field empty.
//   2. Identidad — name, species, sex, age, breed, color, distinguishing
//      features. CTA Continuar.
//   3. Estado del ingreso — reason, custody role, occurredAt, condition,
//      jurisdiction. CTA Continuar.
//   4. Confirmar — recap of what's about to land + Crear ingreso CTA.
//      On success → SuccessScreen "Mascota ingresada: [name]" with three
//      actions (Asignar tránsito, Publicar adopción, Ver ficha).
//
// State stays controlled at the wizard top — same pattern as
// FosterVolunteerWizard. Submit builds a FormData manually and posts it
// to createIntakeAction with noRedirect=1.

import { useState, useTransition } from "react";

import { type IntakeFormState, createIntakeAction } from "@/app/actions/intake";
import { LnRadio } from "@/components/ui/Field";
import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { LnWizardShell } from "@/components/ui/WizardShell";

// "seizure" is intentionally absent: a decomiso is a State act (DC1),
// not something a refugio self-records through this form. Seizures go
// through the government decomiso flow (welfare.decomiso.execute).
const INTAKE_REASONS = [
  { value: "rescue", label: "Rescate" },
  { value: "surrender", label: "Entrega del dueño" },
  { value: "stray_found", label: "Animal en la vía pública" },
  { value: "other", label: "Otro" },
] as const;

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Identificación", "Identidad", "Estado", "Confirmar"];

const inputCls =
  "w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 text-[13px] text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul";

export function IntakeForm({ orgToken }: { orgToken: string }) {
  const action = createIntakeAction.bind(null, orgToken);
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<IntakeFormState>({ error: null });

  // Controlled state for every field. Strings throughout; the action
  // does its own parsing and coercion.
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [sex, setSex] = useState<"unknown" | "male" | "female">("unknown");
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [breed, setBreed] = useState("");
  const [color, setColor] = useState("");
  const [distinguishingFeatures, setDistinguishingFeatures] = useState("");
  const [microchipId, setMicrochipId] = useState("");
  const [microchipCountryCode, setMicrochipCountryCode] = useState("858");
  const [tattooCode, setTattooCode] = useState("");
  const [intakeReason, setIntakeReason] = useState("");
  const [custodyRole, setCustodyRole] = useState<"shelter_custody" | "owner">("shelter_custody");
  const [occurredAt, setOccurredAt] = useState(today);
  const [intakeCondition, setIntakeCondition] = useState("");
  const [rescueJurisdiction, setRescueJurisdiction] = useState("");

  function submit() {
    setState({ error: null });
    const fd = new FormData();
    fd.set("name", name);
    fd.set("species", species);
    fd.set("sex", sex);
    if (ageYears) fd.set("ageYears", ageYears);
    if (ageMonths) fd.set("ageMonths", ageMonths);
    if (breed) fd.set("breed", breed);
    if (color) fd.set("color", color);
    if (distinguishingFeatures) fd.set("distinguishingFeatures", distinguishingFeatures);
    if (microchipId) fd.set("microchipId", microchipId);
    if (microchipCountryCode) fd.set("microchipCountryCode", microchipCountryCode);
    if (tattooCode) fd.set("tattooCode", tattooCode);
    fd.set("intakeReason", intakeReason);
    fd.set("custodyRole", custodyRole);
    fd.set("occurredAt", occurredAt);
    if (intakeCondition) fd.set("intakeCondition", intakeCondition);
    if (rescueJurisdiction) fd.set("rescueJurisdiction", rescueJurisdiction);
    fd.set("noRedirect", "1");
    // Thread bypass tokens from previous server responses so re-submits skip
    // already-acknowledged warnings (chip force, tattoo ack).
    if (state.forceToken) fd.set("forceToken", state.forceToken);
    if (state.tattooAckToken) fd.set("tattooAckToken", state.tattooAckToken);
    startTransition(async () => {
      const result = await action({ error: null }, fd);
      setState(result);
    });
  }

  function loadAnother() {
    // UX 3.6 (e): "Guardar y cargar otro" — preserve the batch-shared fields
    // (intake reason, custody role, date, jurisdiction, chip country) and clear
    // the per-animal fields, then return to step 1 for the next animal of the
    // same intake (e.g. a litter or a multi-animal rescue).
    setName("");
    setSpecies("");
    setSex("unknown");
    setAgeYears("");
    setAgeMonths("");
    setBreed("");
    setColor("");
    setDistinguishingFeatures("");
    setMicrochipId("");
    setTattooCode("");
    setIntakeCondition("");
    setState({ error: null });
    setStep(1);
  }

  if (state.ok && state.createdPetToken && state.createdPetName) {
    const orgRoot = `/org/${orgToken}`;
    return (
      <LnSuccessScreen
        title={`Mascota ingresada: ${state.createdPetName}`}
        description="Quedó registrada bajo custodia del refugio. Podés continuar el flujo desde acá."
        next={[
          {
            // Foster placement is initiated from the volunteer pool: ?pet=<token>
            // preselects this pet and match-scores volunteers for it, then each
            // row's "Proponer tránsito" sends the proposal (proposeFosterAction).
            label: "Asignar tránsito",
            href: `${orgRoot}/voluntarios?pet=${state.createdPetToken}`,
          },
          {
            // Batch intake: clears per-animal fields, keeps the shared ones.
            label: "Guardar y cargar otro",
            onClick: loadAnother,
            variant: "secondary",
          },
          {
            label: "Publicar adopción",
            href: `${orgRoot}/mascotas/${state.createdPetToken}/adoptar`,
            variant: "secondary",
          },
          {
            label: "Ver ficha",
            href: `${orgRoot}/mascotas/${state.createdPetToken}`,
            variant: "tertiary",
          },
        ]}
      />
    );
  }

  const canSubmit = !!name && !!species && !!intakeReason && !!occurredAt && !pending;

  return (
    <LnWizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      {/* Step 1 — Identificación */}
      <section className={step === 1 ? "space-y-5" : "sr-only"} aria-hidden={step !== 1}>
        <p className="text-[13px] text-ln-op-ink-2">
          Si la mascota tiene microchip o tatuaje, ingrésalos. Si el chip coincide con una mascota
          perdida en MiMAR, vamos a redirigirte al flujo de match para confirmar la identidad.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Número de microchip</span>
            <input
              type="text"
              value={microchipId}
              onChange={(e) => setMicrochipId(e.target.value)}
              maxLength={20}
              placeholder="985141004321456"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">País del chip</span>
            <input
              type="text"
              value={microchipCountryCode}
              onChange={(e) => setMicrochipCountryCode(e.target.value)}
              maxLength={3}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[13px] text-ln-op-ink">Código de tatuaje</span>
          <input
            type="text"
            value={tattooCode}
            onChange={(e) => setTattooCode(e.target.value)}
            maxLength={60}
            placeholder="Ej: K9-2014, A1B2"
            className={inputCls}
          />
          <span className="text-sm text-ln-op-mute">
            Opcional. Se verificará contra registros existentes antes de guardar.
          </span>
        </label>
        <button
          type="button"
          onClick={() => setStep(2)}
          className="w-full rounded-[6px] bg-ln-op-azul px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          {microchipId ? "Continuar (chequearemos el chip al confirmar)" : "Continuar sin chip"}
        </button>
      </section>

      {/* Step 2 — Identidad */}
      <section className={step === 2 ? "space-y-5" : "sr-only"} aria-hidden={step !== 2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Nombre o alias temporal *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className={inputCls}
              placeholder="Ej: Negrita, Sin nombre, Marrón #4"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Especie *</span>
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              required
              className={inputCls}
            >
              <option value="" disabled>
                Seleccionar
              </option>
              <option value="dog">Perro</option>
              <option value="cat">Gato</option>
              <option value="other">Otra</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-[13px] text-ln-op-ink">Sexo</legend>
          <div className="flex flex-wrap gap-3 text-[13px]">
            {(["unknown", "male", "female"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1 text-ln-op-ink">
                <input
                  type="radio"
                  name="sex"
                  value={v}
                  checked={sex === v}
                  onChange={() => setSex(v)}
                />{" "}
                {v === "unknown" ? "Desconocido" : v === "male" ? "Macho" : "Hembra"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Edad — años</span>
            <input
              type="number"
              min={0}
              max={40}
              value={ageYears}
              onChange={(e) => setAgeYears(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Edad — meses</span>
            <input
              type="number"
              min={0}
              max={11}
              value={ageMonths}
              onChange={(e) => setAgeMonths(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Raza</span>
            <input
              type="text"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] text-ln-op-ink">Color / pelaje</span>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[13px] text-ln-op-ink">Señas particulares</span>
          <textarea
            value={distinguishingFeatures}
            onChange={(e) => setDistinguishingFeatures(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Cicatrices, manchas, oreja cortada, etc."
            className={inputCls}
          />
        </label>

        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={!name || !species}
          className="w-full rounded-[6px] bg-ln-op-azul px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 3 — Estado */}
      <section className={step === 3 ? "space-y-5" : "sr-only"} aria-hidden={step !== 3}>
        <fieldset className="space-y-1">
          <legend className="text-[13px] text-ln-op-ink">Motivo del ingreso *</legend>
          <div className="flex flex-col gap-1 text-[13px]">
            {INTAKE_REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2 text-ln-op-ink">
                <input
                  type="radio"
                  name="intakeReason"
                  value={r.value}
                  checked={intakeReason === r.value}
                  onChange={() => setIntakeReason(r.value)}
                />{" "}
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-[13px] text-ln-op-ink">Rol de la organización</legend>
          <div className="flex flex-col gap-2">
            <LnRadio
              name="custodyRole"
              value="shelter_custody"
              checked={custodyRole === "shelter_custody"}
              onChange={() => setCustodyRole("shelter_custody")}
            >
              <span className="space-y-0.5">
                <span className="block font-medium">Custodia temporal</span>
                <span className="block text-sm! text-ln-op-mute!">
                  El animal queda bajo cuidado del refugio hasta que se concrete una adopción.
                </span>
              </span>
            </LnRadio>
            <LnRadio
              name="custodyRole"
              value="owner"
              checked={custodyRole === "owner"}
              onChange={() => setCustodyRole("owner")}
            >
              <span className="space-y-0.5">
                <span className="block font-medium">Dueño/a permanente</span>
                <span className="block text-sm! text-ln-op-mute!">
                  El animal queda registrado a nombre de la organización (santuario, adopción
                  institucional).
                </span>
              </span>
            </LnRadio>
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-[13px] text-ln-op-ink">Fecha del ingreso</span>
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={`${inputCls} sm:w-auto`}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[13px] text-ln-op-ink">Condición al ingreso</span>
          <textarea
            value={intakeCondition}
            onChange={(e) => setIntakeCondition(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Estado nutricional, lesiones, enfermedades aparentes…"
            className={inputCls}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[13px] text-ln-op-ink">Jurisdicción / lugar de rescate</span>
          <input
            type="text"
            value={rescueJurisdiction}
            onChange={(e) => setRescueJurisdiction(e.target.value)}
            maxLength={200}
            placeholder="Ej: Mataderos, CABA"
            className={inputCls}
          />
        </label>

        <button
          type="button"
          onClick={() => setStep(4)}
          disabled={!intakeReason}
          className="w-full rounded-[6px] bg-ln-op-azul px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Continuar
        </button>
      </section>

      {/* Step 4 — Confirmar */}
      <section className={step === 4 ? "space-y-5" : "sr-only"} aria-hidden={step !== 4}>
        <div className="rounded-[6px] border border-ln-op-line bg-ln-op-stripe p-4 space-y-2">
          <p className="text-[13px] font-semibold text-ln-op-ink">Resumen del ingreso</p>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
            <dt className="text-ln-op-mute">Nombre</dt>
            <dd className="col-span-2 text-ln-op-ink">{name || "—"}</dd>
            <dt className="text-ln-op-mute">Especie</dt>
            <dd className="col-span-2 text-ln-op-ink">{species || "—"}</dd>
            <dt className="text-ln-op-mute">Microchip</dt>
            <dd className="col-span-2 font-mono text-ln-op-ink">{microchipId || "(sin chip)"}</dd>
            <dt className="text-ln-op-mute">Tatuaje</dt>
            <dd className="col-span-2 font-mono text-ln-op-ink">{tattooCode || "(sin tatuaje)"}</dd>
            <dt className="text-ln-op-mute">Motivo</dt>
            <dd className="col-span-2 text-ln-op-ink">
              {INTAKE_REASONS.find((r) => r.value === intakeReason)?.label ?? "—"}
            </dd>
            <dt className="text-ln-op-mute">Rol</dt>
            <dd className="col-span-2 text-ln-op-ink">
              {custodyRole === "shelter_custody" ? "Custodia temporal" : "Dueño/a permanente"}
            </dd>
            <dt className="text-ln-op-mute">Fecha</dt>
            <dd className="col-span-2 text-ln-op-ink">{occurredAt}</dd>
          </dl>
        </div>

        {state.warning === "CHIP_MATCH_ACTIVE" && (
          <div className="rounded-[6px] border border-ln-op-warn bg-ln-op-warn/10 p-3 text-sm text-ln-op-ink-2">
            El chip que ingresaste coincide con una mascota activa en otro registro. Revisá con un
            admin antes de continuar.
          </div>
        )}

        {state.warning === "TATTOO_MATCH_POSSIBLE" && state.matchedPetToken && (
          <div className="rounded-[6px] border border-ln-op-warn bg-ln-op-warn/10 p-3 text-sm text-ln-op-ink-2 space-y-2">
            <p>
              <strong>Posible coincidencia por tatuaje.</strong> El código que ingresaste coincide
              con una mascota ya registrada en MiMAR. Verificá con la foto antes de continuar.
            </p>
            <p>
              <a
                href={`/p/${state.matchedPetToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium text-ln-op-azul"
              >
                Ver credencial pública de la mascota coincidente
              </a>
            </p>
            <p className="text-ln-op-mute">
              Si confirmás que son animales distintos, hacé clic en &ldquo;Crear ingreso&rdquo; para
              continuar.
            </p>
          </div>
        )}

        {state.error && (
          <p className="rounded-[6px] border border-ln-op-danger bg-ln-op-danger/10 px-3 py-2 text-[13px] text-ln-op-danger">
            {state.error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-[6px] bg-ln-op-azul px-4 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Registrando…" : "Crear ingreso"}
        </button>
      </section>
    </LnWizardShell>
  );
}
