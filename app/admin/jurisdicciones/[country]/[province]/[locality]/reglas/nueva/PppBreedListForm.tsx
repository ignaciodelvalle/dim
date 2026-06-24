"use client";

import { useActionState, useMemo, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import type { RuleImpactPreviewInput } from "@/app/actions/rule-impact-preview";
import { RuleImpactBanner, type RuleImpactResult } from "@/components/admin/RuleImpactBanner";
import { LnCheckbox } from "@/components/ui/Field";
import { LnField, LnInput, LnTextarea } from "@/components/ui/Field";
import { OpButton } from "@/components/ui/dashboard";
import { DOG_BREEDS, POTENTIALLY_DANGEROUS_DOG_BREEDS } from "@/lib/breeds";
import { canSaveWithImpactGate, requiresImpactConfirmation } from "@/lib/rule-impact-gate";

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

  // C9: impact gate. The banner already computes the affected-pet count; we
  // thread it here (no second preview call) and require the operator to
  // acknowledge a non-zero blast radius before the save may fire.
  const [impact, setImpact] = useState<RuleImpactResult>({ status: "idle", count: null });
  const [acknowledged, setAcknowledged] = useState(false);

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

  const gateState = {
    status: impact.status,
    count: impact.count,
    acknowledged,
  };
  const mustConfirm = requiresImpactConfirmation(gateState);
  const canSave = canSaveWithImpactGate(gateState);

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
        <p className="text-[12px] font-semibold text-ln-op-mute">Agregar raza no estándar</p>
        <div className="flex gap-2">
          <LnInput
            id="customBreed"
            type="text"
            value={customBreed}
            onChange={(e) => setCustomBreed(e.target.value)}
            placeholder="Boxer, Cimarrón Uruguayo..."
            className="flex-1"
          />
          <OpButton type="button" onClick={addCustom} variant="ghost">
            Agregar
          </OpButton>
        </div>
      </div>

      {/* Impact preview — shown before submission. C9: thread the result up so
          the save can gate on acknowledgement. A new count invalidates any prior
          acknowledgement so the operator re-confirms the new blast radius. */}
      <RuleImpactBanner
        input={previewInput}
        onResult={(result) => {
          setImpact(result);
          setAcknowledged(false);
        }}
      />

      {/* C9: confirmation gate — required only when the rule would affect pets. */}
      {mustConfirm && impact.status === "done" && impact.count !== null && impact.count > 0 && (
        <LnCheckbox
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          labelClassName="text-xs! text-ln-op-warn!"
        >
          Confirmo que entiendo que guardar esta regla reevaluará y notificará a{" "}
          {impact.count.toLocaleString("es-AR")} {impact.count === 1 ? "dueño" : "dueños"} de las
          mascotas afectadas.
        </LnCheckbox>
      )}

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

      <OpButton
        type="submit"
        disabled={isPending || !canSave}
        loading={isPending}
        variant="primary"
        block
      >
        {isPending ? "Guardando..." : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </OpButton>
    </form>
  );
}
