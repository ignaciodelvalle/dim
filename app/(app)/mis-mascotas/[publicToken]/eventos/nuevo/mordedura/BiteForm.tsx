"use client";

import { useActionState, useState } from "react";

import type { BiteFormState } from "@/app/actions/bite";
import { LocationFields } from "@/components/LocationFields";
import { Checkbox } from "@/components/poncho";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

const initialState: BiteFormState = { error: null };

type FormAction = (prev: BiteFormState, formData: FormData) => Promise<BiteFormState>;

export function BiteForm({
  action,
  petName,
}: {
  action: FormAction;
  petName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);
  const [victimKind, setVictimKind] = useState<"human" | "animal" | "unknown">("human");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />
      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha del incidente<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          max={today}
          defaultValue={today}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="locationDescription" className={labelClass}>
          Lugar
        </label>
        <input
          id="locationDescription"
          name="locationDescription"
          type="text"
          placeholder="Ej: Plaza Italia, esquina Cerviño"
          className={inputClass}
        />
      </div>

      <details className="rounded-lg border border-gob-border  p-3">
        <summary className="text-sm font-medium text-gob-text-gray  cursor-pointer">
          Provincia y localidad (opcional)
        </summary>
        <div className="mt-3">
          <LocationFields mode="l1" />
        </div>
      </details>

      <div className="space-y-1.5">
        <p className={labelClass}>
          ¿A quién mordió {petName}?<span className="text-gob-danger ml-0.5">*</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "human", label: "Persona" },
              { value: "animal", label: "Otro animal" },
              { value: "unknown", label: "No sé" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                victimKind === opt.value
                  ? "border-gob-border-strong bg-gob-surface-alt  "
                  : "border-gob-border-strong "
              }`}
            >
              <input
                type="radio"
                name="victimKind"
                value={opt.value}
                checked={victimKind === opt.value}
                onChange={() => setVictimKind(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {victimKind === "human" && (
        <div className="rounded-xl border border-gob-border  p-4 space-y-3 bg-gob-surface-alt ">
          <p className="text-xs text-gob-text-gray ">
            Estos datos quedan en el registro para denuncia obligatoria si la autoridad sanitaria
            los pide. Opcionales.
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="victimContactName"
              className="text-xs uppercase tracking-wider text-gob-text-muted"
            >
              Nombre de la persona
            </label>
            <input
              id="victimContactName"
              name="victimContactName"
              type="text"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="victimContactPhone"
              className="text-xs uppercase tracking-wider text-gob-text-muted"
            >
              Teléfono
            </label>
            <input
              id="victimContactPhone"
              name="victimContactPhone"
              type="tel"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="victimAgeEstimate"
              className="text-xs uppercase tracking-wider text-gob-text-muted"
            >
              Edad aproximada
            </label>
            <input
              id="victimAgeEstimate"
              name="victimAgeEstimate"
              type="text"
              placeholder="Ej: niño, adulto, mayor"
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="severity" className={labelClass}>
          Severidad<span className="text-gob-danger ml-0.5">*</span>
        </label>
        <select id="severity" name="severity" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Elegí una opción
          </option>
          <option value="minor">Leve — sin sangrado, rasguño</option>
          <option value="moderate">Moderada — sangrado, requiere atención</option>
          <option value="severe">Grave — heridas profundas, hospital</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="context" className={labelClass}>
          Contexto
        </label>
        <textarea
          id="context"
          name="context"
          rows={3}
          placeholder="Ej: estaba jugando con el perro del vecino y se asustó cuando lo abrazaron."
          className={inputClass}
        />
      </div>

      <div className="rounded-xl border border-gob-warning  bg-gob-warning/10  p-4 space-y-2">
        <Checkbox name="confirmObservation" required labelClassName="text-gob-warning-text!">
          Entiendo que reportar esto inicia un período de observación antirrábica obligatorio de 10
          días por ley (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987).
        </Checkbox>
      </div>

      {state.error && (
        <p className="text-sm text-gob-danger " role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Reportando..." : "Reportar mordedura"}
      </button>
    </form>
  );
}
