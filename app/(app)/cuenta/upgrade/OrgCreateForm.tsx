"use client";

import { useActionState } from "react";

import { type UpgradeFormState, createOrganizationAction } from "@/app/actions/upgrade";
import { LocationFields } from "@/components/LocationFields";
import { LnField, LnInput, LnSelect } from "@/components/ui/Field";

const initialState: UpgradeFormState = { error: null };

// sanitary_authority is a government classification — self-registration is blocked
// both here (UI) and server-side in createOrganizationForUser. Govt orgs are
// provisioned out-of-band by platform admins.
const ORG_TYPE_OPTIONS = [
  { value: "shelter", label: "Refugio / albergue" },
  { value: "rescue_network", label: "Red de rescate" },
  { value: "clinic", label: "Clínica veterinaria" },
  { value: "other", label: "Otro" },
] as const;

export function OrgCreateForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  // Prerequisite missing: render CTA card instead of the form + generic error.
  if (state.missingPrereq === "dni" && state.prereqUrl) {
    return (
      <div className="rounded-[4px] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-050)] p-4 space-y-2">
        <p className="text-sm font-medium text-[var(--color-ln-warn)]">
          Antes de crear una organización, verificá tu DNI.
        </p>
        <p className="text-xs text-[var(--color-ln-warn)]">
          MiMAR requiere que tu identidad esté verificada para crear una organización.
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
      <LnField
        label="Nombre de la organización"
        required
        hint="Nombre público que verán los demás usuarios."
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="name"
            type="text"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField
        label="Razón social"
        required
        hint="Nombre legal completo (ej: Asoc. Civil Refugio El Campito)."
      >
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="legalName"
            type="text"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Tipo de organización" required>
        {({ id, describedBy, invalid }) => (
          <LnSelect
            id={id}
            name="orgType"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          >
            <option value="">Seleccioná un tipo</option>
            {ORG_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </LnSelect>
        )}
      </LnField>

      <LnField label="Correo electrónico de contacto" required>
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="email"
            type="email"
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="CUIT" hint="11 dígitos sin guiones. Ej: 30712345678">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="cuit"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      <LnField label="Teléfono">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="phone"
            type="tel"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

      {/* Jurisdiction — L1 (province + locality) per AGENTS.md "Design rules"
            rule #1. LocationFields submits `provinceCode` and `localityName`;
            the createOrganizationAction reads those keys plus the legacy
            `jurisdictionProvince` / `jurisdictionLocality` aliases for
            backward compatibility. */}
      <div className="space-y-1">
        <p className="block mb-2.5 text-[0.88em] font-semibold text-[var(--color-ln-mute)]">
          Jurisdicción
        </p>
        <p className="text-xs text-[var(--color-ln-mute)] mb-2">
          Para enrutar la verificación al govt correspondiente.
        </p>
        <LocationFields mode="l1" />
      </div>

      <LnField label="Número de personería jurídica">
        {({ id, describedBy, invalid }) => (
          <LnInput
            id={id}
            name="personeriaJuridicaNumber"
            type="text"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </LnField>

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
        {pending ? "Creando organización..." : "Crear organización"}
      </button>
    </form>
  );
}
