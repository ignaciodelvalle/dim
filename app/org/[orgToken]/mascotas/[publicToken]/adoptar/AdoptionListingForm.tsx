"use client";

// AdoptionListingForm — 2-step wizard for adoption listing edit + publish.
// Trilogy unification handoff §4 PR-032 (scoped to 2 steps; the original
// 3-step plan included a photo carousel + drag-drop reorder which is
// parked — no pet_photos table exists today, see docs/superpowers/plans/
// 2026-05-27-spec-later-tracker.md for the deferred work).
//
// Steps:
//   1. Historia y atributos — story + requirements + age/size/energy +
//      convivencia tri-state + fee. CTA Guardar y continuar (calls
//      updateAdoptionListingContentAction; on success → step 2).
//   2. Visibilidad pública — status controls (Publicar adopción / Pausar /
//      Despublicar) + summary recap. CTA per current state.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  setAdoptionListingStatusAction,
  updateAdoptionListingContentAction,
} from "@/app/actions/adoption-listing";
import { WizardShell } from "@/components/poncho/Wizard";
import {
  ADOPTION_AGE_BUCKETS,
  ADOPTION_ENERGY_LEVELS,
  ADOPTION_SIZE_ESTIMATES,
  type AgeBucket,
  type EnergyLevel,
  type SizeEstimate,
  ageBucketLabel,
  energyLabel,
  sizeLabel,
} from "@/lib/adoption-listing";

type Initial = {
  isPublished: boolean;
  isPaused: boolean;
  story: string | null;
  requirements: string | null;
  ageBucket: AgeBucket | null;
  sizeEstimate: SizeEstimate | null;
  energyLevel: EnergyLevel | null;
  goodWithKids: boolean | null;
  goodWithDogs: boolean | null;
  goodWithCats: boolean | null;
  needsYard: boolean | null;
  feeArs: number | null;
};

const TOTAL_STEPS = 2;
const STEP_LABELS = ["Historia y atributos", "Visibilidad pública"];

