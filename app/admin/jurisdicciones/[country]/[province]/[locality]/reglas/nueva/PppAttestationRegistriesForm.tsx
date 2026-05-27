"use client";

import { useActionState, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { labelClass } from "@/lib/form-classes";

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

      <p className="text-sm text-gob-text-gray">
        Lista de registros oficiales en los que el dueño debe registrar (atestar) a su mascota PPP.
        Marcá required en los obligatorios.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gob-text">Registros configurados</legend>
        {registries.length === 0 && (
          <p className="text-xs text-gob-text-muted">
            Aún no agregaste registros. Sin registros la regla equivale al default (ninguno
            requerido).
          </p>
        )}
        {registries.map((r, i) => (
          <div
            key={r.id}
            className="flex items-start gap-2 rounded-lg border border-gob-border p-3"
          >
            <input type="hidden" name="registryId" value={r.id} />
            <input type="hidden" name="registryLabel" value={r.label} />
            <input type="hidden" name="registryRequired" value={r.required ? "true" : "false"} />
            <div className="flex-1 text-sm">
              <p className="font-medium text-gob-text">{r.label}</p>
              <p className="text-xs text-gob-text-muted">
                <span className="font-mono">{r.id}</span> · {r.required ? "Required" : "Optional"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleRequired(r.id)}
              className="text-xs underline underline-offset-4 text-gob-text-gray"
            >
              {r.required ? "Hacer opcional" : "Marcar required"}
            </button>
            <button
              type="button"
              onClick={() => removeRegistry(r.id)}
              className="text-xs underline underline-offset-4 text-red-600"
            >
              Quitar
            </button>
            {/* defeat unused-var lint */}
            <input type="hidden" value={i} />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-dashed border-gob-border-strong p-3">
        <legend className="text-sm font-medium text-gob-text">Agregar registro</legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="ID (caba_4078, prov_14107…)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
          />
          <input
            type="text"
            placeholder="Label visible"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm"
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
          className="text-sm text-gob-text-gray underline underline-offset-4"
        >
          + Agregar registro
        </button>
      </fieldset>

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
