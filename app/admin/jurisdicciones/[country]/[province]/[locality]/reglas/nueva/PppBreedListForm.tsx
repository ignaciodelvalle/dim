"use client";

import { useActionState, useMemo, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import type { RuleImpactPreviewInput } from "@/app/actions/rule-impact-preview";
import { RuleImpactBanner } from "@/components/admin/RuleImpactBanner";
import { LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { DOG_BREEDS, POTENTIALLY_DANGEROUS_DOG_BREEDS } from "@/lib/breeds";

const initialState: BusinessRuleFormState = { error: null };

const DEFAULT_BREEDS_SET = new Set([...POTENTIALLY_DANGEROUS_DOG_BREEDS]);

type Props = {
  mode: "create" | "edit";
  ruleId?: string;
  country: string;
  province: string | null;
  locality: string | null;
  initialBreeds: string[];
  initialNotes: string;
};

export function PppBreedListForm({
  mode,
  ruleId,
  country,
  province,
  locality,
  initialBreeds,
  initialNotes,
}: Props) {
  const action =
    mode === "edit" && ruleId
      ? updateBusinessRuleAction.bind(null, ruleId)
      : createBusinessRuleAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [breeds, setBreeds] = useState<string[]>(initialBreeds);
  const [customBreed, setCustomBreed] = useState("");

  const ALL_BREEDS = Array.from(new Set([...DOG_BREEDS, ...initialBreeds])).sort();

  function toggle(breed: string) {
    setBreeds((prev) =>
      prev.includes(breed) ? prev.filter((b) => b !== breed) : [...prev, breed],
    );
  }
  function addCustom() {
    const b = customBreed.trim();
    if (!b || breeds.includes(b)) return;
    setBreeds((prev) => [...prev, b]);
    setCustomBreed("");
  }

  // Build preview input — recomputed when the breeds selection changes.
  const previewInput = useMemo<RuleImpactPreviewInput | null>(() => {
    if (breeds.length === 0) return null;
    return {
      ruleType: "ppp_breed_list",
      breeds,
      country,
      province,
      locality,
    };
  }, [breeds, country, province, locality]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ruleType" value="ppp_breed_list" />
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />

      <p className="text-[13px] rounded-[6px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-4 py-3 text-ln-op-warn">
        Las mascotas con raza marcada se evalúan automáticamente al guardar. Los dueños afectados
        reciben notificación.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ln-op-ink">Razas consideradas PPP</legend>
        <div className="max-h-72 overflow-y-auto rounded-[6px] border border-ln-op-line p-3 space-y-1.5">
          {ALL_BREEDS.map((b) => (
            <label key={b} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="breeds"
                value={b}
                checked={breeds.includes(b)}
                onChange={() => toggle(b)}
              />
              <span className="text-ln-op-ink">{b}</span>
              {DEFAULT_BREEDS_SET.has(b) && (
                <span className="text-[11px] text-ln-op-mute">(default AR)</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Inline add-breed row: label-less compact layout — Field not used (rule #2) */}
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-ln-op-mute">Agregar raza no estandar</p>
        <div className="flex gap-2">
          <LnInput
            id="customBreed"
            type="text"
            value={customBreed}
            onChange={(e) => setCustomBreed(e.target.value)}
            placeholder="Boxer, Cimarron Uruguayo..."
            className="flex-1"
          />
          <button
            type="button"
            onClick={addCustom}
            className="px-3 py-2 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Impact preview — shown before submission */}
      <RuleImpactBanner input={previewInput} />

      <LnField label="Notas internas (visible solo a admin/govt)">
        {({ id, describedBy, invalid }) => (
          <LnTextarea
            id={id}
            name="notes"
            defaultValue={initialNotes}
            rows={3}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

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