export function AdoptionListingForm({
  petPublicToken,
  initial,
  canPublish,
  petSex,
}: {
  petPublicToken: string;
  initial: Initial;
  canPublish: boolean;
  petSex: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [story, setStory] = useState(initial.story ?? "");
  const [requirements, setRequirements] = useState(initial.requirements ?? "");
  const [ageBucket, setAgeBucket] = useState<AgeBucket | "">(initial.ageBucket ?? "");
  const [sizeEstimate, setSizeEstimate] = useState<SizeEstimate | "">(initial.sizeEstimate ?? "");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">(initial.energyLevel ?? "");
  const [goodWithKids, setGoodWithKids] = useState<boolean | null>(initial.goodWithKids);
  const [goodWithDogs, setGoodWithDogs] = useState<boolean | null>(initial.goodWithDogs);
  const [goodWithCats, setGoodWithCats] = useState<boolean | null>(initial.goodWithCats);
  const [needsYard, setNeedsYard] = useState<boolean | null>(initial.needsYard);
  const [feeArs, setFeeArs] = useState<string>(
    initial.feeArs != null ? String(initial.feeArs) : "",
  );

  function runStatus(action: "publish" | "pause" | "unpause" | "unpublish") {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await setAdoptionListingStatusAction({ petPublicToken, action });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Listo.");
      router.refresh();
    });
  }

  function saveContent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMessage(null);
    const feeNumber = feeArs.trim() ? Number.parseInt(feeArs, 10) : null;
    startTransition(async () => {
      const result = await updateAdoptionListingContentAction({
        petPublicToken,
        story: story.trim() || null,
        requirements: requirements.trim() || null,
        ageBucket: ageBucket || null,
        sizeEstimate: sizeEstimate || null,
        energyLevel: energyLevel || null,
        goodWithKids,
        goodWithDogs,
        goodWithCats,
        needsYard,
        feeArs: feeNumber,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Datos guardados.");
      router.refresh();
      setStep(2);
    });
  }

  return (
    <WizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      {/* Step 1 — Content edit */}
      <section className={step === 1 ? "space-y-4" : "sr-only"} aria-hidden={step !== 1}>
        <form onSubmit={saveContent} className="space-y-4">
          <div>
            <label htmlFor="story" className="block text-sm font-medium text-gob-text mb-1">
              Historia
            </label>
            <textarea
              id="story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              rows={5}
              placeholder="Contá quién es esta mascota, cómo llegó al refugio, qué la hace especial."
              className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
            />
            <p className="text-xs text-gob-text-muted mt-1 tabular-nums">{story.length} / 5000</p>
          </div>

          <div>
            <label htmlFor="requirements" className="block text-sm font-medium text-gob-text mb-1">
              Requisitos para adoptar
            </label>
            <textarea
              id="requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              rows={3}
              placeholder="Mayores de edad, entrevista previa, compromiso de castración, etc."
              className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="age" className="block text-xs text-gob-text-muted mb-1">
                Edad
              </label>
              <select
                id="age"
                value={ageBucket}
                onChange={(e) => setAgeBucket(e.target.value as AgeBucket | "")}
                className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
              >
                <option value="">Sin definir</option>
                {ADOPTION_AGE_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {ageBucketLabel(b, petSex)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="size" className="block text-xs text-gob-text-muted mb-1">
                Talle
              </label>
              <select
                id="size"
                value={sizeEstimate}
                onChange={(e) => setSizeEstimate(e.target.value as SizeEstimate | "")}
                className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
              >
                <option value="">Sin definir</option>
                {ADOPTION_SIZE_ESTIMATES.map((s) => (
                  <option key={s} value={s}>
                    {sizeLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="energy" className="block text-xs text-gob-text-muted mb-1">
                Energía
              </label>
              <select
                id="energy"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(e.target.value as EnergyLevel | "")}
                className="w-full px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
              >
                <option value="">Sin definir</option>
                {ADOPTION_ENERGY_LEVELS.map((e) => (
                  <option key={e} value={e}>
                    {energyLabel(e)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gob-text ">Convivencia</legend>
            <TriState
              label="¿Se lleva bien con chicos?"
              value={goodWithKids}
              onChange={setGoodWithKids}
            />
            <TriState
              label="¿Se lleva bien con otros perros?"
              value={goodWithDogs}
              onChange={setGoodWithDogs}
            />
            <TriState
              label="¿Se lleva bien con gatos?"
              value={goodWithCats}
              onChange={setGoodWithCats}
            />
            <TriState label="¿Necesita patio?" value={needsYard} onChange={setNeedsYard} />
          </fieldset>

          <div>
            <label htmlFor="fee" className="block text-xs text-gob-text-muted mb-1">
              Aporte de adopción (ARS, opcional)
            </label>
            <input
              id="fee"
              type="number"
              min={0}
              value={feeArs}
              onChange={(e) => setFeeArs(e.target.value)}
              placeholder="Ej: 15000"
              className="w-40 px-3 py-2 rounded border border-gob-border-strong  bg-white  text-sm"
            />
            <p className="text-xs text-gob-text-muted mt-1">
              Para cubrir vacunas, castración, traslado. Dejá vacío si no aplica.
            </p>
          </div>

          {error && <output className="block text-sm text-gob-danger ">{error}</output>}
          {okMessage && <output className="block text-sm text-gob-success ">{okMessage}</output>}

          <button
            type="submit"
            disabled={pending}
            className="w-full px-4 py-3 rounded bg-gob-primary  text-white  text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar y continuar"}
          </button>
        </form>
      </section>

      {/* Step 2 — Status / publish */}
      <section className={step === 2 ? "space-y-5" : "sr-only"} aria-hidden={step !== 2}>
        <div className="rounded-lg border border-gob-border  p-4 space-y-2 text-sm">
          <p className="font-semibold text-gob-text ">Lo que vas a publicar</p>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
            <dt className="text-gob-text-muted">Historia</dt>
            <dd className="col-span-2">
              {story ? `${story.slice(0, 80)}${story.length > 80 ? "…" : ""}` : "Sin definir"}
            </dd>
            <dt className="text-gob-text-muted">Edad</dt>
            <dd className="col-span-2">
              {ageBucket ? ageBucketLabel(ageBucket as AgeBucket, petSex) : "—"}
            </dd>
            <dt className="text-gob-text-muted">Talle</dt>
            <dd className="col-span-2">
              {sizeEstimate ? sizeLabel(sizeEstimate as SizeEstimate) : "—"}
            </dd>
            <dt className="text-gob-text-muted">Energía</dt>
            <dd className="col-span-2">
              {energyLevel ? energyLabel(energyLevel as EnergyLevel) : "—"}
            </dd>
            <dt className="text-gob-text-muted">Aporte</dt>
            <dd className="col-span-2">{feeArs || "—"}</dd>
          </dl>
        </div>

        <section className="rounded-lg border border-gob-border-strong  p-4 space-y-3">
          <p className="text-sm font-medium text-gob-text ">Visibilidad pública</p>
          <div className="flex flex-wrap gap-2">
            {!initial.isPublished && (
              <button
                type="button"
                onClick={() => runStatus("publish")}
                disabled={pending || !canPublish}
                className="px-3 py-1.5 rounded text-sm bg-gob-success text-white font-medium hover:bg-gob-success disabled:opacity-50"
                title={canPublish ? undefined : "Resolvé los bloqueos antes de publicar."}
              >
                Publicar adopción
              </button>
            )}
            {initial.isPublished && !initial.isPaused && (
              <>
                <button
                  type="button"
                  onClick={() => runStatus("pause")}
                  disabled={pending}
                  className="px-3 py-1.5 rounded text-sm border border-gob-warning text-gob-warning-text   font-medium hover:bg-gob-warning/10  disabled:opacity-50"
                >
                  Pausar
                </button>
                <button
                  type="button"
                  onClick={() => runStatus("unpublish")}
                  disabled={pending}
                  className="px-3 py-1.5 rounded text-sm border border-gob-danger text-gob-danger   font-medium hover:bg-gob-danger/10  disabled:opacity-50"
                >
                  Despublicar
                </button>
              </>
            )}
            {initial.isPaused && (
              <>
                <button
                  type="button"
                  onClick={() => runStatus("unpause")}
                  disabled={pending}
                  className="px-3 py-1.5 rounded text-sm bg-gob-success text-white font-medium hover:bg-gob-success disabled:opacity-50"
                >
                  Reanudar
                </button>
                <button
                  type="button"
                  onClick={() => runStatus("unpublish")}
                  disabled={pending}
                  className="px-3 py-1.5 rounded text-sm border border-gob-danger text-gob-danger   font-medium hover:bg-gob-danger/10  disabled:opacity-50"
                >
                  Despublicar
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-gob-text-muted">
            Pausar conserva la historia y el contenido. Despublicar borra el timestamp de
            publicación (los textos siguen guardados para una futura republicación).
          </p>
          {!canPublish && !initial.isPublished && (
            <p className="text-xs text-gob-warning-text ">
              Hay bloqueos pendientes (mascota perdida, fallecida, no eligible, en disputa o
              observación antirrábica). Resolvé antes de publicar.
            </p>
          )}
        </section>

        {error && <output className="block text-sm text-gob-danger ">{error}</output>}
        {okMessage && <output className="block text-sm text-gob-success ">{okMessage}</output>}
      </section>
    </WizardShell>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex-1 text-gob-text-gray ">{label}</span>
      <div className="flex gap-1">
        {(
          [
            { v: true, l: "Sí" },
            { v: false, l: "No" },
            { v: null, l: "No sé" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.l}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`px-2 py-1 rounded border text-xs ${
              value === opt.v
                ? "bg-gob-primary  text-white  border-gob-border-strong "
                : "border-gob-border-strong "
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}
