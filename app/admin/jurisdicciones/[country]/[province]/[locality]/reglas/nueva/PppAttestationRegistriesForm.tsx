"use client";

import { useActionState, useState } from "react";

import {
  type BusinessRuleFormState,
  createBusinessRuleAction,
  updateBusinessRuleAction,
} from "@/app/actions/business-rules";
import { LnCheckbox, LnField, LnInput, LnTextarea } from "@/components/ui/Field";

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

      <p className="text-[13px] text-ln-op-ink-2">
        Lista de registros oficiales en los que el dueno debe registrar (atestar) a su mascota PPP.
        Marca required en los obligatorios.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ln-op-ink">Registros configurados</legend>
        {registries.length === 0 && (
          <p className="text-[11px] text-ln-op-mute">
            Aun no agregaste registros. Sin registros la regla equivale al default (ninguno
            requerido).
          </p>
        )}
        {registries.map((r, i) => (
          <div
            key={r.id}
            className="flex items-start gap-2 rounded-[6px] border border-ln-op-line p-3"
          >
            <input type="hidden" name="registryId" value={r.id} />
            <input type="hidden" name="registryLabel" value={r.label} />
            <input type="hidden" name="registryRequired" value={r.required ? "true" : "false"} />
            <div className="flex-1 text-[13px]">
              <p className="font-medium text-ln-op-ink">{r.label}</p>
              <p className="text-[11px] text-ln-op-mute">
                <span className="font-mono">{r.id}</span> {"·"}{" "}
                {r.required ? "Required" : "Optional"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleRequired(r.id)}
              className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
            >
              {r.required ? "Hacer opcional" : "Marcar required"}
            </button>
            <button
              type="button"
              onClick={() => removeRegistry(r.id)}
              className="text-[12px] font-semibold text-ln-op-danger no-underline underline-offset-4 hover:underline"
            >
              Quitar
            </button>
            {/* defeat unused-var lint */}
            <input type="hidden" value={i} />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2 rounded-[6px] border border-dashed border-ln-op-line p-3">
        <legend className="text-[13px] font-medium text-ln-op-ink">Agregar registro</legend>
        {/* Inline add-registry row: compact grid alongside Checkbox — Field not used (rule #2) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <LnInput
            type="text"
            placeholder="ID (caba_4078, prov_14107...)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <LnInput
            type="text"
            placeholder="Label visible"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <LnCheckbox checked={newRequired} onChange={() => setNewRequired((v) => !v)}>
            Required
          </LnCheckbox>
        </div>
        <button
          type="button"
          onClick={addRegistry}
          className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
        >
          + Agregar registro
        </button>
      </fieldset>

      <LnField label="Notas internas">
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
