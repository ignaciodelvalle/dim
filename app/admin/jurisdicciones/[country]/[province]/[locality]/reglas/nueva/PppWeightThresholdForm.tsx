"use client";

import { useActionState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";

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

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Define un umbral de peso por sobre el cual el animal se considera PPP por tamaño. Dejá kg
        vacío para no aplicar threshold (solo regla de razas).
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor="kg"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
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
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
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
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Notas internas
        </label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={initialNotes}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
      </div>

      {state.warning && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{state.warning}</p>
      )}
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Guardando…" : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </button>
    </form>
  );
}
