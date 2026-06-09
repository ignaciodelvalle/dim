"use client";

import { useActionState } from "react";

import { type UpgradeFormState, requestVetUpgradeAction } from "@/app/actions/upgrade";
import { LnInput } from "@/components/ui/Field";

const initialState: UpgradeFormState = { error: null };

export function VetUpgradeForm() {
  const [state, formAction, pending] = useActionState(requestVetUpgradeAction, initialState);

  if (state.ok) {
    return (
      <p className="text-sm rounded-[4px] border border-[var(--color-ln-warn)] bg-[#fdf2e0] px-3 py-2 text-[var(--color-ln-warn)]">
        Solicitud enviada — pendiente de revisión por el equipo de MiMAR.
      </p>
    );
  }

  // Prerequisite missing: render CTA card instead of the form + generic error.
  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-[4px] border border-[var(--color-ln-warn)] bg-[#fdf2e0] p-4 space-y-2">
        <p className="text-sm font-medium text-[var(--color-ln-warn)]">
          Antes de enviar tu solicitud, verificá tu DNI.
        </p>
        <p className="text-xs text-[var(--color-ln-warn)]">
          MiMAR requiere que tu identidad esté verificada para procesar solicitudes de rol
          profesional.
        </p>
        <a
          href={state.prereqUrl}
          className="inline-block mt-1 px-4 py-2 rounded-[3px] bg-[var(--color-ln-warn)] text-white text-sm font-medium hover:opacity-90 transition-colors"
        >
          Verificar DNI →
        </a>
      </div>
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
        <p className="text-sm text-[var(--color-ln-err)]" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 rounded-[3px] bg-[var(--color-ln-azul)] text-white font-medium hover:bg-[var(--color-ln-azul-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-ln-ink)]">
        {label}
      </label>
      <LnInput id={id} name={name} type={type} required={required} inputMode={inputMode} />
      {hint && <p className="text-xs text-[var(--color-ln-mute)]">{hint}</p>}
    </div>
  );
}
