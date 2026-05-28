"use client";

import { useActionState, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { Field, Input, Textarea } from "@/components/poncho";
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

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ruleType" value="ppp_breed_list" />
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />

      <p className="text-sm rounded-lg border border-gob-warning bg-gob-warning/10 px-4 py-3 text-gob-warning-text   ">
        Las mascotas con raza marcada se evalúan automáticamente al guardar. Los dueños afectados
        reciben notificación.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gob-text ">Razas consideradas PPP</legend>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-gob-border  p-3 space-y-1.5">
          {ALL_BREEDS.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="breeds"
                value={b}
                checked={breeds.includes(b)}
                onChange={() => toggle(b)}
              />
              <span className="text-gob-text ">{b}</span>
              {DEFAULT_BREEDS_SET.has(b) && (
                <span className="text-xs text-gob-text-muted ">(default AR ✓)</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Inline add-breed row: label-less compact layout — Field not used (rule #2) */}
      <div className="space-y-1.5">
        <p className="text-[0.88em] font-semibold text-gob-text-muted">Agregar raza no estándar</p>
        <div className="flex gap-2">
          <Input
            id="customBreed"
            type="text"
            value={customBreed}
            onChange={(e) => setCustomBreed(e.target.value)}
            placeholder="Boxer, Cimarrón Uruguayo…"
            className="flex-1"
          />
          <button
            type="button"
            onClick={addCustom}
            className="px-3 py-2 rounded-lg border border-gob-border-strong  text-sm"
          >
            Agregar
          </button>
        </div>
      </div>

      <Field label="Notas internas (visible solo a admin/govt)">
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

      {state.warning && <p className="text-sm text-gob-warning-text ">{state.warning}</p>}
      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-primary  text-white  font-medium hover:bg-gob-primary  disabled:opacity-50 transition-colors"
      >
        {isPending ? "Guardando…" : mode === "create" ? "Crear regla" : "Guardar cambios"}
      </button>
    </form>
  );
}
