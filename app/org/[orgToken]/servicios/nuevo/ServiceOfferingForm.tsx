"use client";

// Client component for the new service offering form.
// Selecting a service_kind auto-fills duration and species defaults from
// the SERVICE_KINDS catalog passed down from the server component.

import type { ServiceOfferingFormState } from "@/app/actions/service-offerings";
import type { ServiceKindDef } from "@/lib/service-kinds";
import { useActionState } from "react";

const INITIAL_STATE: ServiceOfferingFormState = { error: null };

export function ServiceOfferingForm({
  serviceKinds,
  createAction,
  orgToken,
}: {
  serviceKinds: readonly ServiceKindDef[];
  createAction: (
    prev: ServiceOfferingFormState,
    formData: FormData,
  ) => Promise<ServiceOfferingFormState>;
  orgToken: string;
}) {
  const [state, formAction, isPending] = useActionState(createAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p className="text-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      {/* Service kind */}
      <div className="space-y-1">
        <label htmlFor="serviceKind" className="block text-sm font-medium">
          Tipo de servicio <span className="text-red-500">*</span>
        </label>
        <select
          id="serviceKind"
          name="serviceKind"
          required
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
        >
          <option value="">— Seleccioná un tipo —</option>
          {serviceKinds.map((k) => (
            <option key={k.code} value={k.code}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {/* Display name */}
      <div className="space-y-1">
        <label htmlFor="displayName" className="block text-sm font-medium">
          Nombre del servicio <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          minLength={3}
          maxLength={120}
          placeholder="Ej: Vacunación antirrábica — campaña junio 2026"
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-medium">
          Descripción <span className="text-neutral-400 font-normal">(opcional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={500}
          rows={3}
          placeholder="Información adicional para quienes reserven el turno."
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500 resize-none"
        />
      </div>

      {/* Duration + capacity row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="durationMinutes" className="block text-sm font-medium">
            Duración (minutos) <span className="text-red-500">*</span>
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            required
            min={5}
            max={480}
            defaultValue={15}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="slotCapacity" className="block text-sm font-medium">
            Capacidad por turno <span className="text-red-500">*</span>
          </label>
          <input
            id="slotCapacity"
            name="slotCapacity"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={1}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
          />
        </div>
      </div>

      {/* Price */}
      <div className="space-y-1">
        <label htmlFor="priceArs" className="block text-sm font-medium">
          Precio (ARS){" "}
          <span className="text-neutral-400 font-normal">— dejá vacío para campaña gratuita</span>
        </label>
        <input
          id="priceArs"
          name="priceArs"
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
        />
      </div>

      {/* Eligibility species */}
      <div className="space-y-1">
        <span className="block text-sm font-medium">Especies elegibles</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="eligibilitySpecies" value="dog" defaultChecked />
            Perros
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="eligibilitySpecies" value="cat" defaultChecked />
            Gatos
          </label>
        </div>
      </div>

      {/* Eligibility age range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="eligibilityAgeMinMonths" className="block text-sm font-medium">
            Edad mínima (meses) <span className="text-neutral-400 font-normal">(opcional)</span>
          </label>
          <input
            id="eligibilityAgeMinMonths"
            name="eligibilityAgeMinMonths"
            type="number"
            min={0}
            max={360}
            placeholder="Sin mínimo"
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="eligibilityAgeMaxMonths" className="block text-sm font-medium">
            Edad máxima (meses) <span className="text-neutral-400 font-normal">(opcional)</span>
          </label>
          <input
            id="eligibilityAgeMaxMonths"
            name="eligibilityAgeMaxMonths"
            type="number"
            min={0}
            max={360}
            placeholder="Sin máximo"
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm disabled:opacity-50"
        >
          {isPending ? "Enviando…" : "Enviar para aprobación"}
        </button>
        <a
          href={`/org/${orgToken}/servicios`}
          className="text-sm text-neutral-600 underline dark:text-neutral-400"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
