"use client";

import { useActionState, useState } from "react";

import type { PregnancyFormState } from "@/app/actions/pregnancy";
import { Input, Textarea } from "@/components/poncho";

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
        <label htmlFor="occurredAt" className="block text-sm font-medium text-gob-text">
          Fecha del cierre<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <Input id="occurredAt" name="occurredAt" type="date" required defaultValue={today} />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-gob-text">
          Resultado<span className="text-gob-danger ml-0.5">*</span>
        </legend>
        {OUTCOMES.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-gob-text ">
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
          <label htmlFor="liveBirthsCount" className="block text-sm font-medium text-gob-text">
            Cantidad de crías nacidas vivas<span className="text-gob-danger ml-0.5">*</span>
          </label>
          <Input
            id="liveBirthsCount"
            name="liveBirthsCount"
            type="number"
            min={1}
            max={20}
            required={outcome === "live_birth"}
            placeholder="1–20"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="vetConsulted" className="block text-sm font-medium text-gob-text">
          Veterinario que asistió
        </label>
        <Input
          id="vetConsulted"
          name="vetConsulted"
          type="text"
          placeholder="Dr. García · Clínica Veterinaria X"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium text-gob-text">
          Notas adicionales
        </label>
        <Textarea id="notes" name="notes" rows={3} placeholder="Detalles que quieras recordar…" />
      </div>

      <p className="text-xs rounded-lg border border-gob-border bg-gob-surface-alt px-4 py-3 text-gob-text-gray   ">
        Tras este registro la mascota podrá ser candidata para futuros embarazos. Si querés
        evitarlo, considerá registrar también una esterilización.
      </p>

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Cerrando…" : "Confirmar fin de gestación"}
      </button>
    </form>
  );
}
