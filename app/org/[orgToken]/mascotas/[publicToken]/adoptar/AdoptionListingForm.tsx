"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  setAdoptionListingStatusAction,
  updateAdoptionListingContentAction,
} from "@/app/actions/adoption-listing";
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
      const result = await setAdoptionListingStatusAction({
        petPublicToken,
        action,
      });
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
    });
  }

  return (
    <div className="space-y-6">
      {/* Status controls */}
      <section className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-3">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Visibilidad pública
        </p>
        <div className="flex flex-wrap gap-2">
          {!initial.isPublished && (
            <button
              type="button"
              onClick={() => runStatus("publish")}
              disabled={pending || !canPublish}
              className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
              title={canPublish ? undefined : "Resolvé los bloqueos antes de publicar."}
            >
              Publicar
            </button>
          )}
          {initial.isPublished && !initial.isPaused && (
            <>
              <button
                type="button"
                onClick={() => runStatus("pause")}
                disabled={pending}
                className="px-3 py-1.5 rounded text-sm border border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300 font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
              >
                Pausar
              </button>
              <button
                type="button"
                onClick={() => runStatus("unpublish")}
                disabled={pending}
                className="px-3 py-1.5 rounded text-sm border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
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
                className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Reanudar
              </button>
              <button
                type="button"
                onClick={() => runStatus("unpublish")}
                disabled={pending}
                className="px-3 py-1.5 rounded text-sm border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Despublicar
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Pausar conserva la historia y el contenido. Despublicar borra el timestamp de publicación
          (los textos siguen guardados para una futura republicación).
        </p>
      </section>

      {/* Content edits */}
      <form onSubmit={saveContent} className="space-y-4">
        <div>
          <label
            htmlFor="story"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
          >
            Historia
          </label>
          <textarea
            id="story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={5}
            placeholder="Contá quién es esta mascota, cómo llegó al refugio, qué la hace especial."
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
          <p className="text-xs text-neutral-500 mt-1 tabular-nums">{story.length} / 5000</p>
        </div>

        <div>
          <label
            htmlFor="requirements"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
          >
            Requisitos para adoptar
          </label>
          <textarea
            id="requirements"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            rows={3}
            placeholder="Mayores de edad, entrevista previa, compromiso de castración, etc."
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="age" className="block text-xs text-neutral-500 mb-1">
              Edad
            </label>
            <select
              id="age"
              value={ageBucket}
              onChange={(e) => setAgeBucket(e.target.value as AgeBucket | "")}
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
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
            <label htmlFor="size" className="block text-xs text-neutral-500 mb-1">
              Talle
            </label>
            <select
              id="size"
              value={sizeEstimate}
              onChange={(e) => setSizeEstimate(e.target.value as SizeEstimate | "")}
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
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
            <label htmlFor="energy" className="block text-xs text-neutral-500 mb-1">
              Energía
            </label>
            <select
              id="energy"
              value={energyLevel}
              onChange={(e) => setEnergyLevel(e.target.value as EnergyLevel | "")}
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
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
          <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Convivencia
          </legend>
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
          <label htmlFor="fee" className="block text-xs text-neutral-500 mb-1">
            Aporte de adopción (ARS, opcional)
          </label>
          <input
            id="fee"
            type="number"
            min={0}
            value={feeArs}
            onChange={(e) => setFeeArs(e.target.value)}
            placeholder="Ej: 15000"
            className="w-40 px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Para cubrir vacunas, castración, traslado. Dejá vacío si no aplica.
          </p>
        </div>

        {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
        {okMessage && (
          <output className="block text-sm text-emerald-700 dark:text-emerald-300">
            {okMessage}
          </output>
        )}

        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar datos"}
        </button>
      </form>
    </div>
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
      <span className="flex-1 text-neutral-700 dark:text-neutral-300">{label}</span>
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
                ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-50"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}
