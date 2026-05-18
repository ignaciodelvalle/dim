"use client";

import { type UpgradeFormState, createOrganizationAction } from "@/app/actions/upgrade";
import { useActionState } from "react";

const initialState: UpgradeFormState = { error: null };

const ORG_TYPE_OPTIONS = [
  { value: "shelter", label: "Refugio / albergue" },
  { value: "rescue_network", label: "Red de rescate" },
  { value: "clinic", label: "Clínica veterinaria" },
  { value: "sanitary_authority", label: "Autoridad sanitaria" },
  { value: "other", label: "Otro" },
] as const;

export function OrgCreateForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  // Prerequisite missing: render CTA card instead of the form + generic error.
  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-2">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Antes de crear una organización, verificá tu DNI.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          MiMAR requiere que tu identidad esté verificada para crear una organización.
        </p>
        <a
          href={state.prereqUrl}
          className="inline-block mt-1 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-sm font-medium transition-colors"
        >
          Verificar DNI →
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field
        id="name"
        name="name"
        type="text"
        label="Nombre de la organización"
        hint="Nombre público que verán los demás usuarios."
        required
      />
      <Field
        id="legalName"
        name="legalName"
        type="text"
        label="Razón social"
        hint="Nombre legal completo (ej: Asoc. Civil Refugio El Campito)."
        required
      />

      <div className="space-y-1.5">
        <label
          htmlFor="orgType"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
          Tipo de organización
        </label>
        <select
          id="orgType"
          name="orgType"
          required
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        >
          <option value="">Seleccioná un tipo</option>
          {ORG_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <Field id="email" name="email" type="email" label="Correo electrónico de contacto" required />
      <Field
        id="cuit"
        name="cuit"
        type="text"
        label="CUIT (opcional)"
        hint="11 dígitos sin guiones. Ej: 30712345678"
      />
      <Field id="phone" name="phone" type="tel" label="Teléfono (opcional)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="jurisdictionProvince"
          name="jurisdictionProvince"
          type="text"
          label="Provincia"
          hint="Para enrutar la verificación al govt correspondiente."
          required
        />
        <Field
          id="jurisdictionLocality"
          name="jurisdictionLocality"
          type="text"
          label="Localidad"
          required
        />
      </div>
      <Field
        id="personeriaJuridicaNumber"
        name="personeriaJuridicaNumber"
        type="text"
        label="Número de personería jurídica (opcional)"
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
        {pending ? "Creando organización..." : "Crear organización"}
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
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  hint?: string;
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
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
