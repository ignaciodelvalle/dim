"use client";

import { type UpgradeFormState, createClinicAction } from "@/app/actions/upgrade";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useActionState } from "react";

const initialState: UpgradeFormState = { error: null };

export function CrearConsultorioForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createClinicAction, initialState);

  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-2">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Antes de crear tu consultorio, verificá tu DNI.
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
        label="Nombre del consultorio"
        hint="Nombre público que verán los dueños de mascotas."
        defaultValue={defaultName}
        required
      />
      <Field
        id="legalName"
        name="legalName"
        type="text"
        label="Razón social"
        hint="Nombre legal completo (puede ser el mismo que el nombre del consultorio)."
        defaultValue={defaultName}
        required
      />

      <Field id="email" name="email" type="email" label="Correo electrónico de contacto" required />
      <Field
        id="cuit"
        name="cuit"
        type="text"
        label="CUIT (opcional)"
        hint="11 dígitos sin guiones. Ej: 20712345679"
      />
      <Field id="phone" name="phone" type="tel" label="Teléfono (opcional)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="jurisdictionProvince"
          name="jurisdictionProvince"
          type="text"
          label="Provincia"
          hint="Provincia donde ejercés."
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
        {pending ? "Creando consultorio..." : "Crear consultorio"}
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
  defaultValue,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={inputClass}
      />
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}
