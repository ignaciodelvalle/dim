"use client";

import { useActionState, useState } from "react";

import { type UpgradeFormState, requestVetUpgradeAction } from "@/app/actions/upgrade";
import { LocationFields } from "@/components/LocationFields";
import { LnInput } from "@/components/ui/Field";

const initialState: UpgradeFormState = { error: null };

// DNI_PREREQ_URL: canonical ?next= pattern so the user lands back here after
// declaring their DNI. Kept here so it matches the server-action value exactly.
const DNI_PREREQ_URL = "/cuenta/verificar-dni?next=/cuenta/upgrade";

type Props = {
  /**
   * Whether the current user has already declared their DNI.
   * Passed from the server page — checked before rendering the form so the
   * requirement is visible BEFORE the user fills any fields.
   */
  dniVerified: boolean;
};

export function VetUpgradeForm({ dniVerified }: Props) {
  const [state, formAction, pending] = useActionState(requestVetUpgradeAction, initialState);

  // Controlled field values — preserved across server-side validation errors so
  // the user doesn't lose what they typed when e.g. the matrícula format fails.
  const [matriculaNumber, setMatriculaNumber] = useState("");
  const [matriculaJurisdiccion, setMatriculaJurisdiccion] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [anosExperiencia, setAnosExperiencia] = useState("");

  if (state.ok) {
    return (
      <p className="text-sm rounded-[4px] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-050)] px-3 py-2 text-[var(--color-ln-warn)]">
        Solicitud enviada — pendiente de revisión por el equipo de MiMAR.
      </p>
    );
  }

  // Show requirement UP FRONT: if DNI is not declared, gate the form entirely.
  // The server action also checks this, but surfacing it here avoids making the
  // user fill the form only to discover the blocker on submit.
  const missingDni = !dniVerified || (state.missingPrereq === "dni" && Boolean(state.prereqUrl));

  if (missingDni) {
    return (
      <div className="space-y-3">
        {/* Requirements panel */}
        <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
            Requisitos para convertirte en profesional
          </p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-center gap-2 text-[13px] text-[var(--color-ln-ink-2)]">
              {/* X — not met */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-[var(--color-ln-err)]"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              DNI declarado
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="rounded-[4px] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-050)] p-4 space-y-2">
          <p className="text-sm font-medium text-[var(--color-ln-warn)]">
            Antes de enviar tu solicitud, declará tu DNI.
          </p>
          <p className="text-xs text-[var(--color-ln-warn)]">
            MiMAR requiere que declares tu DNI antes de procesar solicitudes de rol profesional.
          </p>
          <a
            href={state.prereqUrl ?? DNI_PREREQ_URL}
            className="inline-block mt-1 px-4 py-2 rounded-[3px] bg-[var(--color-ln-warn)] text-white text-sm font-medium hover:opacity-90 transition-colors"
          >
            Declarar DNI →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Requirements met indicator */}
      <div className="rounded-[4px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
          Requisitos para convertirte en profesional
        </p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-center gap-2 text-[13px] text-[var(--color-ln-ink-2)]">
            {/* Checkmark — met */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[var(--color-ln-ok)]"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            DNI declarado
          </li>
        </ul>
      </div>

      <form action={formAction} className="space-y-4">
        <Field
          id="matriculaNumber"
          name="matriculaNumber"
          type="text"
          label="Número de matrícula"
          hint="Tal como figura en tu credencial profesional. Ej: MN-12345"
          required
          value={matriculaNumber}
          onChange={(e) => setMatriculaNumber(e.target.value)}
        />
        <Field
          id="matriculaJurisdiccion"
          name="matriculaJurisdiccion"
          type="text"
          label="Provincia de la matrícula"
          hint="Dónde fue emitida tu matrícula. Ej: CABA, Buenos Aires, Córdoba"
          required
          value={matriculaJurisdiccion}
          onChange={(e) => setMatriculaJurisdiccion(e.target.value)}
        />
        <div className="space-y-1.5">
          <p className="block text-sm font-medium text-[var(--color-ln-ink)]">
            Localidad donde ejercés
          </p>
          <LocationFields mode="l1" />
          <p className="text-xs text-[var(--color-ln-mute)]">
            Para enrutar tu verificación al gobierno correspondiente. Requerido.
          </p>
        </div>
        <Field
          id="especialidad"
          name="especialidad"
          type="text"
          label="Especialidad (opcional)"
          hint="Ej: Clínica, cirugía, exóticos."
          value={especialidad}
          onChange={(e) => setEspecialidad(e.target.value)}
        />
        <Field
          id="anosExperiencia"
          name="anosExperiencia"
          type="number"
          label="Años de experiencia (opcional)"
          inputMode="numeric"
          value={anosExperiencia}
          onChange={(e) => setAnosExperiencia(e.target.value)}
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
    </div>
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
  value,
  onChange,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  hint?: string;
  inputMode?: "numeric" | "text";
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--color-ln-ink)]">
        {label}
      </label>
      <LnInput
        id={id}
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={onChange}
      />
      {hint && <p className="text-xs text-[var(--color-ln-mute)]">{hint}</p>}
    </div>
  );
}
