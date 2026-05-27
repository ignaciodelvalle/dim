"use client";

import { useActionState, useState } from "react";

import type { PregnancyFormState } from "@/app/actions/pregnancy";
import { inputClass, labelClass } from "@/lib/form-classes";

const initialState: PregnancyFormState = { error: null };

type FormAction = (prev: PregnancyFormState, formData: FormData) => Promise<PregnancyFormState>;

const OUTCOMES = [
  { value: "live_birth", label: "Parto exitoso" },
  { value: "stillbirth", label: "Óbito fetal" },
  { value: "miscarriage", label: "Aborto espontáneo" },
  { value: "termination", label: "Terminación médica" },
  { value: "unknown", label: "No sé / no me consta" },
] as const;

type Outcome = (typeof OUTCOMES)[number]["value"];

export function PregnancyEndedForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [outcome, setOutcome] = useState<Outcome>("live_birth");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha del cierre<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={today}
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>
          Resultado<span className="text-red-500 ml-0.5">*</span>
        </legend>
        {OUTCOMES.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-50"
          >
            <input
              type="radio"
              name="outcome"
              value={o.value}
              checked={outcome === o.value}
              onChange={() => setOutcome(o.value)}
              required
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {outcome === "live_birth" && (
        <div className="space-y-1.5">
          <label htmlFor="liveBirthsCount" className={labelClass}>
            Cantidad de crías nacidas vivas<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="liveBirthsCount"
            name="liveBirthsCount"
            type="number"
            min={1}
            max={20}
            required={outcome === "live_birth"}
            placeholder="1–20"
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="vetConsulted" className={labelClass}>
          Veterinario que asistió
        </label>
        <input
          id="vetConsulted"
          name="vetConsulted"
          type="text"
          placeholder="Dr. García · Clínica Veterinaria X"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas adicionales
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Detalles que quieras recordar…"
          className={inputClass}
        />
      </div>

      <p className="text-xs rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        Tras este registro la mascota podrá ser candidata para futuros embarazos. Si querés
        evitarlo, considerá registrar también una esterilización.
      </p>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Cerrando…" : "Confirmar fin de gestación"}
      </button>
    </form>
  );
}
