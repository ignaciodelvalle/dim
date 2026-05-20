"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitAdoptionApplicationAction } from "@/app/actions/adoption-applications";
import { labelClass } from "@/lib/form-classes";

type HousingType = "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";

const HOUSING_OPTIONS: Array<{ value: HousingType; label: string }> = [
  { value: "casa_con_patio", label: "Casa con patio" },
  { value: "casa_sin_patio", label: "Casa sin patio" },
  { value: "departamento", label: "Departamento" },
  { value: "otro", label: "Otra" },
];

export function ApplicationForm({
  petPublicToken,
  petName,
  applicantEmail,
}: {
  petPublicToken: string;
  petName: string;
  applicantEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [housingType, setHousingType] = useState<HousingType | "">("");
  const [otherPets, setOtherPets] = useState("");
  const [dailyRoutine, setDailyRoutine] = useState("");
  const [notes, setNotes] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!housingType) {
      setError("Elegí el tipo de vivienda.");
      return;
    }
    startTransition(async () => {
      const result = await submitAdoptionApplicationAction({
        petPublicToken,
        housingType,
        otherPets: otherPets.trim() || null,
        dailyRoutine: dailyRoutine.trim() || null,
        notes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/mis-mascotas/postulaciones?nueva=${result.applicationEventId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        Compartinos un poco sobre tu situación para que el refugio sepa si tu hogar encaja con lo
        que necesita {petName}. Te van a contactar a tu email{" "}
        <span className="font-medium">{applicantEmail}</span> para coordinar los próximos pasos.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          ¿Cómo es tu vivienda?
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {HOUSING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                housingType === opt.value
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-neutral-300 dark:border-neutral-700"
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

      <div>
        <label htmlFor="other-pets" className={`${labelClass} mb-1`}>
          ¿Tenés otras mascotas? <span className="text-neutral-500">(opcional)</span>
        </label>
        <textarea
          id="other-pets"
          value={otherPets}
          onChange={(e) => setOtherPets(e.target.value)}
          rows={2}
          placeholder='Ej: "un gato castrado adulto, sociable"'
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      <div>
        <label htmlFor="daily-routine" className={`${labelClass} mb-1`}>
          Cómo es tu día a día <span className="text-neutral-500">(opcional)</span>
        </label>
        <textarea
          id="daily-routine"
          value={dailyRoutine}
          onChange={(e) => setDailyRoutine(e.target.value)}
          rows={3}
          placeholder="¿Quién está en casa durante el día? ¿Hay nenes? ¿Alguien la cuida si viajás?"
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      <div>
        <label htmlFor="notes" className={`${labelClass} mb-1`}>
          Algo más que quieras contar <span className="text-neutral-500">(opcional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      {error && <output className="block text-sm text-red-700 dark:text-red-300">{error}</output>}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-3 rounded-lg bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Enviando postulación..." : "Enviar postulación"}
      </button>
    </form>
  );
}
