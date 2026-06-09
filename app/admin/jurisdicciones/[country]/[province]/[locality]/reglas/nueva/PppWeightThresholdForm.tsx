"use client";

import { useActionState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { Checkbox, Field, Input, Textarea } from "@/components/poncho";

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

      <p className="text-[13px] text-ln-op-ink-2">
        Define un umbral de peso por sobre el cual el animal se considera PPP por tamano. Deja kg
        vacio para no aplicar threshold (solo regla de razas).
      </p>

      <Field label="Peso minimo (kg)">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="kg"
            type="number"
            min={0}
            max={200}
            step="0.1"
            defaultValue={initialKg ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Checkbox name="appliesIfBreedNotPPP" defaultChecked={initialAppliesIfBreedNotPPP}>
        Aplicar el threshold incluso a razas NO listadas en{" "}
        <span className="font-mono text-[11px]">ppp_breed_list</span>. Si esta desactivado, el
        threshold solo agrega una segunda condicion a las razas ya consideradas PPP.
      </Checkbox>

      <Field label="Notas internas">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="notes"
            defaultValue={initialNotes}
            rows={3}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {state.warning && <p className="text-[13px] text-ln-op-warn">{state.warning}</p>}
      {state.error && (
        <p className="text-[13px] text-ln-op-danger" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-[6px] bg-ln-op-navy text-white font-semibold text-[13px] hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Guardando..." : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </button>
    </form>
  );
}
