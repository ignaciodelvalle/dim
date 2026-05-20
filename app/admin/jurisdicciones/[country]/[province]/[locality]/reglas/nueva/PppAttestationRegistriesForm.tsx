"use client";

import { useActionState, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";

const initialState: BusinessRuleFormState = { error: null };

type Registry = { id: string; label: string; required: boolean };

type Props = {
  mode: "create" | "edit";
  ruleId?: string;
  country: string;
  province: string | null;
  locality: string | null;
  initialRegistries: Registry[];
  initialNotes: string;
};

export function PppAttestationRegistriesForm({
  mode,
  ruleId,
  country,
  province,
  locality,
  initialRegistries,
  initialNotes,
}: Props) {
  const action =
    mode === "edit" && ruleId
      ? updateBusinessRuleAction.bind(null, ruleId)
      : createBusinessRuleAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [registries, setRegistries] = useState<Registry[]>(initialRegistries);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  function addRegistry() {
    if (!newId.trim() || !newLabel.trim()) return;
    if (registries.some((r) => r.id === newId.trim())) return;
    setRegistries((prev) => [
      ...prev,
      { id: newId.trim(), label: newLabel.trim(), required: newRequired },
    ]);
    setNewId("");
    setNewLabel("");
    setNewRequired(true);
  }
  function removeRegistry(id: string) {
    setRegistries((prev) => prev.filter((r) => r.id !== id));
  }
  function toggleRequired(id: string) {
    setRegistries((prev) => prev.map((r) => (r.id === id ? { ...r, required: !r.required } : r)));
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ruleType" value="ppp_attestation_required_registries" />
      <input type="hidden" name="jurisdictionCountry" value={country} />
      <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
      <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Lista de registros oficiales en los que el dueño debe registrar (atestar) a su mascota PPP.
        Marcá required en los obligatorios.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Registros configurados
        </legend>
        {registries.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            Aún no agregaste registros. Sin registros la regla equivale al default (ninguno
            requerido).
          </p>
        )}
        {registries.map((r, i) => (
          <div
            key={r.id}
            className="flex items-start gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
          >
            <input type="hidden" name="registryId" value={r.id} />
            <input type="hidden" name="registryLabel" value={r.label} />
            <input type="hidden" name="registryRequired" value={r.required ? "true" : "false"} />
            <div className="flex-1 text-sm">
              <p className="font-medium text-neutral-900 dark:text-neutral-50">{r.label}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500">
                <span className="font-mono">{r.id}</span> · {r.required ? "Required" : "Optional"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleRequired(r.id)}
              className="text-xs underline underline-offset-4 text-neutral-700 dark:text-neutral-300"
            >
              {r.required ? "Hacer opcional" : "Marcar required"}
            </button>
            <button
              type="button"
              onClick={() => removeRegistry(r.id)}
              className="text-xs underline underline-offset-4 text-red-600 dark:text-red-400"
            >
              Quitar
            </button>
            {/* defeat unused-var lint */}
            <input type="hidden" value={i} />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-3">
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          Agregar registro
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="ID (caba_4078, prov_14107…)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
          <input
            type="text"
            placeholder="Label visible"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={() => setNewRequired((v) => !v)}
            />
            Required
          </label>
        </div>
        <button
          type="button"
          onClick={addRegistry}
          className="text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4"
        >
          + Agregar registro
        </button>
      </fieldset>

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
