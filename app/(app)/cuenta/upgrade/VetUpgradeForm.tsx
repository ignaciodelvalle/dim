"use client";

import { useActionState } from "react";

import { type UpgradeFormState, requestVetUpgradeAction } from "@/app/actions/upgrade";

const initialState: UpgradeFormState = { error: null };

export function VetUpgradeForm() {
  const [state, formAction, pending] = useActionState(requestVetUpgradeAction, initialState);

  if (state.ok) {
    return (
      <p className="text-sm rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Solicitud enviada — pendiente de revisión por el equipo de MiMAR.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field
        id="matriculaNumber"
        name="matriculaNumber"
        type="text"
        label="Número de matrícula"
        hint="Tal como figura en tu credencial profesional. Ej: MN-12345"
        required
      />
      <Field
        id="matriculaJurisdiccion"
        name="matriculaJurisdiccion"
        type="text"
        label="Provincia de la matrícula"
        hint="Dónde fue emitida tu matrícula. Ej: CABA, Buenos Aires, Córdoba"
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="operationalProvince"
          name="operationalProvince"
          type="text"
          label="Provincia donde ejercés"
          hint="Si es la misma que la matrícula, repetila."
          required
        />
        <Field
          id="operationalLocality"
          name="operationalLocality"
          type="text"
          label="Localidad"
          hint="Ej: Palermo, San Isidro, Pilar."
          required
        />
      </div>
      <Field
        id="especialidad"
        name="especialidad"
        type="text"
        label="Especialidad (opcional)"
        hint="Ej: Clínica, cirugía, exóticos."
      />
      <Field
        id="anosExperiencia"
        name="anosExperiencia"
        type="number"
        label="Años de experiencia (opcional)"
        inputMode="numeric"
      />

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Enviando solicitud..." : "Enviar solicitud de verificación"}
      </button>
    </form>
  );
}

function Field({
  id,
  name,
  type,
  label,
  required,
  hint,
  inputMode,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  hint?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
