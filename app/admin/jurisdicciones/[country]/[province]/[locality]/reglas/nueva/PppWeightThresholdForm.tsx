"use client";

import { useActionState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { inputClass, labelClass } from "@/lib/form-classes";

const initialState: BusinessRuleFormState = { error: null };

type Props = {
  mode: "create" | "edit";
  ruleId?: string;
  country: string;
  province: string | null;
  locality: string | null;
  initialKg: number | null;
  initialAppliesIfBreedNotPPP: boolean;
  initialNotes: string;
};

export function PppWeightThresholdForm({
  mode,
  ruleId,
  country,
  province,
  locality,
  initialKg,
  initialAppliesIfBreedNotPPP,
  initialNotes,
}: Props) {
  const action =
    mode === "edit" && ruleId
      ? updateBusinessRuleAction.bind(null, ruleId)
      : createBusinessRuleAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ruleType" value="ppp_weight_threshold" />
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />

      <p className="text-sm text-gob-text-gray">
        Define un umbral de peso por sobre el cual el animal se considera PPP por tamaño. Dejá kg
        vacío para no aplicar threshold (solo regla de razas).
      </p>

      <div className="space-y-1.5">
        <label htmlFor="kg" className={labelClass}>
          Peso mínimo (kg)
        </label>
        <input
          id="kg"
          name="kg"
          type="number"
          min={0}
          max={200}
          step="0.1"
          defaultValue={initialKg ?? ""}
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="appliesIfBreedNotPPP"
          defaultChecked={initialAppliesIfBreedNotPPP}
          className="mt-1"
        />
        <span>
          Aplicar el threshold incluso a razas NO listadas en{" "}
          <span className="font-mono text-xs">ppp_breed_list</span>. Si está desactivado, el
          threshold solo agrega una segunda condición a las razas ya consideradas PPP.
        </span>
      </label>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notas internas
        </label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={initialNotes}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
        />
      </div>

      {state.warning && <p className="text-sm text-gob-warning-text">{state.warning}</p>}
      {state.error && (
        <p className="text-sm text-gob-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Guardando…" : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </button>
    </form>
  );
}
