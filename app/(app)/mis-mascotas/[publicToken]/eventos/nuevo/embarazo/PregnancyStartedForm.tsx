"use client";

import { useActionState } from "react";

import type { PregnancyFormState } from "@/app/actions/pregnancy";
import { Input, Textarea } from "@/components/poncho";

const initialState: PregnancyFormState = { error: null };

type FormAction = (prev: PregnancyFormState, formData: FormData) => Promise<PregnancyFormState>;

export function PregnancyStartedForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <p className="text-sm rounded-lg border border-gob-danger bg-gob-danger/10 px-4 py-3 text-gob-danger   ">
        Esta acción dispara recordatorios automáticos de controles veterinarios cada dos semanas.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className="block text-sm font-medium text-gob-text">
          Fecha estimada de inicio<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <Input id="occurredAt" name="occurredAt" type="date" required defaultValue={today} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="weeksAtDiagnosis" className="block text-sm font-medium text-gob-text">
          Semanas estimadas al diagnóstico
        </label>
        <Input
          id="weeksAtDiagnosis"
          name="weeksAtDiagnosis"
          type="number"
          min={0}
          max={12}
          placeholder="0–12 (opcional)"
        />
        <p className="text-xs text-gob-text-muted ">
          Si tu vet te dio una estimación, ingresala. Sino dejalo vacío.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="vetConsulted" className="block text-sm font-medium text-gob-text">
          Veterinario consultado
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
        {isPending ? "Registrando…" : "Registrar embarazo"}
      </button>
    </form>
  );
}
