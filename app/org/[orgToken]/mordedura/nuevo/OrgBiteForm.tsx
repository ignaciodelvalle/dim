"use client";

import { useActionState, useState } from "react";

import type { ReportBiteFromOrgFormState } from "@/app/actions/bite";

const initialState: ReportBiteFromOrgFormState = { error: null };

type FormAction = (
  prev: ReportBiteFromOrgFormState,
  formData: FormData,
) => Promise<ReportBiteFromOrgFormState>;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";
const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

export function OrgBiteForm({ action }: { action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const [victimKind, setVictimKind] = useState<"human" | "animal" | "unknown">("human");

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="petPublicToken" className={labelClass}>
          Token público de la mascota<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="petPublicToken"
          name="petPublicToken"
          type="text"
          required
          placeholder="DIM-XXXX-XXXX"
          className={`${inputClass} font-mono uppercase tracking-wider`}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          El dueño tiene este token en la credencial pública (escaneable o en su perfil).
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="occurredAt" className={labelClass}>
          Fecha del incidente<span className="text-red-500 ml-0.5">*</span>
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

      <div className="space-y-1.5">
        <p className={labelClass}>
          Tipo de víctima<span className="text-red-500 ml-0.5">*</span>
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
                  ? "border-neutral-900 bg-neutral-50 dark:border-neutral-50 dark:bg-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
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
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3 bg-neutral-50 dark:bg-neutral-900/30">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Datos de contacto opcionales — para denuncia obligatoria a autoridad sanitaria si
            corresponde.
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="victimContactName"
              className="text-xs uppercase tracking-wider text-neutral-500"
            >
              Nombre
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
              className="text-xs uppercase tracking-wider text-neutral-500"
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
              className="text-xs uppercase tracking-wider text-neutral-500"
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
          Severidad<span className="text-red-500 ml-0.5">*</span>
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
        <label htmlFor="injuriesSummary" className={labelClass}>
          Resumen clínico de las heridas
        </label>
        <textarea
          id="injuriesSummary"
          name="injuriesSummary"
          rows={2}
          placeholder="Ej: laceración profunda en antebrazo izquierdo, requirió sutura."
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="vetInvolved"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600"
          />
          <span className="text-sm text-neutral-900 dark:text-neutral-50">
            Intervino un profesional veterinario en el incidente o atención posterior.
          </span>
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="context" className={labelClass}>
          Contexto adicional
        </label>
        <textarea
          id="context"
          name="context"
          rows={3}
          placeholder="Ej: el animal estaba suelto sin correa en plaza pública, sin dueño identificado al momento."
          className={inputClass}
        />
      </div>

      <div className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="confirmObservation"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600 text-amber-600 focus:ring-amber-600"
          />
          <span className="text-sm text-amber-900 dark:text-amber-200">
            Entiendo que esto inicia un período de observación antirrábica obligatorio de 10 días
            (Decreto 4669/1973 PBA, Ord. CABA 41.831/1987) y se notifica al dueño y a la autoridad
            sanitaria correspondiente.
          </span>
        </label>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-3 rounded-lg bg-amber-600 dark:bg-amber-500 text-white font-medium hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Reportando..." : "Reportar mordedura"}
      </button>
    </form>
  );
}
